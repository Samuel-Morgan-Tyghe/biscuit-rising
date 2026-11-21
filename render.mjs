import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/gltf-loader.mjs';

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

function plaque(parent, words, x, y, z, w, h, accent = '#90e8d0') {
  const image = document.createElement('canvas');
  image.width = 512;
  image.height = 128;
  const ctx = image.getContext('2d');
  ctx.fillStyle = '#18292c';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(7, 7, 498, 114);
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 47px system-ui';
  ctx.fillText(words, 256, 65, 465);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  const item = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  item.position.set(x, y, z);
  const reverse = item.clone();
  reverse.rotation.y = Math.PI;
  reverse.position.z -= .3;
  parent.add(item, reverse);
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
  [2346, 545, 674, 93, 80],
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

function buildSupports(scene, platforms) {
  const group = new THREE.Group();
  const steel = '#33464b', paint = '#846340', reinforcement = '#52656a';
  const next = random(953);
  for (const { x, y, z, w, d, thickness, kind } of platforms) {
    const centre = [x + w / 2, y - thickness, z + d / 2];
    const [rx, rz, a, b] = ridgeAt(y - 88);
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
    if (next() > .57) {
      box(group, '#292c2c', 10, 8, 6, centre[0], top - 11, centre[2] + d * .33);
      orb(group, '#dc9d5b', 2.6, 2.6, 3, centre[0], top - 11, centre[2] + d * .33 + 2);
    }
  }

  for (const side of [-1, 1]) {
    const track = [[448, -164, 688], [486, 560, 571], [503, 1090, 622], [507, 1580, 679], [532, 2342, 750]];
    for (let i = 1; i < track.length; i++) {
      const shift = (point) => [point[0] + side * 8, point[1], point[2]];
      beam(group, shift(track[i - 1]), shift(track[i]), 4, '#556e70');
    }
  }
  scene.add(group);
}

function loadMaterialTextures() {
  const loader = new THREE.TextureLoader();
  return Object.fromEntries([['stone', 'slate'], ['iron', 'steel']].map(([type, file]) => {
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

function buildLedge(platform, textures) {
  const group = new THREE.Group();
  const { kind, w, d, zone, checkpoint, thickness } = platform;
  const longX = w >= d;
  const stone = kind === 'stone';
  const narrow = kind === 'wire' || kind === 'catwalk';
  const accent = ['#567781', '#a45c3e', '#718e93', '#b18b5e'][zone];
  const depth = thickness - 2;
  const colour = stone ? '#d4cabc' : kind === 'flag' ? '#b1cfce' : kind === 'wobble' ? '#cfb08b' : '#afc1c5';
  const map = stone ? textures.stone : textures.iron;
  const topMaterial = new THREE.MeshStandardMaterial({
    color: colour, map, bumpMap: map, bumpScale: stone ? 1.2 : .17,
    metalness: stone ? 0 : .53, roughness: stone ? .94 : .58,
  });
  const lowerMaterial = stone ? topMaterial : new THREE.MeshStandardMaterial({
    color: accent, map, metalness: .47, roughness: .67, bumpMap: map, bumpScale: .15,
  });
  texturedBox(group, lowerMaterial, w, depth, d, -depth / 2 - 2, stone ? 123 : 91);
  texturedBox(group, topMaterial, w, 2, d, -1, stone ? 123 : 91);
  if (!stone) {
    for (const x of [-w / 2 + 5, w / 2 - 5]) {
      box(group, narrow ? colours.markings : colours.rails, 3, .8, d - 10, x, .12);
      for (const z of [-d / 2 + 6, d / 2 - 6]) {
        mesh(group, cylinder, colours.bolts, [1.5, 1, 1.5], [x, .6, z]);
      }
    }
    for (const z of [-d / 2 + 5, d / 2 - 5]) {
      box(group, narrow ? colours.markings : colours.rails, w - 10, .8, 3, 0, .12, z);
    }

    if (kind === 'crate') {
      for (let x = -w / 2 + 12; x < w / 2; x += 15) box(group, accent, 7, depth - 3, 2, x, -depth / 2 - 3, d / 2);
      box(group, colours.rust, w + 2, 6, d + 2, 0, -depth + 1);
      plaque(group, 'CARGO', 0, -15, d / 2 + 1.3, 37, 11, '#edd19a');
    } else if (narrow) {
      for (const sign of [-1, 1]) {
        if (longX) {
          box(group, colours.iron, w, 7, 5, 0, -12, sign * (d / 2 - 4));
        } else {
          box(group, colours.iron, 5, 7, d, sign * (w / 2 - 4), -12);
        }
      }
    } else {
      for (let part = 0; part < 4; part++) {
        const stripe = box(group, colours.markings, 7, .7, 15, (part - 1.5) * 11, .48, d / 2 - 16);
        stripe.rotation.y = -.55;
      }
    }
  }
  if (checkpoint) {
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 12), z = -d / 2 + 12;
      box(group, colours.iron, 9, 38, 9, x, 19, z);
      box(group, new THREE.MeshBasicMaterial({ color: colours.beacon }), 6, 6, 6, x, 39, z);
    }
    if (platform.zone) plaque(group, 'Checkpoint', 0, 19, -d / 2 + 5, Math.min(w * .43, 102), 24);
  }
  return { group, material: topMaterial, colour: new THREE.Color(colour) };
}

function climber() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const fallback = new THREE.Group();
  group.add(body);
  body.add(fallback);
  box(fallback, '#ad6037', 17, 15, 12, 0, 20);
  box(fallback, '#26363a', 14, 5, 11, 0, 12);
  orb(fallback, '#b9896b', 6.4, 7.6, 6.4, 0, 33);
  box(fallback, '#d89555', 16, 3, 15, 0, 37);
  orb(fallback, '#da9f5c', 7.5, 4, 7, 0, 40);
  box(fallback, '#395963', 13, 17, 5, 0, 20, -8.5);
  box(fallback, '#8aeacb', 10, 2, 1, 0, 24, -11.2);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 4.5, 12, 0);
    box(leg, '#36494e', 7, 9, 7, 0, -4.5);
    box(leg, '#202b31', 7, 4, 10, 0, -10, 2);
    fallback.add(leg);
    legs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 11, 25, 0);
    box(arm, '#aa5936', 5, 10, 6, 0, -5);
    box(arm, '#2a3b40', 5, 4, 6, 0, -11);
    fallback.add(arm);
    arms.push(arm);
  }
  const halo = new THREE.Mesh(new THREE.RingGeometry(17, 20, 32),
    new THREE.MeshBasicMaterial({ color: colours.beacon, transparent: true, opacity: .8, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);
  body.rotation.y = Math.PI;
  return { group, body, fallback, legs, arms, halo };
}

function placeModel(source, parent, size, position, heading = 0) {
  const fitted = new THREE.Group();
  const { min, max } = new THREE.Box3().setFromObject(source);
  const bounds = new THREE.Vector3().subVectors(max, min);
  const model = source.clone(true);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(.5);
  model.position.sub(new THREE.Vector3(center.x, min.y, center.z));
  model.traverse((node) => { if (node.isMesh) node.castShadow = node.receiveShadow = true; });
  fitted.add(model);
  fitted.scale.set(size[0] / bounds.x, size[1] / bounds.y, size[2] / bounds.z);
  fitted.position.set(...position);
  fitted.rotation.y = heading;
  parent.add(fitted);
}

function recolourClimber(model) {
  const palettes = new Map();
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = node.receiveShadow = true;
    const original = node.material.map;
    if (!original?.image) return;
    if (!palettes.has(original)) {
      const image = document.createElement('canvas');
      image.width = original.image.width;
      image.height = original.image.height;
      const context = image.getContext('2d');
      context.drawImage(original.image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const [r, g, b] = pixels.data.subarray(i, i + 3);
        if (g <= 1.24 * r || g <= 1.16 * b) continue;
        pixels.data[i] = g * 1.11;
        pixels.data[i + 1] = g * .62 + r * .17;
        pixels.data[i + 2] = b * .72 + r * .19;
      }
      context.putImageData(pixels, 0, 0);
      const map = original.clone();
      map.source = new THREE.Source(image);
      map.needsUpdate = true;
      palettes.set(original, map);
    }
    node.material = node.material.clone();
    node.material.map = palettes.get(original);
  });
}

