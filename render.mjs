import * as THREE from './vendor/three.module.min.js';

const shades = [
  { sky: '#502944', grid: '#925366', face: '#ffa68c' },
  { sky: '#203e49', grid: '#41756f', face: '#a8e9ab' },
  { sky: '#332a51', grid: '#67629a', face: '#ffc279' },
  { sky: '#344966', grid: '#6d89a9', face: '#d4e5ff' },
];
const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 14, 10);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const materials = new Map();

function matte(colour) {
  if (!materials.has(colour)) materials.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: .78 }));
  return materials.get(colour);
}

function piece(parent, geometry, material, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(geometry, typeof material === 'string' ? matte(material) : material);
  mesh.scale.set(width, height, depth);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function box(parent, colour, w, h, d, x = 0, y = 0, z = 0) {
  return piece(parent, cube, colour, w, h, d, x, y, z);
}

function ball(parent, colour, w, h, d, x = 0, y = 0, z = 0) {
  return piece(parent, sphere, colour, w, h, d, x, y, z);
}

function label(parent, words, x, y, z, w, h, background, ink = '#271b31') {
  const surface = document.createElement('canvas');
  surface.width = 512;
  surface.height = 128;
  const ctx = surface.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(9, 9, 494, 110);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 49px Trebuchet MS, sans-serif';
  ctx.fillText(words, 256, 67, 455);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function decorate(scene, zones, width) {
  const titles = ['The biscuit tin', 'Corner shop', 'Rail replacement service', 'Weather warning'];
  const jokes = ['No crumbs left behind', 'Dandelion and burdock', 'Mind the ridiculous gap', 'Chance of biscuit: 100%'];
  for (const [index, section] of zones.entries()) {
    const palette = shades[index];
    label(scene, titles[index], width * .39, section.y + 312, -134, 260, 55, palette.face);
    label(scene, jokes[index], width * .84, section.y + 486, -100, 204, 43, palette.face).rotation.z = -.10;

    const rows = [];
    const gridStart = section.y - (index === 0 ? 280 : 90);
    for (let y = gridStart; y < section.endY + 70; y += 52) {
      rows.push(-430, y, -190, width + 430, y, -190);
    }
    for (let x = -430; x <= width + 430; x += 52) {
      rows.push(x, gridStart, -190, x, section.endY + 70, -190);
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(rows, 3));
    scene.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: palette.grid, transparent: true, opacity: .42 })));

    const landmark = new THREE.Group();
    landmark.position.set(index % 2 ? width + 55 : -26, section.y + 150, -49);
    landmark.rotation.set(.05, -.24, index % 2 ? -.13 : .18);
    scene.add(landmark);
    if (index === 0) {
      box(landmark, '#54283c', 134, 177, 48);
      box(landmark, '#d76370', 125, 166, 52);
      label(landmark, 'Bourbon creams', 0, 47, 27, 111, 32, '#ffcc9a');
      box(landmark, '#ffa46d', 56, 66, 4, -1, -20, 28).rotation.z = -.24;
      for (let i = 0; i < 4; i++) ball(landmark, '#96543f', 3, 3, 2, i % 2 * 15 - 8, -25 + Math.floor(i / 2) * 16, 31);
    } else if (index === 1) {
      piece(landmark, cylinder, '#63402f', 43, 158, 35, 0, 0, 0);
      ball(landmark, '#63402f', 43, 32, 35, 0, 78, 0);
      piece(landmark, cylinder, '#ffc86b', 17, 31, 15, 0, 106, 0);
      label(landmark, 'Fizzy pop', 0, 8, 36, 77, 47, '#fad588');
    } else if (index === 2) {
      box(landmark, '#362945', 20, 158, 20);
      box(landmark, '#503853', 61, 149, 38, 0, 59, 4);
      ['#f87582', '#ffdb70', '#c7fc8f'].forEach((colour, i) => ball(landmark, colour, 18, 18, 8, 0, 100 - i * 43, 24));
    } else {
      ball(landmark, '#ffbb7d', 54, 54, 21, 9, 99);
      [-35, 0, 41].forEach((x, i) => ball(landmark, '#b7cdec', 45, 20 + 14 * (i % 2), 24, x, 60, 26));
    }
  }
}

