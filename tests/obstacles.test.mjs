import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { levels } from '../levels.mjs';
import { containsFootprint, obstacleModels } from '../obstacles.mjs';

test('the course uses every bundled obstacle with a convex, non-rectangular landing', async () => {
  const platforms = levels.flatMap((level) => level.platforms.filter((platform) => platform.obstacle));
  const used = new Set(platforms.map((platform) => platform.obstacle));
  assert.deepEqual(used, new Set(Object.keys(obstacleModels)));

  for (const platform of platforms) {
    const { footprint, x, z, w, d } = platform;
    assert(footprint.length > 4);
    if (platform.obstacle === 'firetruck' || platform.obstacle === 'delivery-van') {
      assert(platform.thickness >= Math.max(w, d) * .32);
    }
    assert(containsFootprint(platform, x + w / 2, z + d / 2));
    assert(!containsFootprint(platform, x, z));
    for (const [index, [ax, az]] of footprint.entries()) {
      const [bx, bz] = footprint[(index + 1) % footprint.length];
      const [cx, cz] = footprint[(index + 2) % footprint.length];
      assert((bx - ax) * (cz - bz) - (bz - az) * (cx - bx) > 0);
    }
  }

  for (const model of used) {
    const asset = await readFile(new URL(`../assets/obstacles/${model}.glb`, import.meta.url));
    assert.equal(asset.subarray(0, 4).toString(), 'glTF');
  }
});
