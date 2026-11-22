import { DEFAULT_GIFTS } from './tikfinity.mjs';

export const GIFT_SLOTS = Object.freeze([...Object.keys(DEFAULT_GIFTS), 'drift', 'surge', 'echo']);

const winds = [
  ['east', 1, 0], ['south', 0, 1], ['west', -1, 0], ['north', 0, -1],
  ['southeast', .71, .71], ['southwest', -.71, .71], ['northwest', -.71, -.71], ['northeast', .71, -.71],
];

function timed(effect, name, text, seconds, power = 1, settings = {}) {
  return {
    name: `${name} (${seconds.toFixed(1)} s)`,
    description: `${text} for ${seconds.toFixed(1)} seconds.`,
    recipe: { kind: 'effect', effect, seconds, power, ...settings },
  };
}

const families = [
  ['dragon', 'Dragon swoop', (v) => {
    const power = .74 + v * .035;
    const warning = (.92 / power).toFixed(2);
    return { name: `Dragon swoop (${warning} s warning)`, description: `Dodge a dragon after a ${warning}-second warning.`,
      recipe: { kind: 'effect', effect: 'dragon', power } };
  }],
  ['slippery', 'Flash freeze', (v) => timed('slippery', 'Flash freeze', 'Lose traction', 2.3 + v * .19, .75 + v * .085)],
  ['boost', 'Power jump', (v) => timed('boost', 'Power jump', 'Jump higher', 2.6 + v * .18, .6 + v * .042, { jumpOnly: true })],
  ['float', 'Levitation', (v) => timed('float', 'Levitation', 'Rise upwards', v === 0 ? 10 : 2.9 + v * .18, .72 + v * .04)],
  ['perspective', 'Perspective lock', (v) => timed('perspective', 'Perspective lock', 'Lock the view to the opposite perspective', 2 + v * .2)],
  ['sound', 'Phantom dragon', (v) => timed('sound', 'Phantom dragon', 'Hear a dragon roar', 1.2 + v * .17,
    .62 + v * .036, { pan: .55 * Math.sin(v * 1.7) })],
  ['mute', 'Mute game', (v) => timed('mute', 'Mute game', 'Mute the game audio', 2.4 + v * .17)],
  ['shove', 'Side shove', (v) => {
    const [direction, x, z] = winds[v % winds.length];
    const strength = 175 + v * 14;
    return { name: `Side shove (${direction}, ${strength})`, description: `Get a single sideways shove towards the ${direction}.`,
      recipe: { kind: 'impulse', x: x * strength, y: 0, z: z * strength } };
  }],
  ['rocket', 'Rocket leap', (v) => {
    const strength = 280 + v * 23;
    return { name: `Rocket leap (${strength})`, description: 'Launch vertically with one powerful leap.',
      recipe: { kind: 'impulse', x: 0, y: strength, z: 0 } };
  }],
  ['flip', 'Gravity flip', (v) => timed('flip', 'Gravity flip', 'Turn the world upside down', 1.2 + v * .15, .74 + v * .032)],
  ['sprint', 'Sprint burst', (v) => timed('sprint', 'Sprint burst', 'Run faster', 2.1 + v * .16, 1.13 + v * .025)],
  ['heavy', 'Heavy boots', (v) => timed('heavy', 'Heavy boots', 'Feel heavier gravity in the air', 2.3 + v * .17, 1.15 + v * .045)],
  ['feather', 'Featherfall', (v) => timed('feather', 'Featherfall', 'Accelerate towards the ground more slowly', 2.5 + v * .16, .73 - v * .023)],
  ['glide', 'Glider hold', (v) => timed('glide', 'Glider hold', 'Cap your descent speed', 2.2 + v * .17, 85 + v * 9)],
  ['cyclone', 'Cyclone', (v) => timed('cyclone', 'Cyclone', 'Get swept by a rotating wind', 1.9 + v * .19, .78 + v * .042)],
  ['gust', 'Crosswind', (v) => {
    const [direction, x, z] = winds[v % winds.length];
    return timed('gust', 'Crosswind', `Get pushed ${direction}`, 1.7 + v * .18, .68 + v * .046, { wind: [x, z] });
  }],
  ['airControl', 'Loose steering', (v) => timed('airControl', 'Loose steering', 'Steer more slowly in mid-air', 1.8 + v * .2, .22 + v * .02)],
  ['grip', 'Studded soles', (v) => timed('grip', 'Studded soles', 'Change direction more sharply on the ground', 1.9 + v * .19, 1.25 + v * .07)],
  ['bounce', 'Rebound', (v) => timed('bounce', 'Rebound', 'Bounce on contact with a platform', 2.5 + v * .17, .68 + v * .035)],
  ['directionLock', 'Control lock', (v) => {
    const [direction, label] = [['left', 'Left'], ['right', 'Right'], ['back', 'Forward'], ['front', 'Backward']][v % 4];
    return timed('directionLock', `${label} control lock`, `Disable ${label.toLowerCase()} movement`,
      2.1 + v * .17, 1, { direction });
  }],
  ['stutter', 'Stutter step', (v) => timed('stutter', 'Stutter step', 'Run in a pulsing rhythm', 2 + v * .19, .65 + v * .06)],
  ['quiet', 'Jump lock', (v) => timed('quiet', 'Jump lock', 'Disable manual jumping', 1.4 + v * .23)],
  ['brake', 'Momentum brake', (v) => timed('brake', 'Momentum brake', 'Slow your sideways momentum', 1.9 + v * .18, 18 + v * .8)],
  ['dive', 'Downburst', (v) => timed('dive', 'Downburst', 'Fall quickly once you start descending', 2.1 + v * .18, 430 + v * 15)],
  ['lateJump', 'Edge grace', (v) => timed('lateJump', 'Edge grace', 'Keep the jump window open briefly after leaving a ledge', 1.9 + v * .2, .17 + v * .024)],
];

export const GIFT_EFFECT_NAMES = Object.freeze(Object.fromEntries(families.map(([family, label]) => [family, label])));

export function giftInteractionsForLevel(levelIndex) {
  return GIFT_SLOTS.map((id, index) => {
    const ordinal = levelIndex * GIFT_SLOTS.length + index;
    const [family, , build] = families[ordinal % families.length];
    const key = `L${String(levelIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
    return { id, key, family, ...build(Math.floor(ordinal / families.length)) };
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
