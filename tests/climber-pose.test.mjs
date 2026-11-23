import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceClimberPose, createClimberPose } from '../climber-pose.mjs';
import { createGame, step } from '../engine.mjs';

function dropOnEdge(facing, overlap) {
  const game = createGame();
  const edge = { x: 350, z: 350, y: 100, w: 150, d: 250, thickness: 16, kind: 'floor', designSeed: 1 };
  game.level = { ...game.level, platforms: [edge], goal: { x: 850, z: 850, y: 800 } };
  const { player } = game;
  Object.assign(player, { y: 220, z: 470, vx: 0, vy: -940, vz: 0, grounded: null, pose: createClimberPose(facing) });
  advanceClimberPose(player, 0);
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const leftmostBoot = Math.min(...player.pose.boots.flatMap(({ vertices }) =>
    vertices.map(([x, , z]) => x * cos + z * sin)));
  player.x = edge.x + edge.w - leftmostBoot - overlap;
  // Use one substep with enough vertical travel to distinguish landing from a near miss.
  player.pose.clip = 'idle';
  step(game, {}, .22);
  return { player, edge };
}

test('the animated boots land on a visible edge and fall when both clear it', () => {
  for (const facing of [0, .34, Math.PI / 2, 2.2]) {
    const clip = dropOnEdge(facing, .22);
    assert.equal(clip.player.grounded, clip.edge, `boot overlapping edge at heading ${facing}`);

    const miss = dropOnEdge(facing, -.22);
    assert.equal(miss.player.grounded, null, `boots clearing edge at heading ${facing}`);
    assert(miss.player.y < miss.edge.y - 10);
  }
});
