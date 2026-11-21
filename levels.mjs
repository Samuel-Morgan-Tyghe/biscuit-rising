function stairs(axis, start, end, across, width, low, high) {
  const count = 10;
  const tread = (end - start) / count;
  return Array.from({ length: count }, (_, index) => {
    const centre = start + tread * (index + 0.5);
    const y = low + (high - low) * (index + 1) / (count + 1);
    const acrossX = axis === "z";
    return [acrossX ? across : centre, y, acrossX ? width : Math.abs(tread), "stair",
      acrossX ? centre : across, acrossX ? Math.abs(tread) : width, { stairway: low }];
  });
}

function ramp(axis, start, end, across, width, low, high) {
  const centre = (start + end) / 2;
  const length = Math.abs(end - start);
  const acrossX = axis === "z";
  return [acrossX ? across : centre, low, acrossX ? width : length, "ramp",
    acrossX ? centre : across, acrossX ? length : width,
    { slope: { axis, rise: (high - low) * Math.sign(end - start) } }];
}

const sections = [
  {
    name: "Quarry entrance",
    ledges: [
      [330, 0, 260, "floor", 885, 310],
      [330, 65, 164, "stone", 690, 120],
      ...stairs("z", 683, 557, 386, 72, 65, 148),
      [370, 148, 138, "stone", 500, 114],
      [555, 220, 168, "deck", 522, 104],
      ramp("x", 575, 685, 490, 76, 220, 271),
      [790, 271, 210, "bridge", 490, 92],
      [855, 330, 132, "wobble", 355, 114],
      [865, 420, 158, "deck", 215, 120],
    ],
  },
  {
    name: "Cargo yard",
    ledges: [
      [724, 510, 220, "crate", 175, 160],
      ...stairs("x", 794, 634, 240, 72, 510, 577),
      [560, 577, 148, "crate", 230, 127],
      [450, 660, 108, "moving", 249, 105],
      [290, 741, 159, "crate", 273, 139],
      [196, 820, 93, "catwalk", 397, 180],
      [202, 888, 112, "wobble", 565, 113],
      [290, 966, 124, "deck", 680, 149],
      ramp("x", 307, 423, 690, 76, 966, 1054),
    ],
  },
  {
    name: "The gantry",
    ledges: [
      [510, 1054, 174, "deck", 697, 151],
      [605, 1138, 150, "wire", 691, 44],
      [749, 1224, 144, "moving", 601, 94],
      [753, 1224, 52, "bridge", 456, 220],
      [708, 1310, 111, "moving", 311, 101],
      [565, 1402, 129, "wire", 284, 49],
      [402, 1485, 124, "deck", 317, 112],
      [295, 1578, 99, "wobble", 422, 116],
    ],
  },
  {
    name: "Cloudline summit",
    ledges: [
      [280, 1658, 184, "cloud", 577, 171],
      [401, 1748, 121, "cloud", 713, 108],
      [541, 1839, 113, "wobble", 757, 78],
      [680, 1931, 142, "moving", 703, 96],
      [806, 2017, 72, "wire", 575, 135],
      [744, 2111, 111, "cloud", 423, 96],
      [585, 2204, 126, "deck", 405, 96],
      [478, 2298, 92, "catwalk", 504, 156],
      ramp("z", 520, 661, 497, 110, 2298, 2394),
      [546, 2394, 197, "flag", 735, 148],
    ],
  },
];

const thickness = { floor: 42, stone: 32, deck: 20, catwalk: 13, wobble: 20, crate: 38, moving: 20, wire: 13, cloud: 20, flag: 20, stair: 16, ramp: 18, bridge: 14 };

export const LEVEL_COUNT = 50;

const places = [
  "Ropeworks", "Old quarry", "Copper ridge", "Dust saddle", "High foundry", "Slate spur", "Snow line",
];
const crossings = [
  "crossing", "switchback", "shelf", "rise", "traverse", "pass", "ascent",
];