function loadAssets(canvas, scene, player, objects, platforms) {
  const loader = new GLTFLoader();
  const load = (name, place) => loader.loadAsync(`./assets/${name}.glb`)
    .then(place)
    .catch((error) => { console.warn(`Could not load ${name}`, error); return false; });
  const climber = load('climber', ({ scene: model, animations }) => {
    const { min, max } = new THREE.Box3().setFromObject(model);
    const scale = 43 / (max.y - min.y);
    model.scale.setScalar(scale);
    model.position.set(-(min.x + max.x) * scale / 2, -min.y * scale, -(min.z + max.z) * scale / 2);
    recolourClimber(model);
    player.body.add(model);
    player.fallback.visible = false;
    player.mixer = new THREE.AnimationMixer(model);
    player.clips = Object.fromEntries(animations.map((clip) => [clip.name, player.mixer.clipAction(clip)]));
  });
  const rocks = load('models/mountainside', ({ scene: model }) => {
    placeModel(model, scene, [357, 420, 280], [175, -449, 719], .52);
    placeModel(model, scene, [298, 495, 225], [617, -408, 721], -1.88);
    placeModel(model, scene, [260, 354, 176], [666, 671, 481], 1.46);
    placeModel(model, scene, [160, 352, 112], [555, 1330, 540], -.71);
    placeModel(model, scene, [151, 299, 116], [497, 1987, 680], 2.8);
  });
  const containers = load('box-large', ({ scene: model }) => {
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'crate') continue;
      placeModel(model, objects[index].group, [w * .94, platforms[index].thickness - 6, d + 2], [0, 5 - platforms[index].thickness, 0]);
    }
  });
  const catwalks = load('catwalk-straight', ({ scene: model }) => {
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'catwalk') continue;
      placeModel(model, objects[index].group, [w, 8, d + 1], [0, -platforms[index].thickness, 0]);
    }
  });
  const cranes = load('models/overhead-crane', ({ scene: model }) => {
    placeModel(model, scene, [270, 80, 90], [449, 123, 460], -.12);
    placeModel(model, scene, [340, 100, 104], [512, 676, 367], .54);
    placeModel(model, scene, [250, 79, 89], [650, 1288, 428], Math.PI / 2);
  });
  const generators = load('models/generator', ({ scene: model }) => {
    placeModel(model, scene, [38, 35, 34], [430, 0, 980], -.28);
    placeModel(model, scene, [34, 31, 29], [495, 220, 488], .72);
    placeModel(model, scene, [36, 33, 31], [345, 1658, 515], -.38);
  });
  const barrels = load('models/barrel', ({ scene: model }) => {
    for (const [x, y, z, h] of [[234, 0, 953, 27], [240, 0, 981, 24], [210, 0, 974, 27],
      [649, 510, 135, 27], [637, 510, 156, 25], [376, 1054, 744, 29], [391, 1054, 755, 25]]) {
      placeModel(model, scene, [19, h, 19], [x, y, z], x * .11);
    }
  });
  const conveyors = load('conveyor-bars-stripe', ({ scene: model }) => {
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'moving') continue;
      placeModel(model, objects[index].group, [w * .94, 8, d * .94], [0, -platforms[index].thickness, 0], Math.PI);
    }
  });
  Promise.all([climber, rocks, containers, catwalks, cranes, generators, barrels, conveyors]).then((results) => {
    canvas.dataset.assets = results.includes(false) ? 'partial' : 'loaded';
  });
}

