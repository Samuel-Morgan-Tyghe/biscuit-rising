import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/gltf-loader.mjs';
import { LEVEL_COUNT, PLAYER_HEIGHT, landingPoint, platformSurface, platformTop } from './engine.mjs';
import { platformDesign } from './platform-design.mjs';
import { obstacleModels } from './obstacles.mjs';

const colours = {
  iron: '#233740', rails: '#60787a', bolts: '#d5d7bf', markings: '#f1bb63',
  beacon: '#afffe1', stone: '#697b76', rust: '#b0613f', ice: '#8ee9f4',
};
const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 14, 10);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const materials = new Map();

function matte(colour) {
  if (!materials.has(colour)) materials.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: .85 }));
  return materials.get(colour);
}

function mesh(parent, geometry, material, size, position) {
  const item = new THREE.Mesh(geometry, typeof material === 'string' ? matte(material) : material);
  item.scale.set(...size);
  item.position.set(...position);
  parent.add(item);
  return item;
}

function box(parent, colour, w, h, d, x = 0, y = 0, z = 0) {
  return mesh(parent, cube, colour, [w, h, d], [x, y, z]);
}

function orb(parent, colour, w, h, d, x = 0, y = 0, z = 0) {
  return mesh(parent, sphere, colour, [w, h, d], [x, y, z]);
}

function beam(parent, a, b, width, colour) {
  const from = new THREE.Vector3(...a);
  const delta = new THREE.Vector3(...b).sub(from);
  const center = from.addScaledVector(delta, .5);
  const item = box(parent, colour, width, delta.length(), width, ...center);
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return item;
}

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const ridgeProfile = [
  [-1450, 560, 457, 690, 585],
  [-435, 536, 495, 445, 380],
  [-45, 535, 455, 330, 280],
  [78, 565, 405, 264, 210],
  [195, 636, 299, 224, 139],
  [320, 623, 305, 173, 123],
  [432, 590, 311, 179, 124],
  [480, 523, 470, 223, 194],
  [675, 525, 487, 173, 177],
  [885, 519, 480, 208, 181],
  [1050, 589, 458, 166, 175],
  [1250, 481, 440, 157, 162],
  [1480, 518, 553, 172, 139],
  [1660, 549, 482, 157, 125],
  [1900, 577, 524, 158, 112],
  [2050, 519, 509, 126, 105],
  [2090, 515, 535, 135, 105],
  [2200, 497, 672, 119, 118],
  [2346, 545, 674, 93, 59],
];

function ridgeAt(y) {
  const next = ridgeProfile.findIndex(([height]) => height > y);
  if (next < 1) return ridgeProfile.at(next).slice(1);
  const a = ridgeProfile[next - 1], b = ridgeProfile[next];
  const at = (y - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, i) => THREE.MathUtils.lerp(value, b[i + 1], at));
}

function mountainside(scene, rock) {
  const next = random(426);
  const sides = 46;
  const rings = [];
  const ribs = Array.from({ length: sides }, () => .88 + next() * .24);
  for (let y = ridgeProfile[0][0]; y <= 2346; y = Math.min(y + 44, 2346)) {
    const [x, z, rx, rz] = ridgeAt(y);
    rings.push(Array.from({ length: sides + 1 }, (_, j) => {
      const angle = (j % sides) / sides * Math.PI * 2;
      const rib = ribs[j % sides] * (.9 + next() * .2);
      return [
        x + Math.cos(angle) * rx * rib,
        y + (next() - .5) * 34,
        z + Math.sin(angle) * rz * rib,
      ];
    }));
    rings.at(-1)[sides] = rings.at(-1)[0];
    if (y === 2346) break;
  }

  const positions = [], uvs = [], colours = [];
  for (const ring of rings) for (const [j, point] of ring.entries()) {
    positions.push(...point);
    uvs.push(j / sides * 12, point[1] / 168);
    const shade = .85 + next() * .15;
    colours.push(shade, shade, shade);
  }
  const indices = [];
  const row = sides + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * row + j, b = a + row;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const end = (rings.length - 1) * row;
  for (let i = 1; i < sides - 1; i++) indices.push(end, end + i + 1, end + i);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cliff = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#c4c9c6', map: rock, bumpMap: rock, bumpScale: 3.2, roughness: .99,
    vertexColors: true, side: THREE.DoubleSide,
  }));
  cliff.castShadow = cliff.receiveShadow = true;
  scene.add(cliff);
  return cliff;
}