function buildLedge(platform) {
  const group = new THREE.Group();
  const { kind, w, d, zone, checkpoint } = platform;
  let top;
  const layers = (bottom, filling, crust) => {
    box(group, bottom, w, 15, d, 0, -14.5);
    box(group, filling, w + 1, 5, d + 1, 0, -12);
    return box(group, crust, w - 2, 7, d - 2, 0, -3.5);
  };
  switch (kind) {
    case 'floor':
    case 'wafer':
    case 'biscuit': {
      top = kind === 'biscuit' ? layers('#7c413e', '#e99d6e', '#c87754') : layers('#ca734c', '#ffe3a2', '#ffbb79');
      const holes = Math.max(1, Math.floor(w / 14));
      for (let i = 0; i < holes; i++) {
        const x = (i + .5) * w / holes - w / 2;
        for (const z of [-d * .28, d * .28]) ball(group, '#97543b', 1.7, .45, 1.7, x, .2, z);
      }
      break;
    }
    case 'wire':
      top = box(group, '#ffe3ad', w, 5, d, 0, -2.5);
      for (const z of [-d / 2, d / 2]) box(group, '#745381', w + 3, 4, 3, 0, -4, z);
      for (const x of [-w / 2, w / 2]) box(group, '#f87887', 7, 8, d + 4, x, -4);
      break;
    case 'bottle':
      top = box(group, '#a9de94', w, 24, d, 0, -12);
      box(group, '#eaba69', w * .48, 18, d + 1, 0, -13);
      box(group, '#f7da8a', 9, 18, d * .78, w / 2 + 3, -13);
      label(group, 'Fizz', 0, -11, d / 2 + .6, w * .42, 14, '#ffe2a4');
      break;
    case 'moving':
      top = box(group, zone === 2 ? '#ffd28b' : '#a8b7ff', w, 6, d, 0, -3);
      box(group, zone === 2 ? '#ce5473' : '#65588c', w, 22, d, 0, -17);
      if (zone === 2) {
        for (let x = -w / 2 + 12; x < w / 2 - 4; x += 17) box(group, '#432c54', 11, 9, 2, x, -12, d / 2);
        for (const x of [-w / 3, w / 3]) ball(group, '#2a223a', 8, 8, 6, x, -25, d / 2 - 3);
      }
      break;
    case 'wobble':
      top = layers('#9b4560', '#f4c789', '#f9a1b9');
      break;
    case 'cloud':
      top = box(group, '#cddaff', w, 7, d, 0, -3.5);
      for (let x = -w / 2 + 9; x < w / 2 - 4; x += 16) {
        ball(group, '#99abd0', 12, 10, 13, x, -8, d / 2 - 7);
      }
      break;
    case 'flag':
      top = layers('#495b56', '#b2d679', '#dafe89');
      break;
    default:
      top = layers('#975f48', '#eb8f61', '#f5b473');
      for (const x of [-w * .38, w * .38]) box(group, '#bf784f', 6, 17, 2, x, -13, d / 2);
  }

  if (checkpoint && zone) {
    box(group, '#ffeec4', 2, 34, 2, -w / 2 + 8, 17, -d / 2 + 6);
    label(group, 'Checkpoint', -w / 2 + 40, 27, -d / 2 + 7, 65, 18, '#dfff8a');
  }

  const colour = top.material.color.clone();
  top.material = top.material.clone();
  return { group, top, colour };
}

