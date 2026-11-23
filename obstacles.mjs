const round = Array.from({ length: 16 }, (_, index) => {
  const angle = index / 16 * 2 * Math.PI;
  return [.49 * Math.cos(angle), .49 * Math.sin(angle)];
});
const bevel = [[-.34, -.5], [.34, -.5], [.5, -.34], [.5, .34], [.34, .5], [-.34, .5], [-.5, .34], [-.5, -.34]];
const capsule = [[-.35, -.5], [.22, -.5], [.48, -.27], [.5, .09], [.31, .48], [-.24, .5], [-.48, .27], [-.5, -.12]];
const roof = [[-.43, -.5], [.34, -.5], [.49, -.28], [.42, .49], [-.32, .49], [-.49, .23]];
const rock = [[-.11, -.49], [.31, -.43], [.49, -.16], [.42, .28], [.16, .49], [-.34, .39], [-.49, .11], [-.41, -.33]];
const track = [[-.50, -.47], [-.02, -.49], [.23, -.22], [.49, .16], [.48, .47], [.01, .49], [-.30, .15], [-.47, -.17]];

const pieces = [
  ['gear', round, '#b28d52'],
  ['delivery-van', roof, '#71b8a5'],
  ['giant-maki', round, '#96aa58'],
  ['workbench', bevel, '#ad7851'],
  ['lumber-wagon', capsule, '#a7845e'],
  ['firetruck', roof, '#c96d66'],
  ['flat-rock', rock, '#9eafa9'],
  ['shopping-cart', roof, '#b4c6c8'],
  ['giant-cake', round, '#deae87'],
  ['flatbed-wagon', bevel, '#ad9067'],
  ['toy-block', bevel, '#d9a64d'],
  ['log', capsule, '#a57356'],
  ['banked-track', track, '#758a98'],
  ['bench', capsule, '#ae8666'],
  ['giant-cookie', round, '#c59755'],
  ['rail-container', bevel, '#b86e62'],
  ['pipe', capsule, '#75a4a7'],
  ['freezer', roof, '#a3bbc2'],
];

export const obstacleModels = Object.fromEntries(pieces.map(([name, , colour]) => [name, { colour }]));
const traversals = new Set(['floor', 'stair', 'ramp', 'bridge', 'flag']);
const connections = new Set(['stair', 'ramp', 'bridge']);

export function withObstacle(platform, previous, next, levelIndex, order) {
  if (platform.start || traversals.has(platform.kind)) return platform;
  const isFirstJump = levelIndex === 0 && order === 1;
  const [model, shape] = pieces[isFirstJump ? 0 : (levelIndex * 7 + order * 5) % pieces.length];
  const joined = connections.has(previous?.kind) || connections.has(next?.kind);
  const footprint = joined && !isFirstJump ? bevel : shape;
  const rotatedFootprint = platform.w > platform.d * 1.22 && footprint !== round && !joined
    ? footprint.map(([x, z]) => [z, -x])
    : footprint;
  return { ...platform, obstacle: model, footprint: rotatedFootprint };
}

export function containsFootprint(platform, x, z) {
  if (!platform.footprint) return true;
  const px = (x - platform.x) / platform.w - .5;
  const pz = (z - platform.z) / platform.d - .5;
  return platform.footprint.every(([ax, az], index, points) => {
    const [bx, bz] = points[(index + 1) % points.length];
    return (bx - ax) * (pz - az) - (bz - az) * (px - ax) >= 0;
  });
}
