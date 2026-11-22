import { levels } from "./levels.mjs";
export { LEVEL_COUNT, levels } from "./levels.mjs";

export const WIDTH = 1120;
export const HEIGHT = 720;
export const DEPTH = 1100;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 43;
export const PLAYER_DEPTH = 26;


const durations = { slippery: 9, boost: 9, float: 10, flip: 1.65, gust: 4.5, bounce: 8 };
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const halfWidth = PLAYER_WIDTH / 2;
const halfDepth = PLAYER_DEPTH / 2;

function overPlatform(player, platform) {
  return player.x + halfWidth > platform.x && player.x - halfWidth < platform.x + platform.w
    && player.z + halfDepth > platform.z && player.z - halfDepth < platform.z + platform.d;
}

export function platformTop(platform, x, z) {
  if (!platform.slope) return platform.y;
  const { axis, rise } = platform.slope;
  const length = axis === "x" ? platform.w : platform.d;
  const distance = clamp((axis === "x" ? x : z) - platform[axis], 0, length);
  return platform.y + (rise < 0 ? -rise : 0) + rise * distance / length;
}

function supportHeight(platform, player) {
  const slope = platform.slope;
  const extra = slope ? Math.sign(slope.rise) * (slope.axis === "x" ? halfWidth : halfDepth) : 0;
  return platformTop(platform, player.x + (slope?.axis === "x" ? extra : 0), player.z + (slope?.axis === "z" ? extra : 0));
}

export function targetPlatform(game) {
  const route = game.level.platforms;
  return route[route.indexOf(game.lastPlatform) + 1];
}

export function platformPosition(platform, time) {
  const phase = time * 1.8 * (platform.movementRate ?? 1) + (platform.visualY ?? platform.y) * 0.028;
  const movement = platform.kind === "moving" ? Math.sin(phase) : 0;
  const x = platform.x + 25 * movement;
  const z = platform.z + 18 * movement;
  const y = platform.y + (platform.kind === "wobble" ? 8 * Math.sin(phase) : 0);
  return { ...platform, x, y, z };
}

export function createGame(levelIndex = 0) {
  const level = (Number.isInteger(levelIndex) && levels[levelIndex]) || levels[0];
  const game = {
    level,
    levelComplete: false,
    time: 0,
    player: {},
    effects: Object.fromEntries(Object.keys(durations).map((key) => [key, 0])),
    effectPower: Object.fromEntries(Object.keys(durations).map((key) => [key, 1])),
    giftQueue: [],
    dragon: null,
    bestY: level.baseY,
    won: false,
    notice: "",
    noticeUntil: 0,
    gustDirection: 1,
    gustDepth: 1,
  };
  respawn(game);
  return game;
}

export function respawn(game) {
  const { spawn, platforms: route } = game.level;
  game.lastPlatform = route[0];
  Object.assign(game.player, {
    ...spawn, vx: 0, vy: 0, vz: 0, grounded: route[0], coyote: 0, jumpBuffer: 0, jumpHeld: false,
  });
}

export function advanceLevel(game) {
  if (!game.levelComplete || game.won) return false;
  Object.assign(game, createGame(game.level.index + 1));
  return true;
}

export function trigger(game, effect, { power = 1, seconds, wind } = {}) {
  if (game.levelComplete) return false;

  if (effect === "dragon") {
    if (game.dragon) return false;
    const direction = game.player.x >= WIDTH / 2 ? -1 : 1;
    const startX = game.player.x - direction * 210;
    game.dragon = {
      x: startX,
      startX,
      endX: game.player.x + direction * 245,
      y: game.player.y + 13,
      z: game.player.z,
      phase: "warning",
      direction,
      elapsed: 0,
      warning: .92 / power,
      speed: 650 * power,
      hit: false,
    };
    return true;
  }

  if (!Object.hasOwn(durations, effect)) return false;
  if (effect === "gust") {
    game.gustDirection = wind?.[0] ?? (game.player.x < WIDTH / 2 ? -1 : 1);
    game.gustDepth = wind?.[1] ?? (game.player.z < DEPTH / 2 ? -1 : 1);
  }
  if ((effect === "float" || effect === "flip") && game.effects[effect] === 0) {
    game.player.grounded = null;
    game.player.vy = Math.max(60, game.player.vy);
    game.player.coyote = 0;
  }
  game.effects[effect] = seconds ?? durations[effect];
  game.effectPower[effect] = power;
  return true;
}

