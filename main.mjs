import { WIDTH, DEPTH, LEVEL_COUNT, levels, advanceLevel, createGame, step, triggerGiftInteraction, platformPosition, targetPlatform } from './engine.mjs';
import { DEFAULT_GIFTS, createTikFinity } from './tikfinity.mjs';
import { GIFT_SLOTS, giftInteractionsForLevel, giftMappingsForLevel } from './level-gifts.mjs';
import { createRenderer } from './render.mjs';
import { createFollowCamera } from './camera.mjs';

const effects = {
  dragon: { name: 'Dragon swoop', icon: '◈', colour: '#fea78a' },
  slippery: { name: 'Flash freeze', icon: '✳', colour: '#92e3fa' },
  boost: { name: 'Power jump', icon: 'ϟ', colour: '#fce492' },
  float: { name: 'Levitation', icon: '◌', colour: '#c6b5ff' },
  flip: { name: 'Gravity flip', icon: '↻', colour: '#faaccc' },
  gust: { name: 'Crosswind', icon: '≋', colour: '#b3efd6' },
  bounce: { name: 'Rebound', icon: '↟', colour: '#ffc88a' },
  drift: { name: 'Optional gift 1', icon: '∿', colour: '#b9cdf6' },
  surge: { name: 'Optional gift 2', icon: '▲', colour: '#c3ebaa' },
  echo: { name: 'Optional gift 3', icon: '⊕', colour: '#f1c2b2' },
};

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const levelSelect = $('level-select');
for (const level of levels) {
  levelSelect.add(new Option(`${level.index + 1}. ${level.name}`, String(level.index)));
}
const follow = createFollowCamera();
const progressKey = 'skybreak-level';
let savedLevel = 0;
try {
  const index = Number(localStorage.getItem(progressKey));
  if (Number.isInteger(index) && index >= 0 && index < LEVEL_COUNT) savedLevel = index;
} catch {
  // Play remains available when browser storage is blocked.
}
let game = createGame(savedLevel);
if (game.level.index === 0) follow.reset(game);
else alignRoute();
let renderer;
try {
  const { platforms, goal } = game.level;
  renderer = createRenderer(canvas, { width: WIDTH, depth: DEPTH, platforms, goal, platformPosition, targetPlatform }, follow);
  renderer.setLevel?.(game.level);
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
let mappings = Object.fromEntries(GIFT_SLOTS.map((id) => [id, DEFAULT_GIFTS[id] ?? '']));
const giftCards = {};
let interactions = {};

try {
  const saved = JSON.parse(localStorage.getItem('biscuit-rising-gifts'));
  for (const id of GIFT_SLOTS) {
    if (typeof saved?.[id] === 'string') mappings[id] = saved[id];
  }
} catch {
  // Play remains available when browser storage is blocked.
}

const connection = createTikFinity({
  effectIds: GIFT_SLOTS,
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
  onGift: applyInteraction,
});

function applyInteraction({ effect, giftName, count = 1, simulated }) {
  const interaction = interactions[effect];
  if (!interaction) return;
  const applied = !game.levelComplete && triggerGiftInteraction(game, interaction.recipe);
  const source = simulated ? 'Test' : count > 1 ? `${giftName} ×${count}` : giftName;
  $('last-gift').textContent = applied
    ? `${source} triggered ${interaction.name}.`
    : `${interaction.name} is unavailable right now.`;
}

function applyGiftMappings() {
  const active = giftMappingsForLevel(mappings, game.level.index);
  connection.setMappings(active);
  interactions = Object.fromEntries(giftInteractionsForLevel(game.level.index).map((interaction) => [interaction.id, interaction]));
  for (const id of GIFT_SLOTS) {
    const { title, detail, gift, button } = giftCards[id];
    setText(title, interactions[id].name);
    setText(detail, interactions[id].description);
    setText(gift, active[id] || 'No live gift assigned');
    button.setAttribute('aria-label', `Test ${interactions[id].name}`);
  }
}

for (const id of GIFT_SLOTS) {
  const effect = effects[id];
  const row = document.createElement('div');
  row.className = 'effect';
  row.innerHTML = `<span class="icon" aria-hidden="true">${effect.icon}</span>
    <div><strong></strong><small class="effect-detail"></small><small class="gift-name"></small></div>
    <button type="button" class="test">Test</button>`;
  row.style.setProperty('--tint', effect.colour);
  const button = row.querySelector('button');
  giftCards[id] = {
    title: row.querySelector('strong'), detail: row.querySelector('.effect-detail'), gift: row.querySelector('.gift-name'), button,
  };
  button.addEventListener('click', () => {
    if (!connection.simulate(id)) applyInteraction({ effect: id, simulated: true });
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
updateLevelView();

$('mappings').addEventListener('submit', (event) => {
  event.preventDefault();
  const next = Object.fromEntries([...new FormData(event.currentTarget)].map(([id, value]) => [id, value.trim()]));
  const names = Object.values(next).filter(Boolean).map((name) => name.toLowerCase());
  if (new Set(names).size !== names.length) {
    $('mapping-status').textContent = 'Use a different gift for each effect.';
    return;
  }
  mappings = next;
  applyGiftMappings();
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

function updateLevelView() {
  const number = game.level.index + 1;
  levelSelect.value = String(game.level.index);
  setText($('level-count'), `Level ${number} of ${LEVEL_COUNT}`);
  setText($('zone'), game.level.name);
  setText($('altitude'), `${Math.floor(game.bestY / 10)} m`);
  setText($('gift-level'), `Level ${number} gifts`);
  applyGiftMappings();
}

function enterLevel(focusGame = true) {
  try {
    localStorage.setItem(progressKey, String(game.level.index));
  } catch {
    // The current level still changes when storage is blocked.
  }
  if (game.level.index === 0) follow.reset(game);
  else alignRoute();
  renderer?.setLevel?.(game.level);
  renderer?.reset?.();
  clearInputs();
  $('finish').hidden = true;
  setText($('last-gift'), 'Waiting for a gift or test.');
  updateLevelView();
  if (focusGame) canvas.focus({ preventScroll: true });
}
levelSelect.addEventListener('change', () => {
  const level = levels[Number(levelSelect.value)];
  if (!level || level.index === game.level.index) return;
  game = createGame(level.index);
  enterLevel(false);
});
$('restart').addEventListener('click', () => {
  const bestY = game.bestY;
  game = createGame(game.level.index);
  game.bestY = Math.max(bestY, game.bestY);
  enterLevel();
});
$('again').addEventListener('click', () => {
  if (game.won) game = createGame();
  else if (!advanceLevel(game)) return;
  enterLevel();
});

function alignRoute() {
  const next = targetPlatform(game);
  if (!next) {
    follow.reset(game);
    return;
  }
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
  if (game.levelComplete || game.won || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('button, input, select, a, summary')) return;
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
function clearInputs() {
  held.clear();
  jumpQueued = false;
  for (const button of document.querySelectorAll('[data-control]')) button.dataset.held = 'false';
}
window.addEventListener('blur', clearInputs);

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

  renderer.draw(game, dt, reduceMotion.matches);
  setText($('altitude'), `${Math.floor(game.bestY / 10)} m`);
  const active = Object.entries(game.effects).filter(([, duration]) => duration > 0)
    .map(([id, duration]) => `${effects[id].name} ${Math.ceil(duration)}s`);
  const warning = game.dragon?.phase === 'warning' ? 'Dragon incoming. Jump or dodge.' : '';
  const notice = warning || game.notice || active.join(' / ');
  $('notice').hidden = !notice || game.levelComplete || game.won;
  setText($('notice'), notice || '');
  if ((game.levelComplete || game.won) && $('finish').hidden) {
    clearInputs();
    setText($('finish-title'), game.won ? 'Summit reached' : `Level ${game.level.index + 1} cleared`);
    setText($('finish-detail'), game.won ? `You climbed all ${LEVEL_COUNT} levels.` : 'The next level has new gift effects.');
    setText($('again'), game.won ? 'Play again' : `Ascend to level ${game.level.index + 2}`);
    $('finish').hidden = false;
    $('again').focus({ preventScroll: true });
  }
  requestAnimationFrame(frame);
}
if (renderer) requestAnimationFrame(frame);
