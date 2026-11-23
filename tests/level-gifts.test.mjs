import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createGame, LEVEL_COUNT, platformPosition, platformTop, PLAYER_DEPTH, PLAYER_HEIGHT, PLAYER_WIDTH, step, triggerGiftInteraction } from '../engine.mjs';
import { buildMeshCollider, meshIntersectsBody } from '../mesh-collision.mjs';
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

test('all 500 named recipes contain exactly one distinct mechanic', () => {
  const all = interactions.flat();
  assert.equal(all.length, 500);
  assert.equal(new Set(all.map(({ recipe }) => JSON.stringify(recipe))).size, 500);
  assert.equal(new Set(all.map(({ name }) => name)).size, 500);
  assert.equal(new Set(all.map(({ key }) => key)).size, 500);
  const counts = new Map();
  for (const { family } of all) counts.set(family, (counts.get(family) ?? 0) + 1);
  assert.equal(counts.size, 25);
  assert([...counts.values()].every(count => count === 20));

  for (const [index, level] of interactions.entries()) {
    assert.deepEqual(level.map(({ id }) => id), GIFT_SLOTS, `Level ${index + 1} slots`);
    assert(level.every(({ recipe }) => ['effect', 'impulse'].includes(recipe.kind)
      && !Object.hasOwn(recipe, 'delay')
      && !Object.hasOwn(recipe, 'actions')));
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
      const { player, dragon, effects, soundCue } = game;
      hash.update(JSON.stringify([
        ...[player.x, player.y, player.z, player.vx, player.vy, player.vz].map(value => Math.round(value * 1000)),
        dragon ? [Math.round(dragon.x * 1000), dragon.phase, dragon.hit] : null,
        ...Object.values(effects).map(seconds => seconds > 0),
        effects.sound > 0 ? [soundCue.power, soundCue.pan] : null,
      ]));
    }
    const signature = hash.digest('hex');
    assert(!hashes.has(signature), `${name} duplicates ${hashes.get(signature)}`);
    hashes.set(signature, name);
  }
  assert.equal(hashes.size, 500);
});

test('one recipe starts a ten-second levitation', () => {
  const game = createGame();
  const { recipe } = interactions[0].find(({ family }) => family === 'float');
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

test('perspective lock and mute start immediately, expire and do not alter player physics', () => {
  for (const [family, seconds, gift] of [['perspective', 2, 'Cap'], ['mute', 2.4, 'TikTok']]) {
    const game = createGame();
    const baseline = createGame();
    const { id, recipe } = interactions[0].find(item => item.family === family);
    assert.equal(assignments[0][id], gift);
    assert(triggerGiftInteraction(game, recipe));
    assert.equal(game.effects[family], seconds);
    for (let frame = 0; frame <= (seconds + .1) * 120; frame += 1) {
      const input = { back: frame < 90, jump: frame === 42 };
      step(game, input, 1 / 120);
      step(baseline, input, 1 / 120);
    }
    assert.equal(game.effects[family], 0);
    assert.deepEqual(game.player, baseline.player);
    game.levelComplete = true;
    assert.equal(triggerGiftInteraction(game, recipe), false);
  }
});

test('the phantom dragon gift cues fresh audio without spawning a dragon or altering motion', () => {
  const game = createGame();
  const baseline = createGame();
  const { id, recipe } = interactions[0].find(({ family }) => family === 'sound');
  assert.equal(assignments[0][id], 'Perfume');
  assert(triggerGiftInteraction(game, recipe));
  const cue = game.soundCue;
  assert.deepEqual(cue, { kind: 'dragon', seconds: recipe.seconds, power: recipe.power, pan: recipe.pan });
  assert.equal(game.effects.sound, 1.2);
  assert(triggerGiftInteraction(game, recipe));
  assert.notEqual(game.soundCue, cue);
  for (let frame = 0; frame < 180; frame += 1) {
    step(game, { back: true }, 1 / 120);
    step(baseline, { back: true }, 1 / 120);
  }
  assert.equal(game.effects.sound, 0);
  assert.equal(game.dragon, null);
  assert.deepEqual(game.player, baseline.player);
});

test('a direction lock masks one movement input while leaving the alternative and yaw intact', () => {
  const { id, recipe } = interactions[1].find(({ family }) => family === 'directionLock');
  assert.equal(assignments[1][id], 'Rose');
  assert.equal(recipe.direction, 'left');
  const game = createGame(1);
  const baseline = createGame(1);
  const start = game.player.z;
  assert(triggerGiftInteraction(game, recipe));
  assert.equal(game.lockedDirection, 'left');

  for (let frame = 0; frame < 10; frame += 1) {
    step(game, { left: true, yaw: Math.PI / 2 }, 1 / 120);
    step(baseline, { left: true, yaw: Math.PI / 2 }, 1 / 120);
  }
  assert.equal(game.player.z, start);
  assert(baseline.player.z > start);

  for (let frame = 0; frame < 10; frame += 1) step(game, { right: true, yaw: Math.PI / 2 }, 1 / 120);
  assert(game.player.z < start);
  for (let frame = 0; frame < 260; frame += 1) step(game, {}, 1 / 120);
  assert.equal(game.effects.directionLock, 0);
  assert.equal(game.lockedDirection, null);
  const before = game.player.z;
  step(game, { left: true, yaw: Math.PI / 2 }, 1 / 120);
  assert(game.player.z > before);
});

function clipsFootprint(solid, left, right, near, far) {
  let polygon = solid.footprint.map(([x, z]) => [solid.x + (.5 + x) * solid.w, solid.z + (.5 + z) * solid.d]);
  for (const [axis, boundary, sign] of [[0, left, 1], [0, right, -1], [1, near, 1], [1, far, -1]]) {
    const clipped = [];
    let previous = polygon.at(-1);
    for (const point of polygon) {
      const distanceBefore = sign * (previous[axis] - boundary);
      const distanceAfter = sign * (point[axis] - boundary);
      if ((distanceBefore < 0) !== (distanceAfter < 0)) {
        const fraction = distanceBefore / (distanceBefore - distanceAfter);
        clipped.push(previous.map((coordinate, dimension) => coordinate + fraction * (point[dimension] - coordinate)));
      }
      if (distanceAfter >= 0) clipped.push(point);
      previous = point;
    }
    polygon = clipped;
    if (polygon.length < 3) return false;
  }
  const twiceArea = polygon.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = polygon[(index + 1) % polygon.length];
    return sum + x * nextZ - z * nextX;
  }, 0);
  return Math.abs(twiceArea) > 1e-5;
}