function route(index) {
  const stage = index - sections.length;
  const difficulty = stage / (LEVEL_COUNT - sections.length - 1);
  let seed = (index + 1) * 0x9e3779b1;
  const random = (min, max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.round(min + (max - min) * (seed / 2 ** 32));
  };
  const direction = index % 2 ? -1 : 1;
  const mirror = (x) => (direction === 1 ? x : 1120 - x);
  const theme = stage % sections.length;
  const visualBaseY = sections[theme].ledges[0][1];
  const face = theme === 0 ? 0 : (stage + Math.floor(stage / 4)) % 4;
  const orient = ([cx, y, w, kind, cz, d, terrain]) => {
    if (face === 0) return [cx, y, w, kind, cz, d, terrain];
    if (face === 1) return [cx, y, w, kind, 1000 - cz, d, terrain];
    const slope = terrain?.slope && { ...terrain.slope, axis: "z" };
    return [cz + (face === 2 ? 90 : -675), y, d, kind, cx, w, { ...terrain, slope }];
  };
  const z = random(803, 854);
  let x = random(186, 215);
  let y = visualBaseY;
  let currentZ = z;
  const ledges = [[mirror(x), y, 172, "floor", currentZ, 160]];
  const materials = ["stone", "deck", "crate", "catwalk", "cloud"];
  const count = 4 + Number(stage % 3 === 2);
  for (let jump = 0; jump < count; jump += 1) {
    x += random(108, 127) + Math.round(15 * difficulty);
    y += random(56, 68) + Math.round(17 * difficulty);
    currentZ = z + random(-34, 42) * (jump % 2 ? -1 : 1);
    const motion = random(0, 9);
    const kind = jump === count - 1 ? "deck" : motion < 4 * difficulty ? "moving"
      : motion < 1 + 4 * difficulty ? "wobble" : materials[random(0, materials.length - 1)];
    const width = random(113, 130) - Math.round(40 * difficulty);
    const depth = random(103, 122) - Math.round(31 * difficulty);
    ledges.push([mirror(x), y, width, kind, currentZ, depth]);
  }
  // The final crossing meets the deck edge so it can be run without another jump.
  const last = ledges.at(-1);
  const from = x + last[2] / 2 - 14;
  const to = Math.min(from + random(85, 117), 992);
  const width = Math.round(90 - difficulty * 36);
  const crossing = stage % 3;
  const finishHeight = y + (crossing === 2 ? 0 : random(25, 47) + Math.round(16 * difficulty));
  if (crossing === 0) {
    ledges.push(ramp("x", mirror(from), mirror(to), currentZ, width, y, finishHeight));
  } else if (crossing === 1) {
    ledges.push(...stairs("x", mirror(from), mirror(to), currentZ, width, y, finishHeight));
  } else {
    ledges.push([mirror((from + to) / 2), y, to - from, "bridge", currentZ, width]);
  }
  ledges.push([mirror(to + 47), finishHeight, 94, "flag", currentZ, 117]);
  const name = index === LEVEL_COUNT - 1 ? "The summit"
    : `${places[Math.floor(stage / crossings.length)]} ${crossings[stage % crossings.length]}`;
  return { name, ledges: ledges.map(orient) };
}

export const levels = [];
for (let index = 0; index < LEVEL_COUNT; index += 1) {
  const { name, ledges } = sections[index] ?? route(index);
  const previous = levels.at(-1);
  const baseY = previous ? previous.goal.y + 68 : 0;
  const visualBaseY = ledges[0][1];
  const shift = baseY - visualBaseY;
  const generated = index >= sections.length;
  const goalLedge = ledges.at(-1)[3] === "ramp" ? sections[index + 1].ledges[0] : null;
  const routeLedges = goalLedge ? [...ledges, goalLedge] : ledges;
  const platforms = routeLedges.map(([centre, visualY, w, use, depthCentre, d, terrain], order) => {
    const kind = order === routeLedges.length - 1 ? "flag" : use;
    return {
      x: centre - w / 2,
      y: visualY + shift,
      w, kind, z: depthCentre - d / 2, d, thickness: thickness[kind],
      zone: index % sections.length, visualY, start: order === 0,
      ...(generated ? { designSeed: (index + 1) * 64 + order, movementRate: .93 + .23 * (index - 4) / (LEVEL_COUNT - 5) } : {}),
      ...terrain,
    };
  });
  const point = ({ x, y, z, w, d }) => ({ x: x + w / 2, y, z: z + d / 2 });
  levels.push({ index, name, platforms, spawn: point(platforms[0]), goal: point(platforms.at(-1)), baseY, visualBaseY });
}
