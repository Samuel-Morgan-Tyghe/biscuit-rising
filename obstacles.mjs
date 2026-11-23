import { obstacleMeshes } from './obstacle-meshes.mjs';
import { buildMeshCollider, meshSurface, sweepMesh } from './mesh-collision.mjs';

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

const markerMeshes = new Map();

function markerMesh(model, mesh, quarterTurn) {
  const key = `${model}:${quarterTurn}`;
  if (!markerMeshes.has(key)) {
    markerMeshes.set(key, buildMeshCollider({ x: 0, y: 1, z: 0, w: 1, d: 1, thickness: 1, mesh, quarterTurn }, [0, 0, 0]));
  }
  return markerMeshes.get(key);
}

function gearHasRoom(platform) {
  const { x, y, z, w, d, thickness } = platform;
  const mesh = buildMeshCollider(platform, [13, 43, 13]);
  return !sweepMesh(mesh, { x: x + w / 2, y: y + 2, z: z + d / 2 },
    { x: 0, y: -(thickness + 47), z: 0 });
}

function chooseLanding(platform, mesh, previous, isGear) {
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
    const height = meshSurface(mesh, x, z);
    if (height === null) continue;
    const neighbours = [meshSurface(mesh, x - dx, z), meshSurface(mesh, x + dx, z),
      meshSurface(mesh, x, z - dz), meshSurface(mesh, x, z + dz)];
    const support = neighbours.filter((top) => top !== null && top >= height - .14).length;
    const score = height * 2 + support * .17 - Math.hypot(x - idealX, z - idealZ) * (isGear ? 5 : 3);
    if (score > bestScore) {
      bestScore = score;
      chosen = [x, z];
    }
  }
  return chosen;
}

export function withObstacle(platform, previous, levelIndex, order) {
  if (platform.start || traversals.has(platform.kind)) return platform;
  const isFirstJump = levelIndex === 0 && order === 1;
  const start = isFirstJump ? 0 : (levelIndex * 7 + order * 5) % pieces.length;
  const span = Math.max(platform.w, platform.d);
  const available = headroom(platform, previous);
  let index = start;
  while (true) {
    const [model] = pieces[index];
    const mesh = obstacleMeshes[model];
    const { nativeWidth, nativeDepth } = mesh;
    const quarterTurn = (platform.w / platform.d > 1.22 && nativeDepth > nativeWidth * 1.15) ||
      (platform.d / platform.w > 1.22 && nativeWidth > nativeDepth * 1.15);
    const gear = model === 'gear';
    const minimum = (tallModels[model] ?? 0) * span;
    if (minimum <= available) {
      const thickness = tallModels[model] ? Math.min(available, Math.max(platform.thickness, span * .43)) : platform.thickness;
      const fitted = { ...platform, obstacle: model, quarterTurn, mesh, thickness };
      if (!gear || gearHasRoom(fitted)) {
        return { ...fitted, landing: chooseLanding(platform, markerMesh(model, mesh, quarterTurn), previous, gear) };
      }
    }
    index = (index + 1) % pieces.length;
  }
}
