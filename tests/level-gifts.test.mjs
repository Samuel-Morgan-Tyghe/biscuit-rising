import assert from 'node:assert/strict';
import { test } from 'node:test';
import { giftMappingsForLevel } from '../level-gifts.mjs';
import { createTikFinity, DEFAULT_GIFTS } from '../tikfinity.mjs';

test('each of the 50 levels has a unique gift mapping and every gift changes between levels', () => {
  const levels = Array.from({ length: 50 }, (_, index) => giftMappingsForLevel(DEFAULT_GIFTS, index));
  const names = Object.values(DEFAULT_GIFTS).sort();

  assert.deepEqual(levels[0], DEFAULT_GIFTS);
  assert.equal(new Set(levels.map((mapping) => JSON.stringify(mapping))).size, levels.length);

  for (const [index, mapping] of levels.entries()) {
    assert.deepEqual(Object.values(mapping).sort(), names);
    if (index > 0) {
      for (const effect of Object.keys(mapping)) {
        assert.notEqual(mapping[effect], levels[index - 1][effect], `Level ${index + 1}: ${effect}`);
      }
    }
  }
});

test('custom names and disabled slots rotate while the saved base stays intact', () => {
  const base = Object.freeze({ ...DEFAULT_GIFTS, dragon: 'Paper Crane', slippery: '  ' });
  const mapping = giftMappingsForLevel(base, 1);
  assert.equal(mapping.bounce, 'Paper Crane');
  assert.equal(mapping.dragon, '');
  assert.equal(base.dragon, 'Paper Crane');
  assert.equal(base.slippery, '  ');
});

test('a gift arriving over the same TikFinity connection uses the active level mapping', () => {
  let socket;
  class Socket extends EventTarget {
    constructor() {
      super();
      socket = this;
    }
  }
  const receipts = [];
  const client = createTikFinity({ WebSocketClass: Socket, onGift: (receipt) => receipts.push(receipt) });
  client.connect();
  const sendRose = () => socket.dispatchEvent(new MessageEvent('message', {
    data: JSON.stringify({ event: 'gift', data: { giftName: 'Rose', giftType: 2 } }),
  }));

  client.setMappings(giftMappingsForLevel(DEFAULT_GIFTS, 0));
  sendRose();
  client.setMappings(giftMappingsForLevel(DEFAULT_GIFTS, 1));
  sendRose();

  assert.deepEqual(receipts.map(({ effect, giftName }) => [effect, giftName]), [
    ['dragon', 'Rose'],
    ['bounce', 'Rose'],
  ]);
});
