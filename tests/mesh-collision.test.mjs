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

const rectangle = (left, right, near, far, y) => [[left, y, near], [left, y, far], [right, y, far], [right, y, near]];
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

test('an unsupported boot pair falls through where a shoulder would catch from above', () => {
  const mesh = compile([rectangle(0, .42, .2, .8, 1), rectangle(.58, 1, .2, .8, 1)]);
  const lower = { y: 0, z: 0, height: 5, halfWidth: 2.5, halfDepth: 4, boot: true };
  const boots = [{ ...lower, x: -4 }, { ...lower, x: 4 }];
  const body = { x: 0, y: 16, z: 0, height: 10, halfWidth: 12, halfDepth: 6 };
  const drop = { x: 0, y: -100, z: 0 };
  const origin = { x: 50, y: 225, z: 50 };
  const accept = (normal, segment) => segment.boot || normal.y < .4;
  assert.equal(sweepMesh(mesh, origin, drop, 1, [...boots, body]).segment, body);
  assert.equal(sweepMesh(mesh, origin, drop, 1, [...boots, body], accept), null);
  assert.equal(meshSupport(mesh, { ...origin, y: 200 }, .01, boots), null);

  const landing = sweepMesh(mesh, { ...origin, x: 44 }, drop, 1, [...boots, body], accept);
  assert.equal(landing.segment, boots[0]);
  close(origin.y + drop.y * landing.time, 200);
  close(meshSupport(mesh, { ...origin, x: 44, y: 200 }, .01, boots), 200);
  const posedBelowSurface = { ...origin, x: 44, y: 198.5 };
  assert(meshIntersectsBody(mesh, posedBelowSurface, .001, boots));
  assert.equal(meshSupport(mesh, posedBelowSurface, .01, boots), null);
  close(meshSupport(mesh, posedBelowSurface, .01, boots, 2), 200);
});

test('a rotated convex boot rejects the extra corners of its world bounding box', () => {
  const mesh = compile([rectangle(.566, .574, .566, .574, 1)],
    { quarterTurn: true, d: 80 });
  const avatar = { x: 50, y: 230, z: 27.4 };
  const down = { x: 0, y: -60, z: 0 };
  const boot = { x: 0, y: 0, z: 0, halfWidth: 6, halfDepth: 6, height: 5, yaw: Math.PI / 4 };
  assert(sweepMesh(mesh, avatar, down));
  assert.equal(sweepMesh(mesh, avatar, down, 1, [boot]), null);
  assert.equal(meshIntersectsBody(mesh, { ...avatar, y: 199 }, .001, [boot]), false);
  const planted = { x: 54, y: 199, z: 31 };
  assert(sweepMesh(mesh, { ...planted, y: 230 }, down, 1, [boot]));
  assert.equal(meshIntersectsBody(mesh, planted, .001, [boot]), true);
});

test('a pose-supplied convex and its yaw move the entire shape about the foot origin', () => {
  const toe = { vertices: [[6, 0, 0], [12, 0, 0], [6, 0, 5], [6, 3, 0]],
    normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 6, 1 / 3, 1 / 5]],
    edges: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-6, 0, 5], [-6, 3, 0], [0, 3, -5]],
    yaw: Math.PI / 2 };
  const mesh = compile([rectangle(.50, .53, .39, .42, 1)]);
  const avatar = { x: 50, y: 230, z: 50 };
  const down = { x: 0, y: -60, z: 0 };
  assert.equal(sweepMesh(mesh, avatar, down, 1, [{ ...toe, yaw: 0 }]), null);
  const hit = sweepMesh(mesh, avatar, down, 1, [toe]);
  assert.equal(hit.segment, toe);
  close(hit.time, .5);
});
