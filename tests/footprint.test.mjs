import assert from "node:assert/strict";
import test from "node:test";
import { createGame, landingPoint, platformPosition, platformSurface, PLAYER_HEIGHT, step } from "../engine.mjs";

const diamond = [[-.5, 0], [0, -.5], [.5, 0], [0, .5]];
const round = Array.from({ length: 16 }, (_, index) => {
  const angle = -index * Math.PI / 8;
  return [.5 * Math.cos(angle), .5 * Math.sin(angle)];
});

function gameWithHull(footprint, player, kind = "stone", parts) {
  const game = createGame();
  const platform = { x: 250, y: 200, z: 250, w: 100, d: 100, thickness: 20, footprint, kind, colliders: parts };
  game.level = { ...game.level, platforms: [platform], goal: { x: 950, y: 450, z: 950 } };
  Object.assign(game.player, { grounded: null, ...player });
  return { game, platform, player: game.player };
}

test("convex decks catch a fast fall on top while leaving cut corners open", () => {
  for (const footprint of [diamond, round]) {
    const onTop = gameWithHull(footprint, { x: 300, y: 350, z: 300, vy: -940 });
    step(onTop.game, {}, .26);
    assert.equal(onTop.player.y, onTop.platform.y);
    assert.equal(onTop.player.grounded, onTop.platform);

    const inCorner = gameWithHull(footprint, { x: 351, y: 350, z: 351, vy: -940 });
    step(inCorner.game, {}, .26);
    assert(inCorner.player.y < inCorner.platform.y);
    assert.equal(inCorner.player.grounded, null);
  }
});

test("a convex deck blocks upward boosts only below its footprint", () => {
  const ceiling = 200 - 20 - PLAYER_HEIGHT;
  const below = gameWithHull(diamond, { x: 300, y: ceiling - 8, z: 300, vy: 754 });
  step(below.game, {}, .15);
  assert.equal(below.player.y, ceiling);
  assert.equal(below.player.vy, 0);

  const clear = gameWithHull(diamond, { x: 351, y: ceiling - 8, z: 351, vy: 754 });
  step(clear.game, {}, .15);
  assert(clear.player.y > clear.platform.y);
});

test("a diagonal side clips normal movement and preserves tangential slide", () => {
  const { game, player } = gameWithHull(diamond, { x: 380, y: 190, z: 345, vx: -900 });
  step(game, { left: true }, .1);
  assert(Math.abs(player.x + player.z - 676) < 1e-7);
  assert(Math.abs(player.vx + player.vz) < 1e-7);
  assert(player.z > 350);
  assert(player.vz > 0);
});

test("a moving polygon carries the climber across both axes", () => {
  const { game, player, platform } = gameWithHull(diamond, {}, "moving");
  const start = platformPosition(platform, 0);
  const end = platformPosition(platform, .1);
  Object.assign(player, { x: start.x + 50, y: start.y, z: start.z + 50, grounded: platform });
  step(game, {}, .1);
  assert.equal(player.grounded, platform);
  assert(Math.abs(player.x - end.x - 50) < 1e-7);
  assert(Math.abs(player.z - end.z - 50) < 1e-7);
});

const ring = [
  { x: 0, z: 0, w: .2, d: 1, top: 1, bottom: 0 },
  { x: .8, z: 0, w: .2, d: 1, top: 1, bottom: 0 },
  { x: .2, z: 0, w: .6, d: .2, top: 1, bottom: 0 },
  { x: .2, z: .8, w: .6, d: .2, top: .6, bottom: 0 },
];

test("an opening has air through the full model, with solid rim collision", () => {
  const centre = gameWithHull(round, { x: 300, y: 350, z: 300, vy: -940 }, "stone", ring);
  step(centre.game, {}, .26);
  assert(centre.player.y < 180);
  assert.equal(centre.player.grounded, null);
  assert.equal(platformSurface(centre.platform, 300, 300), null);
  const fallback = landingPoint(centre.platform);
  assert.equal(platformSurface(centre.platform, fallback.x, fallback.z), fallback.y);
  assert.notDeepEqual(fallback, { x: 300, y: 200, z: 300 });

  const beginning = { x: 300, y: 130, z: 300, vy: 754 };
  const through = gameWithHull(round, beginning, "stone", ring);
  step(through.game, {}, .15);
  assert(through.player.y > through.platform.y);

  const rim = gameWithHull(round, { x: 300, y: 350, z: 340, vy: -940 }, "stone", ring);
  step(rim.game, {}, .26);
  assert.equal(rim.player.grounded, rim.platform);
  assert.equal(rim.game.lastPlatform, rim.platform);
  assert.equal(rim.player.y, 192);
  assert.equal(platformSurface(rim.platform, 300, 340), rim.player.y);
  rim.platform.landing = [.5, .9];
  assert.deepEqual(landingPoint(rim.platform), { x: 300, y: 192, z: 340 });
});

test("moving rim parts carry the climber with the model rather than the part offset", () => {
  const { game, player, platform } = gameWithHull(round, {}, "moving", ring);
  const start = platformPosition(platform, 0);
  const end = platformPosition(platform, .1);
  Object.assign(player, { x: start.x + 50, y: start.y - 8, z: start.z + 90, grounded: platform });
  step(game, {}, .1);
  assert.equal(player.grounded, platform);
  assert(Math.abs(player.x - end.x - 50) < 1e-7);
  assert(Math.abs(player.z - end.z - 90) < 1e-7);
  assert.equal(player.y, end.y - 8);
});

test("walking between nearby top heights on one model does not require a jump", () => {
  const parts = [
    { x: 0, z: 0, w: .5, d: 1, top: .75, bottom: 0 },
    { x: .5, z: 0, w: .5, d: 1, top: 1, bottom: 0 },
  ];
  const { game, player, platform } = gameWithHull(undefined, { x: 275, y: 195, z: 300 }, "stone", parts);
  player.grounded = platform;
  for (let frame = 0; frame < 25; frame += 1) step(game, { right: true }, 1 / 120);
  assert.equal(player.grounded, platform);
  assert.equal(player.y, 200);
  assert(player.x > 315);

  for (let frame = 0; frame < 41; frame += 1) step(game, { left: true }, 1 / 120);
  assert.equal(player.grounded, platform);
  assert.equal(player.y, 195);
  assert(player.x < 287);
});
