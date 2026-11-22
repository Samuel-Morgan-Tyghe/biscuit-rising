import { DEFAULT_GIFTS } from './tikfinity.mjs';

export const GIFT_SLOTS = Object.freeze([...Object.keys(DEFAULT_GIFTS), 'drift', 'surge', 'echo']);

const moves = {
  dragon: { name: 'Dragon swoop', text: 'Dodge a dragon', seconds: 0 },
  slippery: { name: 'Flash freeze', text: 'Lose your grip', seconds: 4 },
  boost: { name: 'Power jump', text: 'Jump higher and further', seconds: 5 },
  float: { name: 'Levitation', text: 'Float upwards', seconds: 8 },
  flip: { name: 'Gravity flip', text: 'Flip the world upside down', seconds: 1.35 },
  gust: { name: 'Crosswind', text: 'Get blown sideways', seconds: 2.8 },
  bounce: { name: 'Rebound', text: 'Bounce off platforms', seconds: 4 },
  drift: { name: 'Side shove', text: 'Lurch sideways', impulse: [280, 54] },
  surge: { name: 'Rocket leap', text: 'Launch into a leap', impulse: [155, 505] },
  echo: { name: 'Pulse dash', text: 'Take two short sideways dashes', impulse: [205, 95] },
  brake: { name: 'Momentum brake', text: 'Lose most of your sideways momentum' },
};

const timings = [
  { name: 'Quick follow', primary: 0, follow: [.35], power: .84, length: .85, text: 'The second effect follows in 0.35 seconds.' },
  { name: 'Slow burn', primary: 0, follow: [1.2], power: 1.1, length: 1.25, text: 'The second effect follows in 1.2 seconds.' },
  { name: 'Double hit', primary: 0, follow: [.5, 1.45], power: .94, length: .78, text: 'The second effect hits twice.' },
  { name: 'Reverse order', primary: .7, follow: [0], power: 1.23, length: .87, text: 'The second effect comes first.' },
  { name: 'Late twist', primary: 0, follow: [2.2], power: 1.03, length: 1.35, text: 'The second effect follows in 2.2 seconds.' },
];

const winds = [[1, 0], [0, 1], [-1, 0], [0, -1], [.71, .71], [-.71, .71], [-.71, -.71], [.71, -.71]];

function actionsFor(move, delay, power, length, wind) {
  const { impulse, seconds } = moves[move];
  if (move === 'brake') return [{ kind: 'brake', delay, factor: 1 - power * .72 }];
  if (move === 'dragon') return [{ kind: 'effect', effect: move, delay, power }];
  if (!impulse) return [{ kind: 'effect', effect: move, delay, seconds: seconds * length, power,
    ...(move === 'gust' ? { wind } : {}) }];
  const [horizontal, vertical] = impulse;
  const [x, z] = wind.map((axis) => axis * horizontal * power);
  const first = { kind: 'impulse', x, y: vertical * power, z, delay };
  return move === 'echo' ? [first, { ...first, x: -x, z: -z, delay: delay + .6 }] : [first];
}

export function giftInteractionsForLevel(levelIndex) {
  const pairing = Math.floor(levelIndex / timings.length);
  const timing = timings[levelIndex % timings.length];
  return GIFT_SLOTS.map((id, index) => {
    const follow = pairing === GIFT_SLOTS.length - 1 ? 'brake' : GIFT_SLOTS[(index + pairing + 1) % GIFT_SLOTS.length];
    const primaryWind = winds[(levelIndex * 3 + index) % winds.length];
    const actions = [
      ...actionsFor(id, timing.primary, timing.power, timing.length, primaryWind),
      ...timing.follow.flatMap((delay, pulse) => {
        const wind = winds[(levelIndex * 3 + index + 3 + pulse) % winds.length];
        // The first dragon has to end before a second one can spawn.
        const at = follow === 'dragon' && pulse > 0 ? timing.follow[0] + 2.1 : delay;
        return actionsFor(follow, at, timing.power * .88, timing.length * .64, wind);
      }),
    ].sort((a, b) => a.delay - b.delay);
    return {
      id,
      name: `${moves[id].name} + ${moves[follow].name} (${timing.name})`,
      description: `${moves[id].text}. ${moves[follow].text}. ${timing.text}`,
      recipe: { actions },
    };
  });
}

export function giftMappingsForLevel(base, levelIndex) {
  const slots = GIFT_SLOTS.map((effect) => typeof base?.[effect] === 'string' ? base[effect].trim() : '');
  const block = Math.floor(levelIndex / slots.length);
  const offset = levelIndex % slots.length;
  const pairCount = Math.floor((slots.length - 1) / 2);

  // Gray code changes one non-neighbouring pair at each block boundary.
  const swaps = block ^ (block >> 1);
  for (let pair = 0; pair < pairCount; pair += 1) {
    if (swaps & (1 << pair)) {
      const left = pair + 1;
      const right = left + pairCount;
      [slots[left], slots[right]] = [slots[right], slots[left]];
    }
  }

  return Object.fromEntries(GIFT_SLOTS.map((effect, index) => [effect, slots[(index + offset) % slots.length]]));
}