function buildSupports(scene, platforms, offsetY) {
  const group = new THREE.Group();
  const steel = '#33464b', paint = '#846340', reinforcement = '#52656a';
  const next = random(953);
  const flights = new Set();
  for (const platform of platforms) {
    const { x, y, z, w, d, thickness, kind, stairway } = platform;
    if (kind === 'stair' && flights.has(stairway)) continue;
    if (kind === 'stair') flights.add(stairway);
    const cx = x + w / 2, cz = z + d / 2;
    const centre = [cx, platformTop(platform, cx, cz) - thickness, cz];
    const [rx, rz, a, b] = ridgeAt(y - 88 - offsetY);
    const t = Math.atan2(centre[2] - rz, centre[0] - rx);
    const ax = rx + .94 * a * Math.cos(t), az = rz + .94 * b * Math.sin(t);
    const reach = Math.hypot(centre[0] - ax, centre[2] - az);
    if (reach < 55) continue;
    const top = centre[1] - (kind === 'moving' || kind === 'wobble' ? 17 : 5);
    const anchorY = top - Math.min(159, 48 + reach * .34);
    const vx = -Math.sin(t), vz = Math.cos(t);
    const width = Math.min(w, d) * .28;
    for (const side of [-1, 1]) {
      const dx = vx * width * side, dz = vz * width * side;
      const ledge = [centre[0] + dx, top, centre[2] + dz];
      const anchor = [ax + dx, anchorY, az + dz];
      const upper = [ax + dx, top - Math.min(51, reach * .15), az + dz];
      beam(group, ledge, anchor, 6, steel);
      beam(group, ledge, upper, 5, paint);
      const at = .46;
      const middle = ledge.map((value, i) => THREE.MathUtils.lerp(value, anchor[i], at));
      beam(group, middle, [upper[0], upper[1], upper[2]], 3, reinforcement);
    }
    beam(group, [centre[0] - vx * width, top - 5, centre[2] - vz * width],
      [centre[0] + vx * width, top - 5, centre[2] + vz * width], 7, paint);
    if (kind === 'moving') {
      box(group, steel, w + 57, 4, 6, centre[0], top - 3, centre[2] - d * .28);
      box(group, steel, w + 57, 4, 6, centre[0], top - 3, centre[2] + d * .28);
    }
    if (kind === 'deck' || kind === 'bridge') addPylon(group, [centre[0], top, centre[2]], t + Math.PI / 2);
    if (next() > .57) {
      box(group, '#292c2c', 10, 8, 6, centre[0], top - 11, centre[2] + d * .33);
      orb(group, '#dc9d5b', 2.6, 2.6, 3, centre[0], top - 11, centre[2] + d * .33 + 2);
    }
  }

  scene.add(group);
}

function buildTrack(scene) {
  const group = new THREE.Group();
  const track = [[448, -164, 688], [486, 560, 571], [503, 1090, 622], [507, 1580, 679], [532, 2342, 750]];
  for (const side of [-1, 1]) {
    for (let i = 1; i < track.length; i++) {
      const shift = (point) => [point[0] + side * 8, point[1], point[2]];
      beam(group, shift(track[i - 1]), shift(track[i]), 4, '#556e70');
    }
  }
  scene.add(group);
}

function loadMaterialTextures() {
  const loader = new THREE.TextureLoader();
  return Object.fromEntries([['stone', 'slate'], ['iron', 'steel'], ['wood', 'timber'], ['brick', 'brick']].map(([type, file]) => {
    const texture = loader.load(`./assets/materials/${file}.jpg`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return [type, texture];
  }));
}

function texturedBox(group, material, w, h, d, y, tile) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const { position, normal, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const axisX = Math.abs(normal.getX(i)) > .5;
    const axisY = Math.abs(normal.getY(i)) > .5;
    uv.setXY(i, (axisX ? position.getZ(i) : position.getX(i)) / tile,
      (axisY ? position.getZ(i) : position.getY(i)) / tile);
  }
  const item = new THREE.Mesh(geometry, material);
  item.position.y = y;
  item.castShadow = true;
  item.receiveShadow = true;
  group.add(item);
  return item;
}

function rampNormal(platform) {
  const { axis, rise } = platform.slope;
  return new THREE.Vector3(axis === 'x' ? -rise / platform.w : 0, 1, axis === 'z' ? -rise / platform.d : 0).normalize();
}

function rampGeometry(platform, material, group) {
  const { x, y, z, w, d, thickness } = platform;
  const footprint = [[0, 0], [0, d], [w, d], [w, 0]];
  const upper = footprint.map(([dx, dz]) => [dx - w / 2, platformTop(platform, x + dx, z + dz) - y, dz - d / 2]);
  const points = [...upper, ...upper.map(([px, py, pz]) => [px, py - thickness, pz])];
  const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [4, 5, 1, 0], [5, 6, 2, 1], [6, 7, 3, 2], [7, 4, 0, 3]];
  const position = [], uv = [];
  for (const [side, corners] of faces.entries()) for (const index of [0, 1, 2, 0, 2, 3]) {
    const [px, py, pz] = points[corners[index]];
    position.push(px, py, pz);
    uv.push((side === 2 || side === 4 ? pz : px) / 103, (side < 2 ? pz : py) / 103);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  const ramp = new THREE.Mesh(geometry, material);
  ramp.castShadow = ramp.receiveShadow = true;
  group.add(ramp);

  for (const side of [-1, 1]) {
    const acrossX = platform.slope.axis === 'x';
    const reach = acrossX ? d : w;
    const [a, b] = acrossX ? [side === 1 ? 1 : 0, side === 1 ? 2 : 3] : [side === 1 ? 3 : 0, side === 1 ? 2 : 1];
    const edge = (index) => upper[index].map((coordinate, dimension) =>
      dimension === 1 ? coordinate - 4 : dimension === (acrossX ? 2 : 0) ? coordinate - side * Math.min(3, reach / 8) : coordinate);
    beam(group, edge(a), edge(b), 5, '#715a45');
  }
}

