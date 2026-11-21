import { WIDTH, PLAYER_WIDTH, PLAYER_HEIGHT, platforms, zones, goal, createGame, step, trigger, platformPosition } from './engine.mjs';
import { DEFAULT_GIFTS, createTikFinity } from './tikfinity.mjs';
import { drawWorld } from './render.mjs';

const effects = {
  dragon: { name: 'Dragon fly-by', icon: '🐉', colour: '#ffac94', text: 'Jump over the swoop' },
  slippery: { name: 'Butter fingers', icon: '🧈', colour: '#ffe881', text: 'Lose your grip' },
  boost: { name: 'Biscuit boost', icon: '⚡', colour: '#ecff87', text: 'Jump higher and further' },
  float: { name: 'Tea-powered levitation', icon: '🫖', colour: '#d9b8ff', text: 'Float for 10 seconds' },
  flip: { name: 'Mind the flip', icon: '↻', colour: '#ffa1bf', text: 'Turn the world upside down' },
  gust: { name: 'British summer', icon: '💨', colour: '#9ae8ff', text: 'Get pushed by a gust' },
  bounce: { name: 'Custard trampoline', icon: '↟', colour: '#ffbb73', text: 'Bounce off platforms' },
};

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const context = canvas.getContext('2d');
const gameShell = canvas.closest('.game-shell');
const controls = { left: false, right: false, jump: false };
const keys = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'jump', w: 'jump', ' ': 'jump' };
const held = new Set();
const view = { height: 720, bottom: -24, rotation: 0, scale: 1 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let game = createGame();
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
  onGift({ effect, giftName, simulated }) {
    const applied = trigger(game, effect);
    $('last-gift').textContent = applied
      ? `${simulated ? 'Test' : giftName} triggered ${effects[effect].name}.`
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
    canvas.focus({ preventScroll: true });
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
  view.bottom = -24;
  view.rotation = 0;
  canvas.focus({ preventScroll: true });
}
$('restart').addEventListener('click', restart);
$('again').addEventListener('click', restart);

window.addEventListener('keydown', (event) => {
  if (game.won || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('button, input, a, summary')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!keys[key]) return;
  event.preventDefault();
  held.add(key);
});
window.addEventListener('keyup', (event) => {
  held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});
window.addEventListener('blur', () => {
  held.clear();
  for (const button of document.querySelectorAll('[data-control]')) button.dataset.held = 'false';
});

for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    button.dataset.held = 'true';
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(event, () => { button.dataset.held = 'false'; });
  }
}

new ResizeObserver(() => {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  view.scale = canvas.width / WIDTH;
  view.height = canvas.height / view.scale;
}).observe(canvas);

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
  for (const key of held) controls[keys[key]] = true;
  while (remaining >= 1 / 120) {
    step(game, controls, 1 / 120);
    remaining -= 1 / 120;
  }

  const target = Math.max(-24, Math.min(goal.y + 330 - view.height, game.player.y - view.height * .32));
  view.bottom += (target - view.bottom) * Math.min(1, dt * 8);
  const rotation = game.effects.flip > 0 ? Math.PI : 0;
  view.rotation = reduceMotion.matches ? rotation : view.rotation + (rotation - view.rotation) * Math.min(1, dt * 20);

  const zoneIndex = zones.findLastIndex(({ y }) => game.player.y >= y);
  const zone = zones[Math.max(0, zoneIndex)];
  drawWorld(context, view, game, {
    width: WIDTH, playerWidth: PLAYER_WIDTH, playerHeight: PLAYER_HEIGHT, platforms, zones, goal, platformPosition,
  });
  setText($('zone'), zone.name);
  setText($('altitude'), `${Math.floor(game.bestY / 10)} m`);
  const active = Object.entries(game.effects).filter(([, duration]) => duration > 0)
    .map(([id, duration]) => `${effects[id].name} ${Math.ceil(duration)}s`);
  const notice = game.notice || active.join(' / ');
  $('notice').hidden = !notice || game.won;
  setText($('notice'), notice || '');
  if (game.won && $('finish').hidden) {
    $('finish').hidden = false;
    $('again').focus({ preventScroll: true });
  }
  if (!game.won) $('finish').hidden = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
