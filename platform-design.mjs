const finishes = [
  '#9d5646', '#b48c49', '#778d83', '#526f85', '#958a75',
  '#ae744f', '#649188', '#73798a', '#a5a18d',
];

export function platformDesign(seed) {
  // An odd multiplier keeps this a permutation of all 16-bit seeds.
  const code = (Math.imul(seed, 40503) + 19687) & 0xffff;
  return {
    colour: finishes[code % finishes.length],
    pattern: Math.floor(code / 9) % 9,
    offset: Math.floor(code / 81) % 16,
    span: Math.floor(code / 1296),
  };
}
