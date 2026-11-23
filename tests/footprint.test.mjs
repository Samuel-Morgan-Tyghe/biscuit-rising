import assert from "node:assert/strict";
import test from "node:test";
import { createGame, platformPosition, PLAYER_HEIGHT, step } from "../engine.mjs";

const diamond = [[-.5, 0], [0, -.5], [.5, 0], [0, .5]];
const round = Array.from({ length: 16 }, (_, index) => {
  const angle = -index * Math.PI / 8;
  return [.5 * Math.cos(angle), .5 * Math.sin(angle)];
});

function gameWithHull(footprint, player, kind = "stone", mesh) {
  const game = createGame();
  const platform = { x: 250, y: 200, z: 250, w: 100, d: 100, thickness: 20, footprint, kind, mesh };
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

const triangularLedge = {
  positions: Float32Array.of(0, 1, 0, 0, 1, 1, 1, 1, 0),
  indices: Uint16Array.of(0, 1, 2),
};

test("a narrow visible corner supports only an overlapping climber", () => {
  const overlap = gameWithHull(undefined, { x: 312.99, y: 350, z: 312.99, vy: -940 }, "stone", triangularLedge);
  step(overlap.game, {}, .26);
  assert.equal(overlap.player.y, 200);
  assert.equal(overlap.player.grounded, overlap.platform);

  const outside = gameWithHull(undefined, { x: 313.01, y: 350, z: 313.01, vy: -940 }, "stone", triangularLedge);
  step(outside.game, {}, .26);
  assert(outside.player.y < 180);
  assert.equal(outside.player.grounded, null);
});

test("a moving mesh carries the climber with the object", () => {
  const { game, player, platform } = gameWithHull(undefined, {}, "moving", triangularLedge);
  const start = platformPosition(platform, 0);
  const end = platformPosition(platform, .1);
  Object.assign(player, { x: start.x + 25, y: start.y, z: start.z + 25, grounded: platform });
  step(game, {}, .1);
  assert.equal(player.grounded, platform);
  assert(Math.abs(player.x - end.x - 25) < 1e-7);
  assert(Math.abs(player.z - end.z - 25) < 1e-7);
  assert.equal(player.y, end.y);
});