function bridgeDetails(group, w, d, thickness) {
  const alongX = w >= d;
  const span = alongX ? w : d;
  const width = alongX ? d : w;
  const point = (along, up, across) => alongX ? [along, up, across] : [across, up, along];

  for (let along = -span / 2 + 8; along < span / 2 - 5; along += 8) {
    box(group, '#382e24', alongX ? .34 : width - 1, .16, alongX ? width - 1 : .34, ...point(along, .07, 0));
  }
  for (const side of [-1, 1]) {
    const edge = side * (width / 2 - 2);
    beam(group, point(-span / 2, -.7, edge), point(span / 2, -.7, edge), 3, '#604937');
    let from = point(-span / 2, -4, edge);
    for (let i = 1; i <= 8; i++) {
      const amount = i / 8;
      const down = -4 - Math.sin(Math.PI * amount) * Math.min(36, span / 7) - thickness * .14;
      const at = point((amount - .5) * span, down, edge);
      beam(group, from, at, 2.2, '#7d6d53');
      if (i % 2 === 0 && i < 8) beam(group, at, point(at[alongX ? 0 : 2], -2, edge), 1.4, '#7d6d53');
      from = at;
    }
  }
}

function addPylon(group, centre, direction) {
  const [x, y, z] = centre;
  const length = 137;
  for (const side of [-1, 1]) {
    const ix = Math.cos(direction) * 15 * side;
    const iz = Math.sin(direction) * 15 * side;
    beam(group, [x + ix, y, z + iz], [x + ix * 1.5, y - length, z + iz * 1.5], 4.4, '#5d6761');
    const a = [x + ix, y - 47, z + iz], b = [x - ix, y - 90, z - iz];
    beam(group, [x - ix, y - 6, z - iz], a, 2.3, '#817154');
    beam(group, a, b, 2.3, '#817154');
    beam(group, b, [x + ix * 1.5, y - length, z + iz * 1.5], 2.3, '#817154');
  }
}

const salvage = new Map([
  [65, ['brick', '#bb855f', 'bond']],
  [148, ['stone', '#c0c0ac', 'bands']],
  [220, ['iron', '#6f8e8c', 'scaffold']],
  [330, ['wood', '#c99c77', 'shuttering']],
  [420, ['stone', '#b6b8ae', 'culvert']],
  [510, ['iron', '#bc7446', 'skip']],
  [577, ['brick', '#c47b5a', 'hollows']],
  [660, ['iron', '#7b927b', 'roller']],
  [741, ['stone', '#c2b59e', 'ratchets']],
  [820, ['iron', '#a6a99a', 'ladder']],
  [888, ['iron', '#8a7975', 'rivets']],
  [966, ['iron', '#7f998d', 'vent']],
  [1054, ['iron', '#a78955', 'bolted']],
  [1138, ['iron', '#bf9a51', 'wide-flange']],
  [1224, ['wood', '#956c49', 'joists']],
  [1310, ['iron', '#8292a1', 'trolley']],
  [1402, ['iron', '#778889', 'truss']],
  [1485, ['brick', '#9d6a53', 'arch']],
  [1578, ['iron', '#8ba4a3', 'corrugated']],
  [1658, ['stone', '#bfc6bf', 'weights']],
  [1748, ['brick', '#af806b', 'stack']],
  [1839, ['iron', '#abc2b9', 'grate']],
  [1931, ['iron', '#947e70', 'cage']],
  [2017, ['iron', '#996854', 'cantilever']],
  [2111, ['stone', '#a6beb9', 'pipes']],
  [2204, ['iron', '#839b84', 'gussets']],
  [2298, ['wood', '#b8a482', 'outriggers']],
]);

