import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTikFinity, DEFAULT_GIFTS, TIKFINITY_URL } from '../tikfinity.mjs';

function fixture() {
  const sockets = [];
  const gifts = [];
  const observed = [];
  const statuses = [];
  class Socket extends EventTarget {
    constructor(url) {
      super();
      assert.equal(url, TIKFINITY_URL);
      sockets.push(this);
    }

    close() { this.dispatchEvent(new Event('close')); }

    gift(data) {
      this.message(JSON.stringify({ event: 'gift', data }));
    }

    message(data) {
      this.dispatchEvent(new MessageEvent('message', { data }));
    }
  }
  const connection = createTikFinity({
    WebSocketClass: Socket,
    onGift: receipt => gifts.push(receipt),
    onSeenGift: receipt => observed.push(receipt),
    onStatus: status => statuses.push(status),
  });
  return { connection, sockets, gifts, observed, statuses };
}

test('a TikFinity gift streak triggers one effect on its final message', () => {
  const { connection, sockets, gifts } = fixture();
  connection.connect();
  const [socket] = sockets;
  const streak = { giftName: 'Rose', nickname: 'Sam', giftType: 1, msgId: '93000000000000001' };
  socket.gift({ ...streak, repeatCount: 1, repeatEnd: false });
  socket.gift({ ...streak, repeatCount: 2, repeatEnd: false });
  assert.deepEqual(gifts, []);
  socket.gift({ ...streak, repeatCount: 3, repeatEnd: true });
  socket.gift({ ...streak, repeatCount: 3, repeatEnd: true });
  assert.deepEqual(gifts, [{ effect: 'dragon', giftName: 'Rose', sender: 'Sam', count: 3, simulated: false }]);
});

test('normalises gift names, supports nested receipts and observes unknown gifts', () => {
  const { connection, sockets, observed, gifts } = fixture();
  connection.setMappings({ flip: '  PAPER CRANE ' });
  connection.connect();
  const [socket] = sockets;
  socket.message('unparseable');
  socket.message(JSON.stringify({ event: 'chat', data: { giftName: 'Paper Crane' } }));
  socket.gift({ giftName: 'Unmapped gift', giftType: 2 });
  socket.gift({ gift: { name: 'Paper Crane', type: 1 }, user: { displayId: 'Sam' }, repeatEnd: 1 });
  assert.equal(observed.length, 2);
  assert.equal(observed[0].giftName, 'Unmapped gift');
  assert.deepEqual(gifts, [{ effect: 'flip', giftName: 'Paper Crane', sender: 'Sam', count: 1, simulated: false }]);
});

test('the offline simulator uses the same gift mapping for every effect', () => {
  const { connection, gifts, sockets } = fixture();
  Object.keys(DEFAULT_GIFTS).forEach(effect => assert.equal(connection.simulate(effect), true));
  assert.deepEqual(gifts.map(receipt => receipt.effect), Object.keys(DEFAULT_GIFTS));
  assert.ok(gifts.every(receipt => receipt.simulated));
  assert.equal(sockets.length, 0);
  connection.setMappings({ dragon: '' });
  assert.equal(connection.simulate('dragon'), false);
  assert.equal(connection.simulate('unknown'), false);
});

test('handles connection loss, manual retry and stale socket events', () => {
  const { connection, sockets, statuses, gifts } = fixture();
  connection.connect();
  connection.connect();
  assert.equal(sockets.length, 1);
  sockets[0].dispatchEvent(new Event('error'));
  connection.connect();
  sockets[0].gift({ giftName: 'Rose', giftType: 2 });
  sockets[1].dispatchEvent(new Event('open'));
  sockets[1].gift({ giftName: 'Rose', giftType: 2 });
  connection.disconnect();
  assert.deepEqual(statuses, ['connecting', 'disconnected', 'connecting', 'connected', 'offline']);
  assert.equal(gifts.length, 1);
});
