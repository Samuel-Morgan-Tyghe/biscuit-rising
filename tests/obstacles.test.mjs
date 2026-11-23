import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { landingPoint, levels, platformSurface } from '../engine.mjs';
import { obstacleMeshes } from '../obstacle-meshes.mjs';
import { obstacleModels } from '../obstacles.mjs';

test('every bundled obstacle has solid geometry and a guide on its visible landing surface', async () => {
  const platforms = levels.flatMap((level) => level.platforms.filter((platform) => platform.obstacle));
  const used = new Set(platforms.map((platform) => platform.obstacle));
  assert.deepEqual(used, new Set(Object.keys(obstacleModels)));

  for (const platform of platforms) {
    assert.equal(platform.mesh, obstacleMeshes[platform.obstacle]);
    assert(platform.mesh.indices.length > 0);
    assert.equal(platform.mesh.indices.length % 3, 0);
    if (platform.obstacle === 'firetruck' || platform.obstacle === 'delivery-van') {
      assert(platform.thickness >= Math.max(platform.w, platform.d) * .32);
    }
    const { x, y, z } = landingPoint(platform);
    assert.equal(platformSurface(platform, x, z), y);
    if (platform.obstacle === 'gear') {
      assert.equal(platformSurface(platform, platform.x + platform.w / 2, platform.z + platform.d / 2), null);
    }
  }

  for (const model of used) {
    const asset = await readFile(new URL(`../assets/obstacles/${model}.glb`, import.meta.url));
    assert.equal(asset.subarray(0, 4).toString(), 'glTF');
  }
});
