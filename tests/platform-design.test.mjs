import assert from 'node:assert/strict';
import test from 'node:test';
import { levels } from '../levels.mjs';
import { platformDesign } from '../platform-design.mjs';

test('every platform has its own rendered construction finish and brace layout', () => {
  const pieces = levels.flatMap(({ platforms }) => platforms);
  const designs = new Set();
  for (const piece of pieces) {
    assert(Number.isInteger(piece.designSeed), 'every surface, including stairs and flags, needs a design seed');
    const signature = JSON.stringify(platformDesign(piece.designSeed));
    assert(!designs.has(signature), 'two platforms render the same construction blueprint');
    designs.add(signature);
  }
  assert.equal(designs.size, pieces.length);
});