function hero() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  box(body, '#a25540', 26, 25, 21, 0, 17);
  box(body, '#ffcf8d', 25, 24, 2, 0, 17, 11);
  box(body, '#e6975a', 27, 3, 22, 0, 9);
  const feet = [-1, 1].map((side) => box(body, '#372137', 9, 6, 13, side * 7, 3, 4));
  for (const x of [-4, 5]) ball(body, '#2e1b31', 2.1, 3.1, 1.6, x, 19, 12.5);
  box(body, '#e8ff72', 31, 4, 26, 0, 30, 0);
  box(body, '#e8ff72', 18, 6, 17, 0, 34, 0);
  const halo = new THREE.Mesh(new THREE.RingGeometry(17, 19, 32),
    new THREE.MeshBasicMaterial({ color: '#f5d5ff', transparent: true, opacity: .85, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);
  return { group, body, feet, halo };
}

function dragonModel() {
  const group = new THREE.Group();
  ball(group, '#a1ef75', 33, 13, 10);
  ball(group, '#d1ff93', 15, 11, 11, 28, 7);
  ball(group, '#291933', 2, 2, 2, 37, 10, 9);
  ball(group, '#291933', 2, 2, 2, 37, 10, -9);
  box(group, '#ffd27b', 3, 12, 3, 25, 18, 0).rotation.z = .24;
  ball(group, '#8ad766', 23, 4, 4, -39, 0).rotation.z = -.13;
  const wings = [-1, 1].map((side) => {
    const wing = new THREE.Group();
    const membrane = new THREE.BufferGeometry();
    membrane.setAttribute('position', new THREE.Float32BufferAttribute([
      12, 0, 0, -9, 9, side * 44, -38, 0, side * 25,
      12, 0, 0, -38, 0, side * 25, -18, 0, side * 11,
    ], 3));
    membrane.computeVertexNormals();
    wing.add(new THREE.Mesh(membrane, new THREE.MeshStandardMaterial({ color: '#ff7fa9', side: THREE.DoubleSide })));
    group.add(wing);
    return wing;
  });
  return { group, wings };
}

function flag(scene, goal) {
  const group = new THREE.Group();
  const fabric = new THREE.Group();
  group.position.set(goal.x, goal.y, goal.z);
  box(group, '#ffecc0', 3, 56, 3, 0, 28);
  ball(group, '#ffd372', 4, 4, 4, 0, 57);
  const tiles = [];
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 3; y++) {
      tiles.push(box(fabric, (x + y) % 2 ? '#42274f' : '#e6ff8b', 8.1, 8.1, 2, 5 + x * 8, 51 - y * 8));
    }
  }
  group.add(fabric);
  scene.add(group);
  return tiles;
}

