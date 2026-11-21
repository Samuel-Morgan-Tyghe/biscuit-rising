import { WIDTH, DEPTH, platforms, zones, goal, createGame, step, trigger, platformPosition, targetPlatform } from './engine.mjs';
import { DEFAULT_GIFTS, createTikFinity } from './tikfinity.mjs';
import { createRenderer } from './render.mjs';
import { createFollowCamera } from './camera.mjs';

const effects = {
  dragon: { name: 'Dragon swoop', icon: '◈', colour: '#fea78a', text: 'Jump or dodge the swoop' },
  slippery: { name: 'Flash freeze', icon: '✳', colour: '#92e3fa', text: 'Lose your grip' },
  boost: { name: 'Power jump', icon: 'ϟ', colour: '#fce492', text: 'Jump higher and further' },
  float: { name: 'Levitation', icon: '◌', colour: '#c6b5ff', text: 'Float for 10 seconds' },
  flip: { name: 'Gravity flip', icon: '↻', colour: '#faaccc', text: 'Turn the world upside down' },
  gust: { name: 'Crosswind', icon: '≋', colour: '#b3efd6', text: 'Get pushed by a gust' },
  bounce: { name: 'Rebound', icon: '↟', colour: '#ffc88a', text: 'Bounce off platforms' },
};

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const follow = createFollowCamera();
let game = createGame();
follow.reset(game);
let renderer;
try {
  renderer = createRenderer(canvas, { width: WIDTH, depth: DEPTH, platforms, zones, goal, platformPosition, targetPlatform }, follow);
  canvas.dataset.renderer = '3d';
} catch (error) {
  console.error(error);
  $('graphics-error').hidden = false;
}
canvas.addEventListener('webglcontextlost', () => { $('graphics-error').hidden = false; });
canvas.addEventListener('webglcontextrestored', () => { $('graphics-error').hidden = true; });
const gameShell = canvas.closest('.game-shell');
const controls = { left: false, right: false, front: false, back: false, jump: false };
const keys = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
  ArrowUp: 'back', w: 'back', ArrowDown: 'front', s: 'front', ' ': 'jump',
};
const held = new Set();
let jumpQueued = false;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let status = 'offline';
let mappings = { ...DEFAULT_GIFTS };

try {
  const saved = JSON.parse(localStorage.getItem('biscuit-rising-gifts'));
  for (const id of Object.keys(effects)) {
    if (typeof saved?.[id] === 'string') mappings[id] = saved[id];
  }
} catch {
  // Play remains available when browser storage is blocked.
}

const connection = createTikFinity({
  onStatus(next) {
    status = next;
    $('connection').dataset.state = next;
    $('connection').textContent = {
      offline: 'Demo mode',
      connecting: 'Connecting to the desktop app…',
      connected: 'Desktop app connected',
      disconnected: 'Couldn’t connect. Check TikFinity Desktop or try the local launch below.',
    }[next];
    $('connect').disabled = next === 'connecting';
    $('connect').textContent = next === 'connected' ? 'Disconnect' : 'Connect';
  },
  onSeenGift({ giftName, sender, count, simulated }) {
    $('last-gift').textContent = simulated
      ? `Test gift: ${giftName}`
      : `Last gift: ${giftName} ×${count} from ${sender}`;
  },
  onGift({ effect, giftName, count, simulated }) {
    const applied = trigger(game, effect);
    $('last-gift').textContent = applied
      ? `${simulated ? 'Test' : count > 1 ? `${giftName} ×${count}` : giftName} triggered ${effects[effect].name}.`
      : `${effects[effect].name} is unavailable right now.`;
  },
});
connection.setMappings(mappings);

for (const [id, effect] of Object.entries(effects)) {
  const row = document.createElement('div');
  row.className = 'effect';
  row.innerHTML = `<span class="icon" aria-hidden="true">${effect.icon}</span>
    <div><strong>${effect.name}</strong><small>${effect.text}</small></div>
    <button type="button" class="test" aria-label="Test ${effect.name}">Test</button>`;
  row.style.setProperty('--tint', effect.colour);
  row.querySelector('button').addEventListener('click', () => {
    if (!connection.simulate(id)) {
      trigger(game, id);
      $('last-gift').textContent = `Tested ${effect.name}. No live gift assigned.`;
    }
    if (renderer) {
      gameShell.scrollIntoView({ block: 'start' });
      canvas.focus({ preventScroll: true });
    }
  });
  $('effects').append(row);

  const field = document.createElement('label');
  field.textContent = effect.name;
  const input = document.createElement('input');
  input.name = id;
  input.maxLength = 80;
  input.value = mappings[id];
  field.append(input);
  $('mapping-fields').append(field);
}

