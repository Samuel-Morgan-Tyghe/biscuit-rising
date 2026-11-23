import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRandomGifts } from '../random-gifts.mjs';

test('random gifts are off by default and turning them off cancels the countdown', () => {
  const gifts = createRandomGifts(['dragon'], () => 0);
  assert.equal(gifts.next(600, false), null);
  gifts.setEnabled(true, 600);
  assert.equal(gifts.next(619.99, false), null);
  gifts.setEnabled(false, 619.99);
  assert.equal(gifts.next(620, false), null);
  gifts.setEnabled(true, 628);
  assert.equal(gifts.next(647.99, false), null);
  assert.equal(gifts.next(648, false), 'dragon');
});

test('random gifts pick a slot and reschedule from the current game time', () => {
  const values = [.5, .9, .75, 0, 0];
  const gifts = createRandomGifts(['dragon', 'boost', 'echo'], () => values.shift());
  gifts.setEnabled(true, 10);
  assert.equal(gifts.next(37.49, false), null);
  assert.equal(gifts.next(37.5, false), 'echo');
  assert.equal(gifts.next(70.99, false), null);
  assert.equal(gifts.next(71, false), 'dragon');
});

test('a completed level cannot fire a random gift and entering a level resets the clock', () => {
  const gifts = createRandomGifts(['dragon'], () => 0);
  gifts.setEnabled(true, 0);
  assert.equal(gifts.next(30, true), null);
  gifts.reset(0);
  assert.equal(gifts.next(19.99, false), null);
  assert.equal(gifts.next(20, false), 'dragon');
});
