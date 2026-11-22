import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createGame, LEVEL_COUNT, platformPosition, platformTop, PLAYER_DEPTH, PLAYER_HEIGHT, PLAYER_WIDTH, step, triggerGiftInteraction } from '../engine.mjs';
import { GIFT_SLOTS, giftInteractionsForLevel, giftMappingsForLevel } from '../level-gifts.mjs';
import { createTikFinity, DEFAULT_GIFTS } from '../tikfinity.mjs';

const assignments = Array.from({ length: LEVEL_COUNT }, (_, index) => giftMappingsForLevel(DEFAULT_GIFTS, index));
const interactions = assignments.map((_, index) => giftInteractionsForLevel(index));

test('each of the 50 levels changes every named gift assignment across 10 slots', () => {
  const names = Object.values(DEFAULT_GIFTS).sort();

  assert.equal(GIFT_SLOTS.length, 10);
  assert.deepEqual(assignments[0], { ...DEFAULT_GIFTS, drift: '', surge: '', echo: '' });
  assert.equal(new Set(assignments.map((mapping) => JSON.stringify(mapping))).size, 50);

  for (const [index, mapping] of assignments.entries()) {
    assert.deepEqual(Object.values(mapping).filter(Boolean).sort(), names);
    if (index > 0) {
      for (const effect of Object.keys(mapping)) {
        if (mapping[effect]) assert.notEqual(mapping[effect], assignments[index - 1][effect], `Level ${index + 1}: ${effect}`);
      }
    }
  }
});

test('all 500 recipe action sequences and titles are distinct', () => {
  const all = interactions.flat();
  assert.equal(all.length, 500);
  assert.equal(new Set(all.map(({ recipe }) => JSON.stringify(recipe))).size, 500);
  assert.equal(new Set(all.map(({ name }) => name)).size, 500);

  for (const [index, level] of interactions.entries()) {
    assert.deepEqual(level.map(({ id }) => id), GIFT_SLOTS, `Level ${index + 1} slots`);
    assert(level.every(({ recipe: { actions } }) => actions.length >= 2
      && actions[0].delay === 0
      && actions.at(-1).delay > 0));
  }
});

test('all recipes produce different observable gameplay traces from the same spawn', () => {
  const hashes = new Map();
  for (const { name, recipe } of interactions.flat()) {
    const game = createGame();
    const hash = createHash('sha256');
    triggerGiftInteraction(game, recipe);
    for (let frame = 0; frame < 360; frame += 1) {
      step(game, { right: frame % 90 > 56, back: frame % 91 > 67, jump: frame % 71 === 38 }, 1 / 60);
      const { player, dragon, effects } = game;
      hash.update(JSON.stringify([
        ...[player.x, player.y, player.z, player.vx, player.vy, player.vz].map(value => Math.round(value * 1000)),
        dragon ? [Math.round(dragon.x * 1000), dragon.phase, dragon.hit] : null,
        ...Object.values(effects).map(seconds => seconds > 0),
      ]));
    }
    const signature = hash.digest('hex');
    assert(!hashes.has(signature), `${name} duplicates ${hashes.get(signature)}`);
    hashes.set(signature, name);
  }
  assert.equal(hashes.size, 500);
});

test('one recipe starts a ten-second levitation', () => {
  const game = createGame(1);
  const { recipe } = interactions[1].find(({ id }) => id === 'float');
  assert(triggerGiftInteraction(game, recipe));
  assert.equal(game.effects.float, 10);
});

test('custom names and disabled positions rotate while the saved base stays intact', () => {
  const base = Object.freeze({ ...DEFAULT_GIFTS, dragon: 'Paper Crane', slippery: '  ', drift: 'Galaxy' });
  const mapping = giftMappingsForLevel(base, 1);
  assert.equal(mapping.echo, 'Paper Crane');
  assert.equal(mapping.bounce, 'Galaxy');
  assert.equal(mapping.dragon, '');
  assert.equal(base.dragon, 'Paper Crane');
  assert.equal(base.slippery, '  ');
});