function salvageFace(group, style, w, d, thickness, colour) {
  const y = -thickness / 2, z = d / 2 + .2;
  const line = (x, h, length, tint = '#454a45') => box(group, tint, length, .8, .65, x, h, z);
  const upright = (x, size, tint = '#7c7763') => box(group, tint, size, thickness - 3, .75, x, y, z);
  const diagonal = (a, b, width, tint = '#756f5d') => beam(group, [...a, z], [...b, z], width, tint);
  const stud = (x, at, r = 1.45, tint = colours.bolts) => orb(group, tint, r, r, .7, x, at, z + .4);
  const aperture = (x, radius) => {
    const collar = mesh(group, cylinder, '#777a72', [radius, 1.3, radius], [x, y, z]);
    collar.rotation.x = Math.PI / 2;
    const bore = mesh(group, cylinder, '#303835', [radius * .72, .7, radius * .72], [x, y, z + .72]);
    bore.rotation.x = Math.PI / 2;
  };

  switch (style) {
    case 'bond':
      line(0, -1.2, w - 3, '#a59e84');
      break;
    case 'bands':
      for (const x of [-w / 3, w / 5]) upright(x, 2, '#565c4f');
      line(0, -thickness + 3, w - 3, '#8b8c7c');
      break;
    case 'scaffold':
      for (const side of [-1, 1]) {
        upright(side * w * .37, 3, colour);
        diagonal([side * w * .38, -thickness + 2], [0, -2], 2.2);
      }
      break;
    case 'shuttering':
      for (const x of [-.3, -.08, .27]) upright(x * w, 3.7, '#493a2d');
      line(0, -3, w - 5, '#74664d');
      break;
    case 'culvert':
      aperture(0, Math.min(9, thickness * .38));
      line(0, -thickness + 1.5, w * .91, '#93958a');
      break;
    case 'skip':
      line(0, -3.5, w - 4, '#a17850');
      for (const x of [-.4, -.22, 0, .22, .4]) diagonal([x * w, -3], [x * w - 4, -thickness + 3], 2.5, colour);
      break;
    case 'hollows':
      for (const x of [-.31, -.16, 0, .16, .31]) aperture(x * w, thickness * .16);
      break;
    case 'roller':
      for (const x of [-.29, .29]) {
        aperture(x * w, thickness * .24);
        stud(x * w, y, 1.7);
      }
      line(0, y, w * .36);
      break;
    case 'ratchets':
      for (const x of [-.27, .27]) {
        upright(x * w, 2.2, '#ad825b');
        box(group, '#554e40', 6, 3, 1.8, x * w, y, z + .7);
      }
      break;
    case 'ladder':
      for (let x = -w * .42; x < w * .46; x += 11) upright(x, 1.8, '#9ba18c');
      break;
    case 'rivets':
      for (const h of [-3.5, -thickness + 3.5]) {
        line(0, h, w - 2, '#7d746a');
        for (let x = -w * .44; x < w * .45; x += 13) stud(x, h, 1.03);
      }
      break;
    case 'vent':
      for (let x = -w * .32; x < w * .32; x += 5) upright(x, 1, '#31423c');
      break;
    case 'bolted':
      for (const x of [-.41, -.18, .18, .41]) {
        upright(x * w, 5, '#8b7952');
        stud(x * w, y);
      }
      break;
    case 'wide-flange':
      for (const x of [-w * .37, w * .37]) upright(x, 2.5, '#8d7042');
      break;
    case 'joists':
      for (const x of [-.39, -.13, .13, .39]) upright(x * w, 6, '#645549');
      break;
    case 'trolley':
      line(0, y, w * .88, '#616e73');
      for (const x of [-w / 3, w / 3]) aperture(x, thickness * .23);
      break;
    case 'truss':
      for (let x = -w * .38; x < w * .33; x += w / 8) diagonal([x, -2], [x + w / 11, -thickness + 2], 1.6);
      break;
    case 'arch':
      for (let i = 0; i <= 7; i++) {
        const angle = i * Math.PI / 7;
        stud(Math.cos(angle) * w * .29, -thickness + 2 + Math.sin(angle) * thickness * .75, 1.6, '#b49275');
      }
      break;
    case 'corrugated':
      for (let x = -w * .46; x < w * .46; x += 6) upright(x, 1.5, colour);
      break;
    case 'weights':
      for (const h of [1, 2, 3]) line(0, -thickness * h / 4, w - 3, '#798079');
      break;
    case 'stack':
      upright(0, 3, '#766455');
      line(0, y, w - 3);
      break;
    case 'grate':
      for (let x = -w * .39; x < w * .39; x += 8) stud(x, y, 2, '#405550');
      break;
    case 'cage':
      diagonal([-w * .4, -2], [w * .4, -thickness + 2], 2.3);
      diagonal([w * .4, -2], [-w * .4, -thickness + 2], 2.3);
      break;
    case 'cantilever':
      for (const x of [-w / 5, w / 5]) {
        upright(x, 4, '#9f7059');
        stud(x, y);
      }
      break;
    case 'pipes':
      for (const x of [-.26, 0, .26]) aperture(x * w, Math.min(7, thickness * .37));
      break;
    case 'gussets':
      for (const x of [-.3, 0, .3]) {
        diagonal([x * w - 6, -2], [x * w + 4, -thickness + 2], 3, '#8ba08a');
        stud(x * w - 6, -3);
      }
      break;
    case 'outriggers':
      for (const x of [-w * .35, w * .35]) upright(x, 5, '#6a604f');
      line(0, -1.7, w * .85, '#89816b');
      break;
  }
}

const salvageDesigns = [...salvage.values()];

function constructionBraces(group, platform, design) {
  const { w, d, x, y, z, thickness } = platform;
  const alongX = w >= d;
  const span = alongX ? w : d;
  const cross = alongX ? d : w;
  const side = design.pattern % 2 ? 1 : -1;
  const face = side * (cross / 2 + .3);
  const centre = (design.offset / 15 - .5) * span * .38;
  const reach = span * (.19 + design.span / 50 * .23);
  const count = 1 + design.pattern % 3;
  const motif = Math.floor(design.pattern / 3);
  const local = (along, down) => {
    const [px, pz] = alongX ? [along, face] : [face, along];
    const top = platformTop(platform, x + w / 2 + px, z + d / 2 + pz);
    return [px, top - y - down, pz];
  };
  const bar = Math.min(2.7, span * .07);
  const cut = thickness * design.span / 500;
  for (let i = 0; i < count; i++) {
    const at = centre + (i - (count - 1) / 2) * reach * .62;
    if (motif === 0) {
      beam(group, local(at, 2 + cut), local(at, thickness - 2 - cut), bar, design.colour);
    } else if (motif === 1) {
      beam(group, local(at - reach / 2, thickness * .4), local(at + reach / 2, thickness * .65), bar, design.colour);
    } else {
      const up = local(at, thickness * .25 - cut), down = local(at, thickness * .75 + cut);
      beam(group, up, down, bar * 1.3, design.colour);
      orb(group, colours.bolts, bar * .39, bar * .39, bar * .39, ...up);
    }
  }
}

function buildObstacle(platform) {
  const group = new THREE.Group();
  const { w, d, thickness, colliders } = platform;
  const fallback = new THREE.InstancedMesh(cube, matte(obstacleModels[platform.obstacle].colour), colliders.length);
  const transform = new THREE.Matrix4();
  for (const [index, cell] of colliders.entries()) {
    const height = (cell.top - cell.bottom) * thickness;
    transform.makeScale(cell.w * w, height, cell.d * d);
    transform.setPosition((cell.x + cell.w / 2 - .5) * w,
      (cell.top - 1) * thickness - height / 2, (cell.z + cell.d / 2 - .5) * d);
    fallback.setMatrixAt(index, transform);
  }
  group.add(fallback);
  return { group, fallback };
}