const meshFixtures = new WeakMap();

function overlapsSolid(game, platform) {
  const parent = platformPosition(platform, game.time);
  if (!platform.mesh) return overlapsPiece(game.player, parent);
  if (!meshFixtures.has(platform)) {
    meshFixtures.set(platform, buildMeshCollider(
      { ...platform, x: 0, y: 0, z: 0 },
      [PLAYER_WIDTH / 2, PLAYER_HEIGHT, PLAYER_DEPTH / 2],
    ));
  }
  const { player } = game;
  return meshIntersectsBody(meshFixtures.get(platform), {
    x: player.x - parent.x, y: player.y - parent.y, z: player.z - parent.z,
  });
}

function overlapsPiece(player, solid) {
  const left = Math.max(solid.x, player.x - PLAYER_WIDTH / 2);
  const right = Math.min(solid.x + solid.w, player.x + PLAYER_WIDTH / 2);
  const near = Math.max(solid.z, player.z - PLAYER_DEPTH / 2);
  const far = Math.min(solid.z + solid.d, player.z + PLAYER_DEPTH / 2);
  if (right - left <= 1e-5 || far - near <= 1e-5) return false;
  const heights = [platformTop(solid, left, near), platformTop(solid, right, far)];
  return Math.max(...heights) - player.y > 1e-5
    && player.y + PLAYER_HEIGHT - (Math.min(...heights) - solid.thickness) > 1e-5
    && (!solid.footprint || solid.slope || clipsFootprint(solid, left, right, near, far));
}

test('all 500 recipes run through the solid collision engine without penetration', () => {
  for (const [index, level] of interactions.entries()) {
    for (const { id, recipe } of level) {
      const game = createGame(index);
      assert(triggerGiftInteraction(game, recipe));
      for (let frame = 0; frame < 180; frame += 1) {
        step(game, { right: frame % 53 < 20, back: frame % 41 < 15, jump: frame % 49 === 16 }, 1 / 60);
        assert(!game.level.platforms.some((platform) => overlapsSolid(game, platform)), `Level ${index + 1} ${id}: frame ${frame}`);
      }
      assert([game.player.x, game.player.y, game.player.z].every(Number.isFinite));
    }
  }
});