export function createRenderer(canvas, world) {
  const { width, depth, platforms, zones, goal, platformPosition, targetPlatform } = world;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(shades[0].sky);
  scene.fog = new THREE.FogExp2(shades[0].sky, .00038);
  scene.add(new THREE.HemisphereLight('#fff3d7', '#8366ac', 2.25));
  const key = new THREE.DirectionalLight('#fff1d9', 2.55);
  key.position.set(-420, 850, 580);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(-330, 330, 270, -270, 1, 3200);
  decorate(scene, zones, width);

  const objects = platforms.map((platform) => buildLedge(platform));
  objects.forEach(({ group }) => scene.add(group));
  const player = hero();
  const dragon = dragonModel();
  scene.add(player.group, dragon.group);
  const flagTiles = flag(scene, goal);
  const lane = box(scene, new THREE.MeshBasicMaterial({ color: '#ff9096', transparent: true, opacity: .5, depthWrite: false }), width, 2, 18);
  const disc = new THREE.CircleGeometry(1, 32);
  disc.rotateX(-Math.PI / 2);
  const shadow = piece(scene, disc, new THREE.MeshBasicMaterial({ color: '#351f47', transparent: true, opacity: .5, depthWrite: false }), 13, 1, 11);
  const landing = new THREE.Group();
  const guideMaterial = new THREE.MeshBasicMaterial({ color: '#f1ff86', side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(11, 15, 32), guideMaterial);
  ring.rotation.x = -Math.PI / 2;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(6.5, 12, 4), guideMaterial);
  arrow.rotation.z = Math.PI;
  landing.add(ring, arrow);
  scene.add(landing);
  const sky = new THREE.Color();
  const ice = new THREE.Color('#a1f7ff');
  let centreY = 185;
  let viewHeight = 560;
  let orientation = 0;

  return {
    resize() {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const aspect = clientWidth / clientHeight;
      const halfWidth = Math.max(316, 216 * aspect);
      viewHeight = 2 * halfWidth / aspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      renderer.setSize(clientWidth, clientHeight, false);
    },
    reset() {
      centreY = 185;
      orientation = 0;
      player.body.rotation.y = 0;
    },
    draw(game, dt, reducedMotion) {
      const { player: state, effects, time } = game;
      const zone = Math.max(0, zones.findLastIndex(({ y }) => state.y >= y));
      const targetY = Math.max(viewHeight * .33, state.y + Math.min(viewHeight * .23, 168));
      centreY += (targetY - centreY) * Math.min(1, dt * 8);
      const roll = effects.flip > 0 ? Math.PI : 0;
      orientation = reducedMotion ? roll : orientation + (roll - orientation) * Math.min(1, dt * 17);
      camera.position.set(width / 2 + 220, centreY + 370, depth / 2 + 980);
      camera.lookAt(width / 2, centreY, depth / 2);
      camera.rotateZ(orientation);
      scene.background.lerp(sky.set(shades[zone].sky), Math.min(1, dt * 4));
      scene.fog.color.copy(scene.background);

      let support;
      for (const [index, platform] of platforms.entries()) {
        const { x, y, z, w, d } = platformPosition(platform, time);
        const { group, top, colour } = objects[index];
        group.position.set(x + w / 2, y, z + d / 2);
        top.material.color.copy(effects.slippery > 0 ? ice : colour);
        if (state.y + 1 >= y && state.x > x && state.x < x + w && state.z > z && state.z < z + d) support = { y };
      }

      const next = targetPlatform(game);
      landing.visible = Boolean(next) && !game.won;
      if (landing.visible) {
        const { x, y, z, w, d } = platformPosition(next, time);
        landing.position.set(x + w / 2, y + 1.4, z + d / 2);
        arrow.position.y = 24 + (reducedMotion ? 0 : Math.sin(time * 6) * 3);
      }
      shadow.visible = Boolean(support);
      if (support) {
        shadow.position.set(state.x, support.y + .8, state.z);
        shadow.material.opacity = Math.max(.13, .55 - (state.y - support.y) / 320);
      }

      player.group.position.set(state.x, state.y, state.z);
      const stride = state.grounded && Math.hypot(state.vx, state.vz) > 18 ? Math.sin(time * 25) * 3 : 0;
      player.body.rotation.y += (Math.max(-.58, Math.min(.58, state.vx / 320)) - player.body.rotation.y) * Math.min(1, dt * 13);
      player.feet.forEach((foot, i) => { foot.position.z = 4 + (i ? stride : -stride); });
      player.halo.visible = Boolean(effects.float || effects.boost || effects.bounce);
      player.halo.position.y = effects.float ? 10 + Math.sin(time * 5) * 8 : 4;
      player.halo.material.color.set(effects.float ? '#ebbaff' : effects.boost ? '#e8ff71' : '#ffc879');

      const enemy = game.dragon;
      dragon.group.visible = enemy?.phase === 'swoop';
      lane.visible = enemy?.phase === 'warning';
      if (lane.visible) lane.position.set(width / 2, enemy.y, enemy.z);
      if (dragon.group.visible) {
        dragon.group.position.set(enemy.x, enemy.y, enemy.z);
        dragon.group.rotation.y = enemy.direction === 1 ? 0 : Math.PI;
        dragon.wings.forEach((wing, i) => { wing.rotation.x = (i ? 1 : -1) * Math.sin(time * 22) * .5; });
      }
      if (!reducedMotion) flagTiles.forEach((tile) => {
        tile.position.z = Math.sin(time * 5 - tile.position.x / 18) * tile.position.x / 12;
      });

      renderer.render(scene, camera);
    },
  };
}