function fitObstacle(object, platform, asset) {
  const { w, d, thickness, quarterTurn } = platform;
  const oriented = new THREE.Group();
  const model = asset.clone(true);
  oriented.add(model);
  if (quarterTurn) model.rotation.y += Math.PI / 2;
  const visual = placeModel(oriented, object.group, [w, thickness, d], [0, -thickness, 0]);
  object.fallback.removeFromParent();
  object.fallback.dispose();
  object.surfaces = [];
  visual.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material.color) return;
    mesh.material = mesh.material.clone();
    mesh.userData.stageMaterial = true;
    object.surfaces.push({ material: mesh.material, colour: mesh.material.color.clone() });
  });
}

function buildLedge(platform, textures) {
  if (platform.obstacle) return buildObstacle(platform);
  const group = new THREE.Group();
  const { kind, w, d, start, thickness } = platform;
  const longX = w >= d;
  const piece = !['floor', 'stair', 'ramp', 'bridge', 'flag'].includes(kind);
  const art = platformDesign(platform.designSeed);
  const design = piece && (salvage.get(platform.visualY) ??
    salvageDesigns[(platform.designSeed >>> 0) % salvageDesigns.length]);
  const surface = design?.[0] ?? (kind === 'bridge' ? 'wood' : kind === 'stair' || kind === 'ramp' ? 'stone' : 'iron');
  const [finish, trim] = design ? [design[1], design[2]] : [null, null];
  const girder = kind === 'wire';
  const narrow = girder || kind === 'catwalk';
  const depth = thickness - 2;
  const colour = finish ?? (kind === 'bridge' ? '#dfc6a2' : kind === 'stair' ? '#d8d3c5' : kind === 'ramp' ? '#c7c3b3' : '#afc1c5');
  const map = textures[surface];
  const metal = surface === 'iron';
  const topMaterial = new THREE.MeshStandardMaterial({
    color: colour, map, bumpMap: map, bumpScale: metal ? .17 : .7,
    metalness: metal ? .5 : 0, roughness: metal ? .61 : .94,
  });
  topMaterial.color.lerp(new THREE.Color(art.colour), piece ? .28 : .13);
  const lowerMaterial = topMaterial.clone();
  lowerMaterial.color.multiplyScalar(.74);
  const tile = surface === 'brick' ? 142 : surface === 'stone' ? 123 : surface === 'wood' ? 90 : 91;
  if (kind === 'ramp') {
    rampGeometry(platform, topMaterial, group);
  } else {
    if (girder) {
      texturedBox(group, lowerMaterial, w, 2.4, d, 1.2 - thickness, 87);
      texturedBox(group, lowerMaterial, longX ? w : w * .24, depth - 2.4, longX ? d * .24 : d, -depth / 2 - .8, 87);
    } else {
      texturedBox(group, lowerMaterial, w, depth, d, -depth / 2 - 2, tile);
    }
    texturedBox(group, topMaterial, w, 2, d, -1, tile);
  }
  if (kind === 'bridge') bridgeDetails(group, w, d, thickness);
  if (trim) salvageFace(group, trim, w, d, thickness, colour);
  constructionBraces(group, platform, art);
  if (surface === 'iron') {
    for (const x of [-w / 2 + 5, w / 2 - 5]) {
      box(group, narrow ? colours.markings : colours.rails, 3, .8, d - 10, x, .12);
      for (const z of [-d / 2 + 6, d / 2 - 6]) {
        mesh(group, cylinder, colours.bolts, [1.5, 1, 1.5], [x, .6, z]);
      }
    }
    for (const z of [-d / 2 + 5, d / 2 - 5]) {
      box(group, narrow ? colours.markings : colours.rails, w - 10, .8, 3, 0, .12, z);
    }

    if (kind === 'floor' || kind === 'flag') {
      for (let part = 0; part < 4; part++) {
        const stripe = box(group, colours.markings, 7, .7, 15, (part - 1.5) * 11, .48, d / 2 - 16);
        stripe.rotation.y = -.55;
      }
    }
  }
  if (start) {
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 12), z = -d / 2 + 12;
      box(group, colours.iron, 9, 38, 9, x, 19, z);
      box(group, new THREE.MeshBasicMaterial({ color: colours.beacon }), 6, 6, 6, x, 39, z);
    }
  }
  return { group, material: topMaterial, colour: topMaterial.color.clone() };
}

function climber() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  const halo = new THREE.Mesh(new THREE.RingGeometry(17, 20, 32),
    new THREE.MeshBasicMaterial({ color: colours.beacon, transparent: true, opacity: .8, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2;
  group.add(body, halo);
  return { group, body, halo };
}

function placeModel(source, parent, size, position, heading = 0) {
  const fitted = new THREE.Group();
  const { min, max } = new THREE.Box3().setFromObject(source);
  const bounds = new THREE.Vector3().subVectors(max, min);
  const model = source.clone(true);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(.5);
  model.position.sub(new THREE.Vector3(center.x, min.y, center.z));
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = node.receiveShadow = true;
    node.userData.sharedModel = true;
  });
  fitted.add(model);
  fitted.scale.set(size[0] / bounds.x, size[1] / bounds.y, size[2] / bounds.z);
  fitted.position.set(...position);
  fitted.rotation.y = heading;
  parent.add(fitted);
  return fitted;
}

