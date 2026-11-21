export const WIDTH = 1120;
export const HEIGHT = 720;
export const DEPTH = 1100;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 43;
export const PLAYER_DEPTH = 26;

const sections = [
  {
    name: "Quarry entrance",
    ledges: [
      [330, 0, 260, "floor", 885, 310],
      [330, 65, 164, "stone", 690, 120],
      [400, 148, 150, "stone", 555, 122],
      [555, 220, 168, "deck", 522, 104],
      [730, 271, 210, "catwalk", 490, 92],
      [855, 330, 132, "wobble", 355, 114],
      [865, 420, 158, "deck", 215, 120],
    ],
  },
  {
    name: "Cargo yard",
    ledges: [
      [724, 510, 220, "crate", 175, 160],
      [600, 577, 147, "crate", 230, 127],
      [450, 660, 108, "moving", 249, 105],
      [290, 741, 159, "crate", 273, 139],
      [196, 820, 93, "catwalk", 397, 180],
      [202, 888, 112, "wobble", 565, 113],
      [290, 966, 124, "deck", 680, 149],
    ],
  },
  {
    name: "The gantry",
    ledges: [
      [435, 1054, 174, "deck", 697, 151],
      [605, 1138, 150, "wire", 691, 44],
      [749, 1224, 144, "moving", 601, 94],
      [753, 1224, 44, "catwalk", 456, 220],
      [708, 1310, 111, "moving", 311, 101],
      [565, 1402, 129, "wire", 284, 49],
      [402, 1485, 124, "deck", 317, 112],
      [295, 1578, 99, "wobble", 422, 116],
    ],
  },
  {
    name: "Cloudline summit",
    ledges: [
      [280, 1658, 184, "cloud", 577, 171],
      [401, 1748, 121, "cloud", 713, 108],
      [541, 1839, 113, "wobble", 757, 78],
      [680, 1931, 142, "moving", 703, 96],
      [806, 2017, 72, "wire", 575, 135],
      [744, 2111, 111, "cloud", 423, 96],
      [585, 2204, 126, "deck", 405, 96],
      [478, 2298, 92, "catwalk", 541, 156],
      [546, 2394, 197, "flag", 678, 161],
    ],
  },
];

const thickness = { floor: 42, stone: 32, deck: 20, catwalk: 13, wobble: 20, crate: 38, moving: 20, wire: 13, cloud: 20, flag: 20 };

export const platforms = sections.flatMap(({ ledges }, zone) => ledges.map(
  ([centre, y, w, kind, depthCentre, d], index) => ({
    x: centre - w / 2, y, w, kind, z: depthCentre - d / 2, d, thickness: thickness[kind], zone, checkpoint: index === 0,
  }),
));

export const zones = sections.map(({ name, ledges }, index) => ({
  name,
  y: ledges[0][1],
  endY: sections[index + 1]?.ledges[0][1] ?? ledges.at(-1)[1],
}));

const summit = platforms.at(-1);
export const goal = { x: summit.x + summit.w / 2, y: summit.y, z: summit.z + summit.d / 2 };

const durations = { slippery: 9, boost: 9, float: 10, flip: 1.65, gust: 4.5, bounce: 8 };
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const halfWidth = PLAYER_WIDTH / 2;
const halfDepth = PLAYER_DEPTH / 2;

function overPlatform(player, platform) {
  return player.x + halfWidth > platform.x && player.x - halfWidth < platform.x + platform.w
    && player.z + halfDepth > platform.z && player.z - halfDepth < platform.z + platform.d;
}

export function targetPlatform(game) {
  return platforms[platforms.indexOf(game.lastPlatform) + 1];
}

export function platformPosition(platform, time) {
  const phase = time * 1.8 + platform.y * 0.028;
  const movement = platform.kind === "moving" ? Math.sin(phase) : 0;
  const x = platform.x + 25 * movement;
  const z = platform.z + 18 * movement;
  const y = platform.y + (platform.kind === "wobble" ? 8 * Math.sin(phase) : 0);
  return { ...platform, x, y, z };
}

export function createGame() {
  const game = {
    time: 0,
    player: {},
    effects: Object.fromEntries(Object.keys(durations).map((key) => [key, 0])),
    dragon: null,
    checkpoint: platforms[0],
    bestY: 0,
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
  const { x, y, z, w, d } = platformPosition(game.checkpoint, game.time);
  game.lastPlatform = game.checkpoint;
  Object.assign(game.player, {
    x: x + w / 2, y, z: z + d / 2, vx: 0, vy: 0, vz: 0, grounded: game.checkpoint, coyote: 0, jumpBuffer: 0, jumpHeld: false,
  });
}

export function trigger(game, effect) {
  if (game.won) return false;

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
      hit: false,
    };
    return true;
  }

  if (!Object.hasOwn(durations, effect)) return false;
  if (effect === "gust") {
    game.gustDirection = game.player.x < WIDTH / 2 ? -1 : 1;
    game.gustDepth = game.player.z < DEPTH / 2 ? -1 : 1;
  }
  if ((effect === "float" || effect === "flip") && game.effects[effect] === 0) {
    game.player.grounded = null;
    game.player.vy = Math.max(60, game.player.vy);
    game.player.coyote = 0;
  }
  game.effects[effect] = durations[effect];
  return true;
}

