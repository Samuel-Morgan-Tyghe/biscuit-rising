import { obstacleColliders } from './obstacle-colliders.mjs';

const pieces = [
  ['gear', '#b28d52'],
  ['delivery-van', '#71b8a5'],
  ['giant-maki', '#96aa58'],
  ['workbench', '#ad7851'],
  ['lumber-wagon', '#a7845e'],
  ['firetruck', '#c96d66'],
  ['flat-rock', '#9eafa9'],
  ['shopping-cart', '#b4c6c8'],
  ['giant-cake', '#deae87'],
  ['flatbed-wagon', '#ad9067'],
  ['toy-block', '#d9a64d'],
  ['log', '#a57356'],
  ['banked-track', '#758a98'],
  ['bench', '#ae8666'],
  ['giant-cookie', '#c59755'],
  ['rail-container', '#b86e62'],
  ['pipe', '#75a4a7'],
  ['freezer', '#a3bbc2'],
];

export const obstacleModels = Object.fromEntries(pieces.map(([name, colour]) => [name, { colour }]));
const traversals = new Set(['floor', 'stair', 'ramp', 'bridge', 'flag']);
const tallModels = {
  'delivery-van': .32, firetruck: .32, 'rail-container': .28, 'lumber-wagon': .28,
  'shopping-cart': .36, 'toy-block': .31, 'giant-maki': .30, workbench: .24, bench: .22,
};

function headroom(platform, lower) {
  if (!lower) return platform.thickness;
  const sway = (candidate) => candidate.kind === 'wobble' ? 8 : 0;
  const lowerTop = lower.y + Math.abs(lower.slope?.rise ?? 0) + sway(lower);
  return Math.max(platform.thickness, platform.y - sway(platform) - lowerTop - 44);
}

const bounds = new Map();
for (const [name, { nativeWidth, nativeDepth, primitives }] of Object.entries(obstacleColliders)) {
  const turned = primitives.map(({ x, z, w, d, ...vertical }) => ({ x: z, z: 1 - x - w, w: d, d: w, ...vertical }));
  bounds.set(name, { nativeWidth, nativeDepth, primitives, turned });
}

function contactHeight(pieces, x, z) {
  let highest = -1;
  for (const cell of pieces) {
    if (x >= cell.x && x <= cell.x + cell.w && z >= cell.z && z <= cell.z + cell.d) highest = Math.max(highest, cell.top);
  }
  return highest;
}

function chooseLanding(platform, pieces, previous, isGear) {
  let idealX = .5, idealZ = .5;
  if (isGear) {
    const dx = (previous.x + previous.w / 2 - platform.x) / platform.w - .5;
    const dz = (previous.z + previous.d / 2 - platform.z) / platform.d - .5;
    const distance = Math.hypot(dx, dz) || 1;
    idealX += .34 * dx / distance;
    idealZ += .34 * dz / distance;
  }
  let bestScore = -Infinity;
  let chosen = [.5, .5];
  const dx = 6 / platform.w, dz = 6 / platform.d;
  for (let row = 2; row <= 14; row++) for (let col = 2; col <= 14; col++) {
    const x = col / 16, z = row / 16;
    const height = contactHeight(pieces, x, z);
    if (height < 0) continue;
    const neighbours = [contactHeight(pieces, x - dx, z), contactHeight(pieces, x + dx, z),
      contactHeight(pieces, x, z - dz), contactHeight(pieces, x, z + dz)];
    const support = neighbours.filter((top) => top >= height - .14).length;
    const score = height * 2 + support * .17 - Math.hypot(x - idealX, z - idealZ) * (isGear ? 5 : 3);
    if (score > bestScore) {
      bestScore = score;
      chosen = [x, z];
    }
  }
  return chosen;
}

export function withObstacle(platform, previous, next, levelIndex, order) {
  if (platform.start || traversals.has(platform.kind)) return platform;
  const isFirstJump = levelIndex === 0 && order === 1;
  const start = isFirstJump ? 0 : (levelIndex * 7 + order * 5) % pieces.length;
  const span = Math.max(platform.w, platform.d);
  const available = headroom(platform, previous);
  let index = start;
  while (true) {
    const [model] = pieces[index];
    const { nativeWidth, nativeDepth, primitives, turned } = bounds.get(model);
    const quarterTurn = (platform.w / platform.d > 1.22 && nativeDepth > nativeWidth * 1.15) ||
      (platform.d / platform.w > 1.22 && nativeWidth > nativeDepth * 1.15);
    const colliders = quarterTurn ? turned : primitives;
    const gear = model === 'gear';
    const centreBlocked = gear && colliders.some(({ x, z, w, d }) =>
      x < .5 + 13 / platform.w && x + w > .5 - 13 / platform.w &&
      z < .5 + 13 / platform.d && z + d > .5 - 13 / platform.d);
    const minimum = (tallModels[model] ?? 0) * span;
    if (minimum <= available && !centreBlocked) {
      const thickness = tallModels[model] ? Math.min(available, Math.max(platform.thickness, span * .43)) : platform.thickness;
      const landing = chooseLanding(platform, colliders, previous, gear);
      return { ...platform, obstacle: model, quarterTurn, colliders, thickness, landing };
    }
    index = (index + 1) % pieces.length;
  }
}