function airborneClip(idle) {
  const folds = {
    thigh_L: .49, thigh_R: .30, calf_L: -.64, calf_R: -.45,
    upperarm_L: .34, upperarm_R: .21, spine: .12,
  };
  const axis = new THREE.Vector3(1, 0, 0);
  const tracks = idle.tracks.map((track) => {
    const values = Array.from(track.values.slice(0, track.getValueSize()));
    const angle = folds[track.name.split('.')[0]];
    if (!angle || !track.name.endsWith('.quaternion')) return new track.constructor(track.name, [0, .62], [...values, ...values]);
    const standing = new THREE.Quaternion().fromArray(values);
    const bent = (amount) => standing.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle * amount)).toArray();
    return new track.constructor(track.name, [0, .17, .62], [...bent(.45), ...bent(1), ...bent(.72)]);
  });
  return new THREE.AnimationClip('airborne', .62, tracks);
}

function loadAssets(canvas, scene, player, addObstacle, placeStageProp) {
  const loader = new GLTFLoader();
  const load = (name, place) => loader.loadAsync(`./assets/${name}.glb`)
    .then(place)
    .catch((error) => { console.warn(`Could not load ${name}`, error); return false; });
  const climber = load('climber/hiker', ({ scene: model, animations }) => {
    const { min, max } = new THREE.Box3().setFromObject(model);
    const scale = PLAYER_HEIGHT / (max.y - min.y);
    model.scale.setScalar(scale);
    model.position.set(-(min.x + max.x) * scale / 2, -min.y * scale, -(min.z + max.z) * scale / 2);
    model.traverse((node) => { if (node.isMesh) node.castShadow = node.receiveShadow = true; });
    player.body.add(model);
    player.mixer = new THREE.AnimationMixer(model);
    const idle = animations.find(({ name }) => name === 'idle');
    const clips = [...animations, airborneClip(idle)];
    player.clips = Object.fromEntries(clips.map((clip) => [clip.name, player.mixer.clipAction(clip)]));
    for (const clip of ['airborne', 'wave']) {
      player.clips[clip].setLoop(THREE.LoopOnce, 1);
      player.clips[clip].clampWhenFinished = true;
    }
    canvas.dataset.climber = 'hiker';
  });
  const rocks = load('models/mountainside', ({ scene: model }) => {
    placeModel(model, scene, [357, 420, 280], [175, -449, 719], .52);
    placeModel(model, scene, [298, 495, 225], [617, -408, 721], -1.88);
    placeModel(model, scene, [260, 354, 176], [666, 671, 481], 1.46);
    placeModel(model, scene, [160, 352, 112], [555, 1330, 540], -.71);
    placeModel(model, scene, [151, 299, 116], [497, 1987, 680], 2.8);
  });
  const cranes = load('models/overhead-crane', ({ scene: model }) => {
    placeModel(model, scene, [270, 80, 90], [449, 123, 460], -.12);
    placeModel(model, scene, [340, 100, 104], [512, 676, 367], .54);
    placeModel(model, scene, [250, 79, 89], [650, 1288, 428], Math.PI / 2);
  });
  const generators = load('models/generator', ({ scene: model }) => {
    placeStageProp(0, model, [38, 35, 34], [430, 0, 980], -.28);
    placeStageProp(3, model, [36, 33, 31], [345, 1658, 515], -.38);
  });
  const barrels = load('models/barrel', ({ scene: model }) => {
    for (const [level, x, y, z, h] of [[0, 234, 0, 953, 27], [0, 240, 0, 981, 24], [0, 212, 0, 974, 27],
      [1, 649, 510, 135, 27], [1, 637, 510, 156, 25], [2, 445, 1054, 740, 29], [2, 464, 1054, 747, 25]]) {
      placeStageProp(level, model, [19, h, 19], [x, y, z], x * .11);
    }
  });
  const models = Object.keys(obstacleModels).map((name) =>
    load(`obstacles/${name}`, ({ scene: model }) => addObstacle(name, model)));
  Promise.all(models).then((results) => {
    canvas.dataset.obstacles = results.includes(false) ? 'partial' : 'loaded';
  });
  Promise.all([climber, rocks, cranes, generators, barrels, ...models]).then((results) => {
    canvas.dataset.assets = results.includes(false) ? 'partial' : 'loaded';
  });
}

function animatePlayer(player, state, speed, dt, won) {
  if (!player.mixer) return;
  const clip = won ? 'wave' : !state.grounded ? 'airborne' : speed > 14 ? 'walk' : 'idle';
  const next = player.clips[clip];
  if (player.action !== next) {
    player.action?.fadeOut(.13);
    next.reset().fadeIn(.13).play();
    player.action = next;
  }
  if (clip === 'walk') next.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 146, .55, 2.25));
  player.mixer.update(dt);
}

function dragonModel() {
  const group = new THREE.Group();
  orb(group, '#658e75', 33, 13, 10);
  orb(group, '#91b78b', 15, 11, 11, 28, 7);
  orb(group, '#e9cf95', 2, 2, 2, 37, 10, 9);
  orb(group, '#e9cf95', 2, 2, 2, 37, 10, -9);
  box(group, '#e7b375', 3, 12, 3, 25, 18).rotation.z = .24;
  orb(group, '#668d78', 23, 4, 4, -39, 0).rotation.z = -.13;
  const wings = [-1, 1].map((side) => {
    const wing = new THREE.Group();
    const membrane = new THREE.BufferGeometry();
    membrane.setAttribute('position', new THREE.Float32BufferAttribute([
      12, 0, 0, -9, 9, side * 56, -38, 0, side * 29,
      12, 0, 0, -38, 0, side * 29, -18, 0, side * 11,
    ], 3));
    membrane.computeVertexNormals();
    wing.add(new THREE.Mesh(membrane, new THREE.MeshStandardMaterial({ color: '#ae7659', side: THREE.DoubleSide })));
    group.add(wing);
    return wing;
  });
  return { group, wings };
}