test('level assignments and a newly configured slot resolve on the same TikFinity socket', () => {
  let socket;
  class Socket extends EventTarget {
    constructor() {
      super();
      socket = this;
    }
  }
  const receipts = [];
  const client = createTikFinity({ effectIds: GIFT_SLOTS, WebSocketClass: Socket,
    onGift: (receipt) => receipts.push(receipt) });
  client.connect();
  const send = (giftName) => socket.dispatchEvent(new MessageEvent('message', {
    data: JSON.stringify({ event: 'gift', data: { giftName, giftType: 2 } }),
  }));

  client.setMappings(assignments[0]);
  send('Rose');
  client.setMappings(giftMappingsForLevel({ ...DEFAULT_GIFTS, surge: 'Galaxy' }, 0));
  send('Galaxy');
  client.setMappings(assignments[1]);
  send('Rose');

  assert.deepEqual(receipts.map(({ effect, giftName }) => [effect, giftName]), [
    ['dragon', 'Rose'], ['surge', 'Galaxy'], ['echo', 'Rose'],
  ]);
});

test('delayed actions have a real effect at their scheduled time and stop at a stage finish', () => {
  const game = createGame();
  const { recipe } = interactions[0].find(({ id }) => id === 'dragon');
  assert.equal(triggerGiftInteraction(game, recipe), true);
  assert(game.dragon);
  assert.equal(game.effects.slippery, 0);
  for (let frame = 0; frame < 24; frame += 1) step(game, {}, 1 / 120);
  assert.equal(game.effects.slippery, 0);
  for (let frame = 0; frame < 24; frame += 1) step(game, {}, 1 / 120);
  assert(game.effects.slippery > 0);
  assert.equal(game.giftQueue.length, 0);

  game.levelComplete = true;
  assert.equal(triggerGiftInteraction(game, recipe), false);
  assert.equal(game.giftQueue.length, 0);
});

function overlapsSolid(game, platform) {
  const { player } = game;
  const solid = platformPosition(platform, game.time);
  const left = Math.max(solid.x, player.x - PLAYER_WIDTH / 2);
  const right = Math.min(solid.x + solid.w, player.x + PLAYER_WIDTH / 2);
  const near = Math.max(solid.z, player.z - PLAYER_DEPTH / 2);
  const far = Math.min(solid.z + solid.d, player.z + PLAYER_DEPTH / 2);
  if (right - left <= 1e-5 || far - near <= 1e-5) return false;
  const heights = [platformTop(solid, left, near), platformTop(solid, right, far)];
  return Math.max(...heights) - player.y > 1e-5
    && player.y + PLAYER_HEIGHT - (Math.min(...heights) - solid.thickness) > 1e-5;
}

test('all 500 recipes run through the solid collision engine without penetration or stale pulses', () => {
  for (const [index, level] of interactions.entries()) {
    for (const { id, recipe } of level) {
      const game = createGame(index);
      assert(triggerGiftInteraction(game, recipe));
      for (let frame = 0; frame < 180; frame += 1) {
        step(game, { right: frame % 53 < 20, back: frame % 41 < 15, jump: frame % 49 === 16 }, 1 / 60);
        assert(!game.level.platforms.some((platform) => overlapsSolid(game, platform)), `Level ${index + 1} ${id}: frame ${frame}`);
      }
      assert.equal(game.giftQueue.length, 0);
      assert([game.player.x, game.player.y, game.player.z].every(Number.isFinite));
    }
  }
});

test('repeat gift bursts bound the delayed-action queue and let it drain', () => {
  const game = createGame(2);
  const { recipe } = interactions[2].find(({ id }) => id === 'echo');
  for (let receipt = 0; receipt < 300; receipt += 1) triggerGiftInteraction(game, recipe);
  assert(game.giftQueue.length <= 64);
  for (let frame = 0; frame < 240; frame += 1) step(game, {}, 1 / 60);
  assert.equal(game.giftQueue.length, 0);
});