function applyGiftAction(game, action) {
  if (action.kind === "effect") return trigger(game, action.effect, action);
  const { player } = game;
  if (action.kind === "brake") {
    player.vx *= action.factor;
    player.vz *= action.factor;
    return true;
  }
  if (action.kind !== "impulse") return false;
  player.vx = clamp(player.vx + action.x, -560, 560);
  player.vz = clamp(player.vz + action.z, -560, 560);
  player.vy = clamp(Math.max(0, player.vy) + action.y, 0, 830);
  player.grounded = null;
  player.coyote = 0;
  return true;
}

export function triggerGiftInteraction(game, recipe) {
  if (game.levelComplete || !recipe?.actions) return false;
  let accepted = false;
  for (const action of recipe.actions) {
    if (action.delay <= 0) accepted = applyGiftAction(game, action) || accepted;
    else if (game.giftQueue.length < 64) {
      game.giftQueue.push({ at: game.time + action.delay, action });
      accepted = true;
    }
  }
  return accepted;
}

function updateDragon(game, dt) {
  const dragon = game.dragon;
  if (!dragon) return;

  dragon.elapsed += dt;
  if (dragon.elapsed < dragon.warning) return;

  dragon.phase = "swoop";
  const oldX = dragon.x;
  dragon.x += dragon.direction * dragon.speed * dt;
  const { player } = game;
  const overlapsX = player.x >= Math.min(oldX, dragon.x) - 45 && player.x <= Math.max(oldX, dragon.x) + 45;
  const overlapsZ = Math.abs(player.z - dragon.z) < 33;
  if (!dragon.hit && overlapsX && overlapsZ && player.y < dragon.y + 20 && player.y + PLAYER_HEIGHT > dragon.y - 20) {
    dragon.hit = true;
    player.grounded = null;
    player.coyote = 0;
    player.vx = dragon.direction * 420;
    player.vy = 235;
    game.notice = "The dragon clipped you";
    game.noticeUntil = game.time + 2;
  }

  if (dragon.direction * (dragon.x - dragon.endX) > 0) game.dragon = null;
}

function land(game, platform, height) {
  const { player } = game;
  player.y = height;
  player.vy = 0;
  player.grounded = platform;
  game.lastPlatform = platform;
}

const axes = ["x", "y", "z"];
const rampAxes = [...axes, "slope"];
const epsilon = 1e-7;
const maxStep = 14;
const noMovement = { x: 0, y: 0, z: 0 };
const levelSolids = levels.map(({ platforms: route }) => route.map((platform) => {
  const { x, y, z, w, d, thickness, slope } = platform;
  const gradient = slope && slope.rise / (slope.axis === "x" ? w : d);
  const intercept = slope && platformTop(platform, x, z) - gradient * platform[slope.axis];
  const reach = slope && (slope.axis === "x" ? halfWidth : halfDepth) * Math.abs(gradient);
  return {
    platform,
    min: { x: x - halfWidth, y: y - thickness - PLAYER_HEIGHT, z: z - halfDepth, slope: intercept - thickness - PLAYER_HEIGHT - reach },
    max: { x: x + w + halfWidth, y: y + Math.abs(slope?.rise ?? 0), z: z + d + halfDepth, slope: intercept + reach },
    slope,
    gradient,
    end: platform,
    offset: noMovement,
    delta: noMovement,
  };
}));