function updateDragon(game, dt) {
  const dragon = game.dragon;
  if (!dragon) return;

  dragon.elapsed += dt;
  if (dragon.elapsed < 0.92) return;

  dragon.phase = "swoop";
  const oldX = dragon.x;
  dragon.x += dragon.direction * 650 * dt;
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

function land(game, platform, position) {
  const { player } = game;
  player.y = position.y;
  player.vy = 0;
  player.grounded = platform;
  game.lastPlatform = platform;
  if (platform.checkpoint && platform.zone > game.checkpoint.zone) {
    game.checkpoint = platform;
    game.notice = `Checkpoint saved at ${zones[platform.zone].name}`;
    game.noticeUntil = game.time + 3;
  }
}

const axes = ["x", "y", "z"];
const epsilon = 1e-7;
const noMovement = { x: 0, y: 0, z: 0 };
const solids = platforms.map((platform) => {
  const { x, y, z, w, d, thickness } = platform;
  return {
    platform,
    min: { x: x - halfWidth, y: y - thickness - PLAYER_HEIGHT, z: z - halfDepth },
    max: { x: x + w + halfWidth, y, z: z + d + halfDepth },
    end: platform,
    offset: noMovement,
    delta: noMovement,
  };
});

function solidsForStep(from, to) {
  return solids.map((solid) => {
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
    for (const axis of axes) {
      const shift = solid.offset[axis] + solid.delta[axis] * elapsed;
      const low = solid.min[axis] + shift;
      const high = solid.max[axis] + shift;
      const origin = player[axis];
      const relative = motion[axis] - solid.delta[axis] * (1 - elapsed);
      if (Math.abs(relative) < epsilon) {
        if (origin <= low + epsilon || origin >= high - epsilon) {
          entry = Infinity;
          break;
        }
        continue;
      }
      const a = (low - origin) / relative;
      const b = (high - origin) / relative;
      if (Math.min(a, b) > entry) {
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
    motion[axis] = solid.delta[axis] * (1 - elapsed);
    player[`v${axis}`] = 0;
  }
}

export function step(game, input, dt) {
  if (game.won || dt <= 0) return;
  const { player, effects } = game;
  const previousTime = game.time;
  game.time += dt;
  if (game.time >= game.noticeUntil) game.notice = "";

  for (const effect of Object.keys(effects)) effects[effect] = Math.max(0, effects[effect] - dt);

  const frameSolids = solidsForStep(previousTime, game.time);
  const carrier = player.grounded && frameSolids.find(({ platform }) => platform === player.grounded);
  const carry = carrier?.delta ?? noMovement;

  const floating = effects.float > 0 || effects.flip > 0;
  const grounded = Boolean(player.grounded);
  const slippery = effects.slippery > 0;
  const boost = effects.boost > 0;
  const across = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const depth = Number(Boolean(input.front)) - Number(Boolean(input.back));
  const direction = effects.flip ? -1 : 1;
  const speed = (boost ? 342 : 265) / (across && depth ? Math.SQRT2 : 1);
  const yaw = input.yaw || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const moveX = across * cos + depth * sin;
  const moveZ = depth * cos - across * sin;
  const traction = grounded ? 3100 : 1750;
  const tractionX = slippery ? (Math.abs(moveX) > 0.001 ? 580 : 118) : traction;
  const tractionZ = slippery ? (Math.abs(moveZ) > 0.001 ? 580 : 118) : traction;
  const gustX = effects.gust > 0 ? game.gustDirection * 110 : 0;
  const gustZ = effects.gust > 0 ? game.gustDepth * 55 : 0;
  player.vx = approach(player.vx, moveX * direction * speed + gustX, tractionX * dt);
  player.vz = approach(player.vz, moveZ * direction * speed + gustZ, tractionZ * dt);

  player.coyote = grounded ? 0.095 : Math.max(0, player.coyote - dt);
  player.jumpBuffer = input.jump && !player.jumpHeld ? 0.12 : Math.max(0, player.jumpBuffer - dt);
  player.jumpHeld = Boolean(input.jump);
  if (!floating && ((player.coyote && player.jumpBuffer) || (grounded && effects.bounce))) {
    player.vy = boost ? 754 : 588;
    player.grounded = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
  }

  if (!player.grounded) {
    player.vy = floating
      ? approach(player.vy, effects.flip ? 145 : 88, 820 * dt)
      : Math.max(-940, player.vy - 1270 * dt);
  }

  movePlayer(player, {
    x: player.vx * dt + carry.x,
    y: player.vy * dt + carry.y,
    z: player.vz * dt + carry.z,
  }, frameSolids);

  if (player.x < halfWidth || player.x > WIDTH - halfWidth) {
    player.x = clamp(player.x, halfWidth, WIDTH - halfWidth);
    player.vx = 0;
  }
  if (player.z < halfDepth || player.z > DEPTH - halfDepth) {
    player.z = clamp(player.z, halfDepth, DEPTH - halfDepth);
    player.vz = 0;
  }
  if (player.y > goal.y + 270) {
    player.y = goal.y + 270;
    player.vy = Math.min(0, player.vy);
  }

  const supportsPlayer = ({ end }) => Math.abs(player.y - end.y) < epsilon && overPlatform(player, end);
  const support = !floating && player.vy <= 0 && (
    carrier && supportsPlayer(carrier) ? carrier : frameSolids.findLast(supportsPlayer)
  );
  if (support) land(game, support.platform, support.end);
  else player.grounded = null;

  if (player.y < game.checkpoint.y - 450 || player.y < -130) {
    respawn(game);
    game.notice = "Back at your checkpoint";
    game.noticeUntil = game.time + 2;
  }

  updateDragon(game, dt);
  game.bestY = Math.max(game.bestY, Math.min(goal.y, player.y));
  if (player.grounded === summit && Math.hypot(player.x - goal.x, player.z - goal.z) < 28) game.won = true;
}
