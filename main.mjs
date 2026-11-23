import { WIDTH, DEPTH, LEVEL_COUNT, levels, advanceLevel, createGame, step, triggerGiftInteraction, landingPoint, platformPosition, targetPlatform } from './engine.mjs';
import { DEFAULT_GIFTS, createTikFinity } from './tikfinity.mjs';
import { GIFT_EFFECT_NAMES, GIFT_SLOTS, giftInteractionsForLevel, giftMappingsForLevel } from './level-gifts.mjs';
import { createRenderer } from './render.mjs';
import { createFollowCamera } from './camera.mjs';
import { createGiftAudio } from './audio.mjs';
import { createRandomGifts } from './random-gifts.mjs';

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
const directionNames = { left: 'Left', right: 'Right', back: 'Forward', front: 'Backward' };

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const levelSelect = $('level-select');
for (const level of levels) {
  levelSelect.add(new Option(`${level.index + 1}. ${level.name}`, String(level.index)));
}
const follow = createFollowCamera();
const audio = createGiftAudio();
const progressKey = 'skybreak-level';
const viewKey = 'skybreak-view';
const muteKey = 'skybreak-muted';
const randomGiftKey = 'skybreak-random-gifts';
const viewToggle = $('view-toggle');
const soundToggle = $('sound-toggle');
const randomGiftToggle = $('random-gifts-toggle');
const randomGifts = createRandomGifts(GIFT_SLOTS);
let randomGiftsEnabled = false;
let savedLevel = 0;
let viewPreference = 'third';
try {
  const index = Number(localStorage.getItem(progressKey));
  if (Number.isInteger(index) && index >= 0 && index < LEVEL_COUNT) savedLevel = index;
  if (localStorage.getItem(viewKey) === 'first') viewPreference = 'first';
  audio.setMuted(localStorage.getItem(muteKey) === 'true');
  randomGiftsEnabled = localStorage.getItem(randomGiftKey) === 'true';
} catch {
  // Play remains available when browser storage is blocked.
}
let game = createGame(savedLevel);
setRandomGifts(randomGiftsEnabled);
syncView();
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
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
soundToggle.setAttribute('aria-pressed', String(!audio.muted));
soundToggle.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  if (!audio.muted) audio.unlock();
  soundToggle.setAttribute('aria-pressed', String(!audio.muted));
  try {
    localStorage.setItem(muteKey, String(audio.muted));
  } catch {
    // Sound can still be toggled when storage is blocked.
  }
  canvas.focus({ preventScroll: true });
});
function setRandomGifts(enabled) {
  randomGiftsEnabled = enabled;
  randomGifts.setEnabled(enabled, game.time);
  randomGiftToggle.setAttribute('aria-pressed', String(enabled));
  setText($('random-gifts-state'), enabled ? 'On' : 'Off');
}
randomGiftToggle.addEventListener('click', () => {
  setRandomGifts(!randomGiftsEnabled);
  try {
    localStorage.setItem(randomGiftKey, String(randomGiftsEnabled));
  } catch {
    // Random gifts can still be toggled when storage is blocked.
  }
  canvas.focus({ preventScroll: true });
});
viewToggle.addEventListener('click', () => {
  if (viewToggle.disabled) return;
  viewPreference = viewPreference === 'first' ? 'third' : 'first';
  try {
    localStorage.setItem(viewKey, viewPreference);
  } catch {
    // The view still changes when storage is blocked.
  }
  syncView();
  canvas.focus({ preventScroll: true });
});
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

function applyInteraction({ effect, giftName, count = 1, simulated, automatic }) {
  const interaction = interactions[effect];
  if (!interaction) return;
  const applied = !game.levelComplete && triggerGiftInteraction(game, interaction.recipe);
  const source = automatic ? 'Random gift' : simulated ? 'Test' : count > 1 ? `${giftName} ×${count}` : giftName;
  $('last-gift').textContent = applied
    ? `${source} triggered ${interaction.name}.`
    : `${interaction.name} is unavailable right now.`;
  syncView();
}

