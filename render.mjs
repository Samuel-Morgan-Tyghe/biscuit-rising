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

function surfaceTexture(style) {
  const size = 256;
  const image = document.createElement('canvas');
  image.width = image.height = size;
  const ctx = image.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  const next = random(style === 'stone' ? 207 : 37);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const brightness = 217 + next() * 25;
    pixels.data.set([brightness, brightness, brightness, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  if (style === 'stone') {
    for (let i = 0; i < 27; i++) {
      const x = next() * size, y = next() * size;
      ctx.strokeStyle = i % 2 ? '#101c191d' : '#ffffff33';
      ctx.lineWidth = 1 + next() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + next() * 26, y + next() * 7);
      ctx.lineTo(x + 35, y - next() * 21);
      ctx.stroke();
    }
  } else {
    for (let y = 12; y < size; y += 22) for (let x = 12; x < size; x += 22) {
      const offset = ((y - 12) / 22) % 2 * 8;
      ctx.save();
      ctx.translate(x + offset, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#15181a38';
      ctx.fillRect(-2, -6, 5, 12);
      ctx.fillStyle = '#faffdd50';
      ctx.fillRect(-2, -6, 2, 12);
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
  const item = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  item.position.set(x, y, z);
  parent.add(item);
}

function quarrySpire(scene, x, z, radius, bottom, top, seed) {
  const next = random(seed);
  const sides = 8;
  const section = [0, .2, .54, .81, 1];
  const rings = section.map((level, i) => Array.from({ length: sides }, (_, j) => {
    const angle = j * 2 * Math.PI / sides + i * .07;
    const r = radius * (.76 + next() * .48) * [1.2, 1.04, .9, .81, .56][i];
    return [x + Math.cos(angle) * r + level * radius * .16,
      bottom + (top - bottom) * level + (next() - .5) * radius * .16,
      z + Math.sin(angle) * r];
  }));
  const positions = [], tints = [];
  const rockColours = ['#647a74', '#748479', '#586d6a', '#4f6461', '#849189'].map((colour) => new THREE.Color(colour));
  function triangle(a, b, c, colour) {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) tints.push(colour.r, colour.g, colour.b);
  }
  for (let i = 1; i < rings.length; i++) for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    triangle(rings[i - 1][j], rings[i][j], rings[i][k], rockColours[Math.floor(next() * rockColours.length)]);
    triangle(rings[i - 1][j], rings[i][k], rings[i - 1][k], rockColours[Math.floor(next() * rockColours.length)]);
  }
  const cap = rings.at(-1);
  for (let i = 1; i + 1 < sides; i++) triangle(cap[0], cap[i + 1], cap[i], rockColours[1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

function scenery(scene) {
  quarrySpire(scene, 330, 875, 205, -1850, -35, 21);
  quarrySpire(scene, 115, 600, 130, -1660, 92, 42);
  quarrySpire(scene, 490, 375, 142, -1850, 126, 23);
  quarrySpire(scene, 592, 761, 94, -1800, -25, 8);
  quarrySpire(scene, 1080, 298, 158, -1600, 373, 28);
  quarrySpire(scene, -310, 340, 205, -1800, 620, 19);
  quarrySpire(scene, 1390, -130, 255, -1800, 750, 10);
  quarrySpire(scene, 90, -420, 230, -1800, 420, 74);
  quarrySpire(scene, 1375, 1260, 212, -1800, 760, 26);
  quarrySpire(scene, -620, 1265, 295, -1900, 935, 75);

  for (const [x, y, z] of [[990, 370, 405], [110, 715, 322], [860, 1225, 554], [199, 1545, 494]]) {
    const tower = new THREE.Group();
    tower.position.set(x, y, z);
    scene.add(tower);
    for (const side of [-1, 1]) {
      box(tower, colours.iron, 10, 390, 10, side * 23, -133);
      beam(tower, [side * 23, -250, 1], [-side * 23, -155, 1], 5, colours.rails);
      beam(tower, [side * 23, -155, 1], [-side * 23, -60, 1], 5, colours.rails);
      beam(tower, [side * 23, -60, 1], [-side * 23, 36, 1], 5, colours.rails);
    }
    box(tower, colours.rust, 59, 8, 43, 0, 65);
    orb(tower, '#ffc48d', 4, 5, 4, 0, 73);
  }
}

function buildLedge(platform, textures) {
  const group = new THREE.Group();
  const { kind, w, d, zone, checkpoint } = platform;
  const longX = w >= d;
  const stone = kind === 'stone';
  const narrow = kind === 'wire' || kind === 'catwalk';
  const accent = ['#567781', '#a45c3e', '#718e93', '#b18b5e'][zone];
  const depth = kind === 'floor' ? 39 : stone ? 30 : kind === 'crate' ? 32 : narrow ? 10 : 17;
  const colour = stone ? '#89938a' : kind === 'flag' ? '#73a397' : kind === 'wobble' ? '#b9955e' : accent;
  const topMaterial = new THREE.MeshStandardMaterial({ color: colour, map: stone ? textures.stone : textures.iron, roughness: .8 });
  const underlay = box(group, stone ? colours.stone : colours.iron, w, depth, d, 0, -depth / 2 - 3);
  box(group, topMaterial, w, 3, d, 0, -1.5);
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
  return { group, underlay, material: topMaterial, colour: new THREE.Color(colour) };
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
  fitted.add(model);
  fitted.scale.set(size[0] / bounds.x, size[1] / bounds.y, size[2] / bounds.z);
  fitted.position.set(...position);
  fitted.rotation.y = heading;
  parent.add(fitted);
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
    player.body.add(model);
    player.fallback.visible = false;
    player.mixer = new THREE.AnimationMixer(model);
    player.clips = Object.fromEntries(animations.map((clip) => [clip.name, player.mixer.clipAction(clip)]));
  });
  const rocks = load('rock', ({ scene: model }) => {
    placeModel(model, scene, [104, 150, 126], [146, -67, 704], .6);
    placeModel(model, scene, [138, 178, 124], [511, 28, 387], -2.1);
    placeModel(model, scene, [146, 206, 174], [1018, 243, 297], .5);
    placeModel(model, scene, [81, 115, 101], [236, -31, 719], -.4);
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'stone') continue;
      objects[index].underlay.visible = false;
      placeModel(model, objects[index].group, [w, 52, d], [0, -55, 0]);
    }
  });
  const pines = load('pine', ({ scene: model }) => {
    for (const [x, y, z, h] of [[110, 91, 595, 96], [147, 85, 626, 66], [476, 118, 369, 87], [1095, 367, 296, 95]]) {
      placeModel(model, scene, [h * .46, h, h * .46], [x, y, z], x);
    }
  });
  const containers = load('box-large', ({ scene: model }) => {
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'crate') continue;
      objects[index].underlay.visible = false;
      placeModel(model, objects[index].group, [w, 35, d], [0, -38, 0]);
    }
  });
  const catwalks = load('catwalk-straight', ({ scene: model }) => {
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'catwalk') continue;
      placeModel(model, objects[index].group, [w, 14, d], [0, -25, 0]);
    }
  });
  const cranes = load('crane', ({ scene: model }) => {
    placeModel(model, scene, [137, 189, 110], [592, -26, 761], -1.45);
    placeModel(model, scene, [174, 265, 132], [878, 410, 119], -.2);
    placeModel(model, scene, [130, 232, 146], [68, 776, 508], 1.4);
  });
  const machines = load('machine-fortified', ({ scene: model }) => {
    placeModel(model, scene, [75, 63, 70], [601, -24, 777], 2.25);
    placeModel(model, scene, [90, 75, 72], [972, 405, 227], -.5);
  });
  const conveyors = load('conveyor-bars-stripe', ({ scene: model }) => {
    for (const [index, { kind, w, d }] of platforms.entries()) {
      if (kind !== 'moving') continue;
      placeModel(model, objects[index].group, [w * 0.94, 11, d * 0.94], [0, -27, 0], Math.PI);
    }
  });
  Promise.all([climber, rocks, pines, containers, catwalks, cranes, machines, conveyors]).then((results) => {
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

export function createRenderer(canvas, world, follow) {
  const { platforms, goal, platformPosition, targetPlatform } = world;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7b9e9f');
  scene.fog = new THREE.FogExp2('#b9c8bf', .00062);
  new THREE.TextureLoader().load('./assets/skybreak-matte.jpg', (sky) => {
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky;
    scene.backgroundRotation.y = 2.1;
  });
  scene.add(new THREE.HemisphereLight('#d7eee2', '#68838d', 2.1));
  const key = new THREE.DirectionalLight('#ffe5b1', 3.25);
  key.position.set(-600, 870, 400);
  scene.add(key);
  scenery(scene);

  const textures = { stone: surfaceTexture('stone'), iron: surfaceTexture('iron') };
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
        shadow.material.opacity = Math.max(.13, .63 - (state.y - support) / 260);
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