function solidsForStep(levelIndex, from, to) {
  return levelSolids[levelIndex].map((solid) => {
    const { platform } = solid;
    if (platform.kind !== "moving" && platform.kind !== "wobble") return solid;
    const start = platformPosition(platform, from);
    const end = platformPosition(platform, to);
    const offset = Object.fromEntries(axes.map((axis) => [axis, start[axis] - platform[axis]]));
    const delta = Object.fromEntries(axes.map((axis) => [axis, end[axis] - start[axis]]));
    return { ...solid, end, offset, delta };
  });
}

function firstContact(player, motion, solids, elapsed) {
  let hit;
  for (const solid of solids) {
    let entry = -Infinity;
    let exit = Infinity;
    let face;
    for (const axis of (solid.slope ? rampAxes : axes)) {
      const tilted = axis === "slope";
      const shift = tilted ? 0 : solid.offset[axis] + solid.delta[axis] * elapsed;
      const low = solid.min[axis] + shift;
      const high = solid.max[axis] + shift;
      const origin = tilted ? player.y - solid.gradient * player[solid.slope.axis] : player[axis];
      const relative = tilted ? motion.y - solid.gradient * motion[solid.slope.axis] : motion[axis] - solid.delta[axis] * (1 - elapsed);
      if (Math.abs(relative) < epsilon) {
        if (origin <= low + epsilon || origin >= high - epsilon) {
          entry = Infinity;
          break;
        }
        continue;
      }
      const a = (low - origin) / relative;
      const b = (high - origin) / relative;
      if (Math.min(a, b) > entry || (tilted && Math.min(a, b) >= entry - epsilon)) {
        entry = Math.min(a, b);
        face = axis;
      }
      exit = Math.min(exit, Math.max(a, b));
    }
    if (entry >= -epsilon && entry <= 1 && entry < exit - epsilon && (!hit || entry < hit.time)) {
      hit = { solid, axis: face, time: Math.max(0, entry) };
    }
  }
  return hit;
}

function movePlayer(player, motion, solids) {
  // Expand each solid by the player's size, then sweep their feet through it.
  let elapsed = 0;
  for (let contact = 0; contact < 4 && elapsed < 1; contact += 1) {
    const hit = firstContact(player, motion, solids, elapsed);
    const fraction = hit ? hit.time : 1;
    for (const axis of axes) {
      player[axis] += motion[axis] * fraction;
      motion[axis] *= 1 - fraction;
    }
    elapsed += (1 - elapsed) * fraction;
    if (!hit) break;
    const { axis, solid } = hit;
    const height = solid.end.y - player.y;
    if (axis === "slope") {
      motion.y = solid.gradient * motion[solid.slope.axis];
      player.vy = 0;
    } else if (axis !== "y" && player.grounded && elapsed < 1 &&
      (player.grounded.kind === "stair" || solid.platform.kind === "stair") &&
      height > epsilon && height <= maxStep &&
      !firstContact(player, { ...noMovement, y: height }, solids, elapsed)) {
      player.y += height;
    } else {
      motion[axis] = solid.delta[axis] * (1 - elapsed);
      player[`v${axis}`] = 0;
    }
  }
}