function summitFlag(scene, goal) {
  const group = new THREE.Group();
  group.position.set(goal.x, goal.y, goal.z);
  box(group, colours.iron, 5, 82, 5, 0, 41);
  orb(group, colours.markings, 5, 5, 5, 0, 84);
  const cloth = new THREE.PlaneGeometry(45, 24, 8, 1);
  cloth.translate(24, 66, 0);
  const flag = new THREE.Mesh(cloth, new THREE.MeshStandardMaterial({ color: colours.beacon, side: THREE.DoubleSide }));
  group.add(flag);
  scene.add(group);
  return flag;
}

function blendSkySeam(sky) {
  const image = document.createElement('canvas');
  image.width = sky.image.width;
  image.height = sky.image.height;
  const context = image.getContext('2d');
  context.drawImage(sky.image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  const margin = Math.round(image.width * .08);
  for (let x = 0; x < margin; x++) {
    const weight = (1 - THREE.MathUtils.smoothstep(x, 0, margin)) / 2;
    for (let y = 0; y < image.height; y++) {
      const left = (y * image.width + x) * 4;
      const right = (y * image.width + image.width - x - 1) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const a = pixels.data[left + channel], b = pixels.data[right + channel];
        pixels.data[left + channel] = THREE.MathUtils.lerp(a, b, weight);
        pixels.data[right + channel] = THREE.MathUtils.lerp(b, a, weight);
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  sky.image = image;
  sky.needsUpdate = true;
}

function disposeStage(stage) {
  const reusable = new Set(materials.values());
  const geometry = new Set(), stageMaterials = new Set();
  stage.traverse((mesh) => {
    if (!(mesh.isMesh || mesh.isLine)) return;
    if (mesh.isInstancedMesh) mesh.dispose();
    if (!mesh.userData.sharedModel && ![cube, sphere, cylinder].includes(mesh.geometry)) geometry.add(mesh.geometry);
    if (mesh.userData.sharedModel && !mesh.userData.stageMaterial || reusable.has(mesh.material)) return;
    stageMaterials.add(mesh.material);
  });
  stage.removeFromParent();
  for (const resource of [...geometry, ...stageMaterials]) resource.dispose();
}

export function createRenderer(canvas, world, follow) {
  const { platformPosition, targetPlatform } = world;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7b9e9f');
  scene.fog = new THREE.FogExp2('#b3c6cb', .00041);
  new THREE.TextureLoader().load('./assets/skybreak-matte.jpg', (sky) => {
    blendSkySeam(sky);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky;
    scene.environment = sky;
    scene.environmentIntensity = .53;
    scene.backgroundRotation.y = 1.75;
    scene.environmentRotation.y = 1.75;
  });
  scene.add(new THREE.HemisphereLight('#d9efff', '#474439', 1.35));
  const key = new THREE.DirectionalLight('#ffe1b0', 3.35);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -290, right: 290, top: 290, bottom: -290, near: 35, far: 1310 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00015;
  key.shadow.normalBias = 1.7;
  key.shadow.radius = 2.6;
  scene.add(key, key.target);

  const textures = loadMaterialTextures();
  const scenery = new THREE.Group();
  scene.add(scenery);
  const cliff = mountainside(scenery, textures.stone);
  buildTrack(scenery);
  const player = climber();
  const dragon = dragonModel();
  scene.add(player.group, dragon.group);
  const flag = summitFlag(scene, { x: 0, y: 0, z: 0 });
  const props = new Map();
  const stageProps = [];
  const sunrise = new THREE.Color('#ffe1b0'), cloudline = new THREE.Color('#e3edff');
  let level, terrain;
  let objects = [];

  loadAssets(canvas, scenery, player, (name, model) => {
    props.set(name, model);
    level?.platforms.forEach((platform, index) => {
      if (platform.obstacle === name) fitObstacle(objects[index], platform, model);
    });
  }, (index, model, size, position, heading) => {
    const object = placeModel(model, scenery, size, position, heading);
    object.visible = index === level?.index;
    stageProps.push({ index, object });
  });

  function setLevel(next) {
    if (level === next) return;
    if (terrain) disposeStage(terrain);
    level = next;
    player.body.rotation.y = follow.yaw + Math.PI;
    terrain = new THREE.Group();
    const offsetY = level.baseY - level.visualBaseY;
    scenery.position.y = offsetY;
    for (const { index, object } of stageProps) object.visible = index === level.index;
    scenery.updateMatrixWorld(true);
    buildSupports(terrain, level.platforms, offsetY);
    objects = level.platforms.map((platform) => buildLedge(platform, textures));
    objects.forEach(({ group }) => terrain.add(group));
    scene.add(terrain);
    flag.parent.position.set(level.goal.x, level.goal.y, level.goal.z);
    key.color.copy(sunrise).lerp(cloudline, level.index / (LEVEL_COUNT - 1));
    level.platforms.forEach((platform, index) => {
      const model = props.get(platform.obstacle);
      if (model) fitObstacle(objects[index], platform, model);
    });
  }
  const lane = box(scene, new THREE.MeshBasicMaterial({ color: '#ff8754', transparent: true, opacity: .55, depthWrite: false }), 1, 2, 16);
  const disc = new THREE.CircleGeometry(1, 24);
  disc.rotateX(-Math.PI / 2);
  const shadow = mesh(scene, disc, new THREE.MeshBasicMaterial({ color: '#172a2b', transparent: true, opacity: .55, depthWrite: false }),
    [15, 1, 13], [0, 0, 0]);
  const landing = new THREE.Group();
  const marker = new THREE.MeshBasicMaterial({ color: colours.beacon, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 17, 32), marker);
  ring.rotation.x = -Math.PI / 2;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(6, 11, 4), marker);
  arrow.rotation.z = Math.PI;
  landing.add(ring, arrow);
  scene.add(landing);
  const ice = new THREE.Color(colours.ice);
  const facing = new THREE.Quaternion();
  const sight = new THREE.Raycaster();
  const eye = new THREE.Vector3(), chase = new THREE.Vector3();
  const lightingOffset = new THREE.Vector3(-335, 520, 322);

  return {
    setLevel,
    resize() {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      follow.resize(clientWidth / clientHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(clientWidth, clientHeight, false);
    },
    reset() {
      player.body.rotation.y = follow.yaw + Math.PI;
    },
    draw(game, dt, reducedMotion) {
      setLevel(game.level);
      const { platforms } = game.level;
      const { player: state, effects, time } = game;
      follow.update(game, dt, reducedMotion);
      const camera = follow.camera;
      const firstPerson = follow.view === 'first';
      player.body.visible = !firstPerson;
      if (!firstPerson) {
        eye.set(state.x, state.y + 29, state.z);
        chase.subVectors(camera.position, eye);
        sight.far = chase.length();
        sight.set(eye, chase.normalize());
        const cliffHit = sight.intersectObject(cliff, false)[0];
        if (cliffHit) camera.position.copy(eye).addScaledVector(chase, Math.max(30, cliffHit.distance - 10));
      }
      key.target.position.set(state.x, state.y + 13, state.z);
      key.position.copy(key.target.position).add(lightingOffset);
      let support;
      for (const [index, platform] of platforms.entries()) {
        const at = platformPosition(platform, time);
        const { x, y, z, w, d } = at;
        const { group, material, colour, surfaces } = objects[index];
        group.position.set(x + w / 2, y, z + d / 2);
        if (material) material.color.copy(effects.slippery > 0 ? ice : colour);
        for (const surface of surfaces ?? []) {
          surface.material.color.copy(surface.colour);
          if (effects.slippery > 0) surface.material.color.lerp(ice, .6);
        }
        if (state.x >= x && state.x <= x + w && state.z >= z && state.z <= z + d) {
          const top = platformSurface(at, state.x, state.z);
          if (top !== null && state.y + 1 >= top && (support === undefined || top > support.y)) support = { y: top, platform: at };
        }
      }

      let next = targetPlatform(game);
      if (next?.stairway) {
        const lastTread = platforms.findLast((platform) => platform.stairway === next.stairway);
        if (lastTread) next = lastTread;
      }
      landing.visible = Boolean(next) && !game.levelComplete;
      if (landing.visible) {
        const at = platformPosition(next, time);
        const { x, y, z } = landingPoint(at);
        landing.position.set(x, y + 1.5, z);
        if (at.slope) ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rampNormal(at));
        else ring.rotation.set(-Math.PI / 2, 0, 0);
        arrow.position.y = 26 + (reducedMotion ? 0 : Math.sin(time * 5) * 4);
      }
      shadow.visible = support !== undefined;
      if (shadow.visible) {
        shadow.position.set(state.x, support.y + .95, state.z);
        if (support.platform.slope) shadow.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, rampNormal(support.platform));
        else shadow.quaternion.identity();
        shadow.material.opacity = Math.max(.05, .28 - (state.y - support.y) / 340);
      }

      player.group.position.set(state.x, state.y, state.z);
      const speed = Math.hypot(state.vx, state.vz);
      if (speed > 22) {
        facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(state.vx, state.vz));
        player.body.quaternion.slerp(facing, 1 - Math.exp(-dt * 14));
      }
      animatePlayer(player, state, speed, dt, game.won);
      player.halo.visible = Boolean(effects.float || effects.boost || effects.bounce);
      player.halo.position.y = effects.float ? 12 + Math.sin(time * 5) * 7 : 4;
      player.halo.material.color.set(effects.float ? '#e2bcff' : effects.boost ? '#b2ffcd' : '#ffca7d');

      const enemy = game.dragon;
      dragon.group.visible = enemy?.phase === 'swoop';
      lane.visible = enemy?.phase === 'warning';
      if (lane.visible) {
        lane.position.set((enemy.startX + enemy.endX) / 2, enemy.y, enemy.z);
        lane.scale.x = Math.abs(enemy.endX - enemy.startX);
      }
      if (dragon.group.visible) {
        dragon.group.position.set(enemy.x, enemy.y, enemy.z);
        dragon.group.rotation.y = enemy.direction === 1 ? 0 : Math.PI;
        dragon.wings.forEach((wing, i) => { wing.rotation.x = (i ? 1 : -1) * Math.sin(time * 22) * .5; });
      }
      if (!reducedMotion) {
        const positions = flag.geometry.attributes.position;
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const x = positions.getX(vertex);
          positions.setZ(vertex, Math.sin(time * 5 - x / 11) * x / 9);
        }
        positions.needsUpdate = true;
      }

      renderer.render(scene, follow.camera);
    },
  };
}