function testInteraction(id) {
  if (!connection.simulate(id)) applyInteraction({ effect: id, simulated: true });
  if (renderer) {
    gameShell.scrollIntoView({ block: 'start' });
    canvas.focus({ preventScroll: true });
  }
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
  button.addEventListener('click', () => testInteraction(id));
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

const catalogueEntries = levels.flatMap((level) => giftInteractionsForLevel(level.index).map((interaction) => ({
  ...interaction,
  level,
  searchText: `${interaction.key} ${interaction.name} ${interaction.description} ${level.name} level ${level.index + 1}`.toLowerCase(),
})));
const catalogueSearch = $('catalogue-search');
const cataloguePageSize = 12;
let cataloguePage = 0;
let catalogueGiftNames = levels.map((level) => giftMappingsForLevel(mappings, level.index));

function drawCatalogue() {
  const query = catalogueSearch.value.trim().toLowerCase();
  const levelMatch = /^([0-9]+)$/.exec(query) ?? /\blevel\s+([0-9]+)\b/.exec(query);
  const terms = (levelMatch ? query.replace(levelMatch[0], '').trim() : query).split(/\s+/);
  const matches = catalogueEntries.filter(({ level, id, searchText }) => {
    const gift = catalogueGiftNames[level.index][id].toLowerCase();
    return (!levelMatch || level.index + 1 === Number(levelMatch[1])) && terms.every((term) => searchText.includes(term) || gift.includes(term));
  });
  const totalPages = Math.max(1, Math.ceil(matches.length / cataloguePageSize));
  cataloguePage = Math.min(cataloguePage, totalPages - 1);
  const start = cataloguePage * cataloguePageSize;
  const rows = matches.slice(start, start + cataloguePageSize).map((entry) => {
    const row = document.createElement('li');
    row.className = 'catalogue-result';
    row.innerHTML = '<div><strong></strong><p class="catalogue-description"></p><p class="catalogue-gift"></p></div><button class="test" type="button">Jump and test</button>';
    const levelNumber = entry.level.index + 1;
    const gift = catalogueGiftNames[entry.level.index][entry.id];
    setText(row.querySelector('strong'), entry.name);
    setText(row.querySelector('.catalogue-description'), entry.description);
    setText(row.querySelector('.catalogue-gift'), `Level ${levelNumber}, ${entry.level.name}. ${gift ? `Gift ${gift}` : 'Test only'}`);
    const button = row.querySelector('button');
    button.setAttribute('aria-label', `Jump to level ${levelNumber} and test ${entry.name}`);
    button.dataset.levelIndex = String(entry.level.index);
    button.dataset.effectId = entry.id;
    button.dataset.interactionKey = entry.key;
    button.addEventListener('click', () => {
      selectLevel(entry.level.index);
      testInteraction(entry.id);
    });
    return row;
  });
  $('catalogue-results').replaceChildren(...rows);
  setText($('catalogue-count'), `${matches.length.toLocaleString()} ${matches.length === 1 ? 'interaction' : 'interactions'}`);
  $('catalogue-empty').hidden = matches.length > 0;
  $('catalogue-pages').hidden = totalPages < 2;
  setText($('catalogue-page'), `Page ${cataloguePage + 1} of ${totalPages}`);
  $('catalogue-prev').disabled = cataloguePage === 0;
  $('catalogue-next').disabled = cataloguePage + 1 === totalPages;
}

catalogueSearch.addEventListener('input', () => { cataloguePage = 0; drawCatalogue(); });
$('catalogue-clear').addEventListener('click', () => {
  catalogueSearch.value = '';
  cataloguePage = 0;
  drawCatalogue();
  catalogueSearch.focus();
});
$('catalogue-prev').addEventListener('click', () => { cataloguePage--; drawCatalogue(); });
$('catalogue-next').addEventListener('click', () => { cataloguePage++; drawCatalogue(); });
drawCatalogue();

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
  catalogueGiftNames = levels.map((level) => giftMappingsForLevel(mappings, level.index));
  drawCatalogue();
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
  audio.stop();
  randomGifts.reset(game.time);
  try {
    localStorage.setItem(progressKey, String(game.level.index));
  } catch {
    // The current level still changes when storage is blocked.
  }
  syncView();
  if (game.level.index === 0) follow.reset(game);
  else alignRoute();
  renderer?.setLevel?.(game.level);
  clearInputs();
  $('finish').hidden = true;
  setText($('last-gift'), 'Waiting for a gift or test.');
  updateLevelView();
  if (focusGame) canvas.focus({ preventScroll: true });
}
function selectLevel(index) {
  const level = levels[index];
  if (!level || (level.index === game.level.index && !game.levelComplete)) return;
  game = createGame(level.index);
  enterLevel(false);
}
levelSelect.addEventListener('change', () => selectLevel(Number(levelSelect.value)));
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
  const ledge = landingPoint(platformPosition(next, game.time));
  const { x, z } = game.player;
  follow.reset(game, Math.atan2(x - ledge.x, z - ledge.z));
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

function syncView() {
  const remaining = game.levelComplete ? 0 : Math.ceil(game.effects.perspective ?? 0);
  const locked = remaining > 0;
  const view = locked ? (viewPreference === 'first' ? 'third' : 'first') : viewPreference;
  if (follow.view !== view) follow.setView(view);
  if (viewToggle.disabled !== locked) viewToggle.disabled = locked;
  const pressed = String(view === 'first');
  if (viewToggle.getAttribute('aria-pressed') !== pressed) viewToggle.setAttribute('aria-pressed', pressed);
  $('view-lock').hidden = !locked;
  setText($('view-lock'), locked ? `(${remaining}s lock)` : '');
  return locked ? `View locked in ${view === 'first' ? 'first' : 'third'} person for ${remaining}s.` : '';
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

  const randomEffect = randomGifts.next(game.time, game.levelComplete);
  if (randomEffect) applyInteraction({ effect: randomEffect, automatic: true });

  const viewNotice = syncView();
  audio.update(game);
  renderer.draw(game, dt, reduceMotion.matches);
  setText($('altitude'), `${Math.floor(game.bestY / 10)} m`);
  const lockedDirection = directionNames[game.lockedDirection];
  const active = Object.entries(game.effects).filter(([id, duration]) => id !== 'perspective' && GIFT_EFFECT_NAMES[id] && duration > 0)
    .map(([id, duration]) => {
      const name = id === 'directionLock' && lockedDirection ? `${lockedDirection} control lock` : GIFT_EFFECT_NAMES[id];
      return `${name} ${Math.ceil(duration)}s`;
    });
  const warning = game.dragon?.phase === 'warning' ? 'Dragon incoming. Jump or dodge.' : '';
  const notice = [warning || game.notice || active.join(' / '), viewNotice].filter(Boolean).join(' ');
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
