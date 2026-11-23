import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMeshCollider, meshIntersectsBody, meshSupport, meshSurface, sweepMesh } from '../mesh-collision.mjs';

const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6, `${actual} differs from ${expected}`);

function compile(faces, options = {}) {
  const positions = [];
  const indices = [];
  for (const face of faces) {
    const first = positions.length / 3;
    positions.push(...face.flat());
    for (let index = 1; index < face.length - 1; index += 1) indices.push(first, first + index, first + index + 1);
  }
  return buildMeshCollider({
    x: 0, y: 200, z: 0, w: 100, thickness: 50, d: 100, mesh: { positions, indices }, ...options,
  }, [13, 43, 13]);
}

const rectangle = (left, right, near, far, y) => [[left, y, near], [right, y, near], [right, y, far], [left, y, far]];
const ramp = [[0, .25, 0], [1, .75, 0], [1, .75, 1], [0, .25, 1]];

test('swept body catches fast motion from above and below at the exact nonuniform slope', () => {
  const mesh = compile([ramp]);
  const down = sweepMesh(mesh, { x: 50, y: 220, z: 50 }, { x: 0, y: -100, z: 0 });
  close(220 - 100 * down.time, 178.25);
  close(down.normal.x / down.normal.y, -.25);
  assert(down.normal.y > 0);

  const up = sweepMesh(mesh, { x: 50, y: 100, z: 50 }, { x: 0, y: 120, z: 0 });
  close(100 + 120 * up.time + 43, 171.75);
  assert(up.normal.y < 0);
  assert(up.normal.x > 0);
  assert.equal(sweepMesh(mesh, { x: 50, y: 220, z: 50 }, { x: 0, y: -100, z: 0 }, .3), null);
});

test('a ring has no hidden top, but its inner vertical edge stops a body sweep', () => {
  const mesh = compile([
    rectangle(0, .25, 0, 1, 1),
    rectangle(.75, 1, 0, 1, 1),
    rectangle(.25, .75, 0, .25, 1),
    rectangle(.25, .75, .75, 1, 1),
    [[.75, 0, .25], [.75, 1, .25], [.75, 1, .75], [.75, 0, .75]],
  ]);
  assert.equal(meshSurface(mesh, 50, 50), null);
  close(meshSurface(mesh, 20, 50), 200);
  assert.equal(sweepMesh(mesh, { x: 50, y: 230, z: 50 }, { x: 0, y: -110, z: 0 }), null);
  const hit = sweepMesh(mesh, { x: 50, y: 160, z: 50 }, { x: 35, y: 0, z: 0 });
  close(50 + 35 * hit.time, 62);
  close(hit.normal.x, -1);
});

test('a stationary body with exact standing contact has support and no penetration', () => {
  const mesh = compile([ramp]);
  const player = { x: 50, y: 178.25, z: 50 };
  close(meshSupport(mesh, player), player.y);
  assert.equal(meshSupport(mesh, { ...player, y: player.y + 2 }), null);
  close(meshSupport(mesh, { ...player, y: player.y + 2 }, 3), player.y);
  assert.equal(meshIntersectsBody(mesh, player), false);
  assert.equal(meshIntersectsBody(mesh, { ...player, y: player.y - .25 }), true);
});

test('quarter-turn keeps exactly matching surface heights and rotates contact normals', () => {
  const mesh = compile([ramp], { x: 200, z: 350, quarterTurn: true, d: 80 });
  close(meshSurface(mesh, 220, 370), 181.25);
  const hit = sweepMesh(mesh, { x: 220, y: 220, z: 370 }, { x: 0, y: -50, z: 0 });
  close(220 - 50 * hit.time, 185.3125);
  close(hit.normal.z / hit.normal.y, .3125);
  close(hit.normal.x, 0);
});

test('point queries select the highest face below the ray origin, preserving air between surfaces', () => {
  const mesh = compile([rectangle(0, 1, 0, 1, .1), rectangle(0, 1, 0, 1, .8)]);
  close(meshSurface(mesh, 50, 50), 190);
  close(meshSurface(mesh, 50, 50, 170), 155);
  assert.equal(meshSurface(mesh, 50, 50, 154.99), null);
  assert.equal(meshSurface(mesh, -1, 50), null);
});
