export const TIKFINITY_URL = 'ws://localhost:21213/';

export const DEFAULT_GIFTS = Object.freeze({
  dragon: 'Rose',
  slippery: 'Ice Cream Cone',
  boost: 'Heart Me',
  float: 'Finger Heart',
  flip: 'Cap',
  gust: 'Perfume',
  bounce: 'TikTok',
});

function label(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function decodeGift(message) {
  if (typeof message !== 'string') return null;
  let packet;
  try {
    packet = JSON.parse(message);
  } catch {
    return null;
  }
  if (packet?.event !== 'gift' || !packet.data || typeof packet.data !== 'object') return null;

  const data = packet.data;
  const giftType = data.giftType ?? data.giftDetails?.giftType ?? data.gift?.type;
  const repeatEnd = data.repeatEnd === true || data.repeatEnd === 1 || data.repeatEnd === '1';
  if ((giftType === 1 || giftType === '1') && !repeatEnd) return null;

  const giftName = label(data.giftName) || label(data.giftDetails?.giftName) || label(data.gift?.name);
  if (!giftName) return null;
  const sender = label(data.nickname) || label(data.user?.nickname) || label(data.uniqueId) ||
    label(data.user?.uniqueId) || label(data.user?.displayId) || 'Viewer';
  const repeatCount = typeof data.repeatCount === 'string' ? Number(data.repeatCount) : data.repeatCount;
  const count = Number.isSafeInteger(repeatCount) && repeatCount > 0 ? repeatCount : 1;
  const messageId = data.msgId ?? data.common?.msgId ?? data.common?.msg_id;
  const id = typeof messageId === 'number' ? String(messageId) : label(messageId);
  return { giftName, sender, count, id };
}

export function createTikFinity({ onGift, onSeenGift = () => {}, onStatus = () => {},
  WebSocketClass = globalThis.WebSocket }) {
  const effects = Object.keys(DEFAULT_GIFTS);
  const seen = new Set();
  let mappings = DEFAULT_GIFTS;
  let socket;
  let status = 'offline';

  function updateStatus(next) {
    if (status === next) return;
    status = next;
    onStatus(status);
  }

  function accept(message, simulated = false) {
    const gift = decodeGift(message);
    if (!gift) return false;
    const { id, ...details } = gift;
    if (!simulated && id) {
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > 512) seen.delete(seen.values().next().value);
    }
    const receipt = { ...details, simulated };
    onSeenGift(receipt);
    const effect = effects.find(key => label(mappings[key]).toLowerCase() === gift.giftName.toLowerCase());
    if (!effect) return false;
    onGift({ effect, ...receipt });
    return true;
  }

  return {
    connect() {
      if (socket) return;
      updateStatus('connecting');
      let current;
      try {
        current = new WebSocketClass(TIKFINITY_URL);
      } catch {
        updateStatus('disconnected');
        return;
      }
      socket = current;
      current.addEventListener('open', () => {
        if (socket === current) updateStatus('connected');
      });
      current.addEventListener('message', ({ data }) => {
        if (socket === current) accept(data);
      });
      const lostConnection = () => {
        if (socket !== current) return;
        socket = undefined;
        current.close();
        updateStatus('disconnected');
      };
      current.addEventListener('error', lostConnection);
      current.addEventListener('close', lostConnection);
    },
    disconnect() {
      const previous = socket;
      socket = undefined;
      previous?.close();
      updateStatus('offline');
    },
    setMappings(gifts) {
      mappings = Object.fromEntries(effects.map(effect => [effect, label(gifts?.[effect])]));
    },
    simulate(effect) {
      if (!effects.includes(effect) || !mappings[effect]) return false;
      return accept(JSON.stringify({ event: 'gift', data: {
        giftName: mappings[effect], nickname: 'Offline tester', giftType: 1, repeatCount: 1, repeatEnd: true,
      } }), true);
    },
  };
}
