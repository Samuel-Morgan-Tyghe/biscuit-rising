import { DEFAULT_GIFTS } from './tikfinity.mjs';

const effects = Object.keys(DEFAULT_GIFTS);

export function giftMappingsForLevel(base, levelIndex) {
  const slots = effects.map((effect) => typeof base?.[effect] === 'string' ? base[effect].trim() : '');
  const block = Math.floor(levelIndex / effects.length);
  const offset = levelIndex % effects.length;
  const pairCount = Math.floor((effects.length - 1) / 2);

  // Gray code changes one pair between blocks. The paired slots are far enough apart to avoid matching the last rotation.
  const swaps = block ^ (block >> 1);
  for (let pair = 0; pair < pairCount; pair += 1) {
    if (swaps & (1 << pair)) {
      const left = pair + 1;
      const right = left + pairCount;
      [slots[left], slots[right]] = [slots[right], slots[left]];
    }
  }

  return Object.fromEntries(effects.map((effect, index) => [effect, slots[(index + offset) % slots.length]]));
}