$('mappings').addEventListener('submit', (event) => {
  event.preventDefault();
  const next = Object.fromEntries([...new FormData(event.currentTarget)].map(([id, value]) => [id, value.trim()]));
  const names = Object.values(next).filter(Boolean).map((name) => name.toLowerCase());
  if (new Set(names).size !== names.length) {
    $('mapping-status').textContent = 'Use a different gift for each effect.';
    return;
  }
  mappings = next;
  connection.setMappings(mappings);
  try {
    localStorage.setItem('biscuit-rising-gifts', JSON.stringify(mappings));
    $('mapping-status').textContent = 'Gift mappings saved.';
  } catch {
    $('mapping-status').textContent = 'Mappings applied for this session.';
  }
});

$('connect').addEventListener('click', () => {
  if (status === 'connected') connection.disconnect();
  else connection.connect();
});

if (document.fullscreenEnabled) {
  $('fullscreen').hidden = false;
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await gameShell.requestFullscreen();
      canvas.focus({ preventScroll: true });
    } catch {
      $('fullscreen').hidden = true;
    }
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  });
}

function restart() {
  game = createGame();
  follow.reset(game);
  renderer?.reset?.();
  held.clear();
  jumpQueued = false;
  canvas.focus({ preventScroll: true });
}
$('restart').addEventListener('click', restart);
$('again').addEventListener('click', restart);

function alignRoute() {
  const next = targetPlatform(game);
  if (!next) return;
  const ledge = platformPosition(next, game.time);
  const { x, z } = game.player;
  follow.reset(game, Math.atan2(x - ledge.x - ledge.w / 2, z - ledge.z - ledge.d / 2));
}
$('align-camera').addEventListener('click', () => {
  alignRoute();
  canvas.focus({ preventScroll: true });
});

let drag;
canvas.addEventListener('pointerdown', (event) => {
  if (drag || event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('looking');
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return;
  follow.turn((drag.x - event.clientX) * .007, (event.clientY - drag.y) * .006);
  drag.x = event.clientX;
  drag.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, (event) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    canvas.classList.remove('looking');
  });
}

window.addEventListener('keydown', (event) => {
  if (game.won || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('button, input, a, summary')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === 'r') {
    event.preventDefault();
    if (!event.repeat) alignRoute();
    return;
  }
  if (!keys[key] && key !== 'q' && key !== 'e') return;
  event.preventDefault();
  if (keys[key] === 'jump' && !event.repeat) jumpQueued = true;
  held.add(key);
});
window.addEventListener('keyup', (event) => {
  held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});
window.addEventListener('blur', () => {
  held.clear();
  jumpQueued = false;
  for (const button of document.querySelectorAll('[data-control]')) button.dataset.held = 'false';
});

for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    button.dataset.held = 'true';
    if (button.dataset.control === 'jump') jumpQueued = true;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(event, () => { button.dataset.held = 'false'; });
  }
}

if (renderer) new ResizeObserver(() => renderer.resize()).observe(canvas);

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

const touch = Object.fromEntries([...document.querySelectorAll('[data-control]')].map((button) => [button.dataset.control, button]));
let previous = performance.now();
let remaining = 0;
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  remaining += dt;
  for (const action of Object.keys(controls)) controls[action] = touch[action].dataset.held === 'true';
  for (const key of held) {
    if (keys[key]) controls[keys[key]] = true;
  }
  follow.turn((Number(held.has('e')) - Number(held.has('q'))) * dt * 1.9);
  while (remaining >= 1 / 120) {
    step(game, { ...controls, yaw: follow.yaw, jump: controls.jump || jumpQueued }, 1 / 120);
    jumpQueued = false;
    remaining -= 1 / 120;
  }

  const zoneIndex = zones.findLastIndex(({ y }) => game.player.y >= y);
  const zone = zones[Math.max(0, zoneIndex)];
  renderer.draw(game, dt, reduceMotion.matches);
  setText($('zone'), zone.name);
  setText($('altitude'), `${Math.floor(game.bestY / 10)} m`);
  const active = Object.entries(game.effects).filter(([, duration]) => duration > 0)
    .map(([id, duration]) => `${effects[id].name} ${Math.ceil(duration)}s`);
  const warning = game.dragon?.phase === 'warning' ? 'Dragon incoming. Jump or dodge.' : '';
  const notice = warning || game.notice || active.join(' / ');
  $('notice').hidden = !notice || game.won;
  setText($('notice'), notice || '');
  if (game.won && $('finish').hidden) {
    $('finish').hidden = false;
    $('again').focus({ preventScroll: true });
  }
  if (!game.won) $('finish').hidden = true;
  requestAnimationFrame(frame);
}
if (renderer) requestAnimationFrame(frame);