function animatePlayer(player, state, speed, time, dt, won) {
  if (player.mixer) {
    const clip = won ? 'Cheer' : !state.grounded ? 'Jump_Idle' : speed > 22 ? 'Running_A' : 'Idle';
    const next = player.clips[clip];
    if (next && player.action !== next) {
      player.action?.fadeOut(.15);
      next.reset().fadeIn(.15).play();
      player.action = next;
    }
    player.mixer.update(dt);
  } else {
    const stride = state.grounded && speed > 22 ? Math.sin(time * (11 + speed / 18)) * .84 : 0;
    player.legs.forEach((leg, i) => { leg.rotation.x = (i ? 1 : -1) * stride; });
    player.arms.forEach((arm, i) => { arm.rotation.x = (i ? -1 : 1) * stride * .65; });
  }
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

export function createRenderer(canvas, world, follow) {
  const { platforms, goal, platformPosition, targetPlatform } = world;
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
  const cliff = mountainside(scene, textures.stone);
  buildSupports(scene, platforms);
  const objects = platforms.map((platform) => buildLedge(platform, textures));
  objects.forEach(({ group }) => scene.add(group));
  const player = climber();
  const dragon = dragonModel();
  scene.add(player.group, dragon.group);
  loadAssets(canvas, scene, player, objects, platforms);
  const flag = summitFlag(scene, goal);
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
    resize() {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      follow.resize(clientWidth / clientHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(clientWidth, clientHeight, false);
    },
    reset() {
      player.body.rotation.y = Math.PI;
    },
    draw(game, dt, reducedMotion) {
      const { player: state, effects, time } = game;
      follow.update(game, dt, reducedMotion);
      const camera = follow.camera;
      eye.set(state.x, state.y + 29, state.z);
      chase.subVectors(camera.position, eye);
      sight.far = chase.length();
      sight.set(eye, chase.normalize());
      const cliffHit = sight.intersectObject(cliff, false)[0];
      if (cliffHit) camera.position.copy(eye).addScaledVector(chase, Math.max(30, cliffHit.distance - 10));
      key.target.position.set(state.x, state.y + 13, state.z);
      key.position.copy(key.target.position).add(lightingOffset);
      let support;
      for (const [index, platform] of platforms.entries()) {
        const { x, y, z, w, d } = platformPosition(platform, time);
        const { group, material, colour } = objects[index];
        group.position.set(x + w / 2, y, z + d / 2);
        material.color.copy(effects.slippery > 0 ? ice : colour);
        if (state.y + 1 >= y && state.x > x && state.x < x + w && state.z > z && state.z < z + d) support = y;
      }

      const next = targetPlatform(game);
      landing.visible = Boolean(next) && !game.won;
      if (landing.visible) {
        const { x, y, z, w, d } = platformPosition(next, time);
        landing.position.set(x + w / 2, y + 1.5, z + d / 2);
        arrow.position.y = 26 + (reducedMotion ? 0 : Math.sin(time * 5) * 4);
      }
      shadow.visible = support !== undefined;
      if (shadow.visible) {
        shadow.position.set(state.x, support + .95, state.z);
        shadow.material.opacity = Math.max(.05, .28 - (state.y - support) / 340);
      }

      player.group.position.set(state.x, state.y, state.z);
      const speed = Math.hypot(state.vx, state.vz);
      if (speed > 22) {
        facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(state.vx, state.vz));
        player.body.quaternion.slerp(facing, 1 - Math.exp(-dt * 14));
      }
      animatePlayer(player, state, speed, time, dt, game.won);      player.halo.visible = Boolean(effects.float || effects.boost || effects.bounce);
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