export function step(game, input, dt) {
  if (game.levelComplete || dt <= 0) return;
  const { player, effects, effectPower, level } = game;
  const { goal: flag } = level;
  const previousTime = game.time;
  game.time += dt;
  if (game.time >= game.noticeUntil) game.notice = "";

  for (const effect of Object.keys(effects)) effects[effect] = Math.max(0, effects[effect] - dt);
  if (game.giftQueue.length) {
    game.giftQueue = game.giftQueue.filter(({ at, action }) => {
      if (at > game.time) return true;
      applyGiftAction(game, action);
      return false;
    });
  }

  const frameSolids = solidsForStep(level.index, previousTime, game.time);
  const carrier = player.grounded && frameSolids.find(({ platform }) => platform === player.grounded);
  const carry = carrier?.delta ?? noMovement;

  const floating = effects.float > 0 || effects.flip > 0;
  const grounded = Boolean(player.grounded);
  const slippery = effects.slippery > 0;
  const boost = effects.boost > 0;
  const across = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const depth = Number(Boolean(input.front)) - Number(Boolean(input.back));
  const direction = effects.flip ? -1 : 1;
  const speed = (265 + (boost ? 77 * effectPower.boost : 0)) / (across && depth ? Math.SQRT2 : 1);
  const yaw = input.yaw || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const moveX = across * cos + depth * sin;
  const moveZ = depth * cos - across * sin;
  const traction = grounded ? 3100 : 1750;
  const tractionX = slippery ? (Math.abs(moveX) > 0.001 ? 580 : 118) / effectPower.slippery : traction;
  const tractionZ = slippery ? (Math.abs(moveZ) > 0.001 ? 580 : 118) / effectPower.slippery : traction;
  const gustX = effects.gust > 0 ? game.gustDirection * 110 * effectPower.gust : 0;
  const gustZ = effects.gust > 0 ? game.gustDepth * 55 * effectPower.gust : 0;
  player.vx = approach(player.vx, moveX * direction * speed + gustX, tractionX * dt);
  player.vz = approach(player.vz, moveZ * direction * speed + gustZ, tractionZ * dt);

  player.coyote = grounded ? 0.095 : Math.max(0, player.coyote - dt);
  player.jumpBuffer = input.jump && !player.jumpHeld ? 0.12 : Math.max(0, player.jumpBuffer - dt);
  player.jumpHeld = Boolean(input.jump);
  if (!floating && ((player.coyote && player.jumpBuffer) || (grounded && effects.bounce))) {
    const jumpPower = 588 + (boost ? 166 * effectPower.boost : 0);
    player.vy = jumpPower * (effects.bounce ? Math.sqrt(effectPower.bounce) : 1);
    player.grounded = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
  }

  if (!player.grounded) {
    player.vy = floating
      ? approach(player.vy, effects.flip ? 145 * effectPower.flip : 88 * effectPower.float, 820 * dt)
      : Math.max(-940, player.vy - 1270 * dt);
  }

  const motion = { x: player.vx * dt + carry.x, y: player.vy * dt + carry.y, z: player.vz * dt + carry.z };
  if (player.grounded?.slope) {
    motion.y += supportHeight(carrier.end, { x: player.x + motion.x, z: player.z + motion.z }) - player.y;
  }
  movePlayer(player, motion, frameSolids);

  if (player.x < halfWidth || player.x > WIDTH - halfWidth) {
    player.x = clamp(player.x, halfWidth, WIDTH - halfWidth);
    player.vx = 0;
  }
  if (player.z < halfDepth || player.z > DEPTH - halfDepth) {
    player.z = clamp(player.z, halfDepth, DEPTH - halfDepth);
    player.vz = 0;
  }
  if (player.y > flag.y + 270) {
    player.y = flag.y + 270;
    player.vy = Math.min(0, player.vy);
  }

  let support;
  let top = -Infinity;
  if (!floating && player.vy <= 0) {
    for (const solid of frameSolids) {
      if (!overPlatform(player, solid.end)) continue;
      const height = supportHeight(solid.end, player);
      const gap = player.y - height;
      const walkingDown = player.grounded && (carrier.slope || solid.slope ||
        carrier.platform.kind === "stair" || solid.platform.kind === "stair");
      if (height >= top && gap >= -epsilon && gap < (walkingDown ? maxStep : epsilon)) {
        support = solid;
        top = height;
      }
    }
  }
  if (support) land(game, support.platform, top);
  else player.grounded = null;

  if (player.y < level.baseY - 130) {
    respawn(game);
    game.notice = "Back at the level start";
    game.noticeUntil = game.time + 2;
  }

  updateDragon(game, dt);
  game.bestY = Math.max(game.bestY, Math.min(flag.y, player.y));
  if (player.grounded === level.platforms.at(-1) && Math.hypot(player.x - flag.x, player.z - flag.z) < 28) {
    game.levelComplete = true;
    game.won = level.index === levels.length - 1;
  }
}
