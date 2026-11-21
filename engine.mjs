export const WIDTH = 480;
export const HEIGHT = 720;
export const DEPTH = 360;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 30;
export const PLAYER_DEPTH = 26;

const sections = [
  {
    name: "The biscuit tin",
    ledges: [
      [100, 0, 200, "floor", 180, 166],
      [205, 84, 110, "biscuit", 112, 66],
      [325, 173, 96, "wafer", 162, 68],
      [249, 264, 82, "biscuit", 232, 74],
      [124, 355, 100, "wobble", 266, 77],
      [94, 450, 54, "wafer", 185, 68],
      [222, 543, 88, "biscuit", 126, 67],
      [346, 630, 102, "wafer", 177, 75],
    ],
  },
  {
    name: "The corner shop",
    ledges: [
      [275, 724, 159, "crate", 242, 126],
      [153, 813, 72, "bottle", 267, 69],
      [99, 906, 63, "bottle", 194, 64],
      [224, 995, 92, "moving", 121, 70],
      [351, 1084, 80, "bottle", 155, 66],
      [257, 1178, 92, "wobble", 227, 78],
      [135, 1268, 100, "crate", 261, 79],
    ],
  },
  {
    name: "Rail replacement service",
    ledges: [
      [220, 1361, 156, "crate", 205, 120],
      [348, 1450, 98, "wire", 158, 34],
      [263, 1543, 95, "moving", 96, 73],
      [150, 1632, 74, "wire", 135, 38],
      [85, 1728, 55, "wobble", 219, 69],
      [206, 1818, 112, "wire", 261, 37],
      [333, 1910, 90, "moving", 194, 72],
    ],
  },
  {
    name: "The weather warning",
    ledges: [
      [280, 2000, 160, "cloud", 122, 121],
      [163, 2090, 91, "cloud", 144, 76],
      [96, 2186, 60, "wobble", 224, 69],
      [218, 2278, 81, "moving", 270, 74],
      [350, 2369, 56, "cloud", 219, 67],
      [259, 2462, 92, "wire", 144, 34],
      [144, 2555, 150, "flag", 97, 116],
    ],
  },
];

export const platforms = sections.flatMap(({ ledges }, zone) => ledges.map(
  ([centre, y, w, kind, depthCentre, d], index) => ({
    x: centre - w / 2, y, w, kind, z: depthCentre - d / 2, d, zone, checkpoint: index === 0,
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
    game.dragon = {
      x: direction === 1 ? -64 : WIDTH + 64,
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

  if (dragon.x > WIDTH + 90 || dragon.x < -90) game.dragon = null;
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

export function step(game, input, dt) {
  if (game.won || dt <= 0) return;
  const { player, effects } = game;
  const previousTime = game.time;
  game.time += dt;
  if (game.time >= game.noticeUntil) game.notice = "";

  for (const effect of Object.keys(effects)) effects[effect] = Math.max(0, effects[effect] - dt);

  if (player.grounded) {
    const oldGround = platformPosition(player.grounded, previousTime);
    const ground = platformPosition(player.grounded, game.time);
    player.x += ground.x - oldGround.x;
    player.z += ground.z - oldGround.z;
    player.y = ground.y;
  }

  const floating = effects.float > 0 || effects.flip > 0;
  const grounded = Boolean(player.grounded);
  const slippery = effects.slippery > 0;
  const boost = effects.boost > 0;
  const across = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const depth = Number(Boolean(input.front)) - Number(Boolean(input.back));
  const direction = effects.flip ? -1 : 1;
  const speed = (boost ? 342 : 265) / (across && depth ? Math.SQRT2 : 1);
  const traction = grounded ? 3100 : 1750;
  const tractionX = slippery ? (across ? 580 : 118) : traction;
  const tractionZ = slippery ? (depth ? 580 : 118) : traction;
  const gustX = effects.gust > 0 ? game.gustDirection * 110 : 0;
  const gustZ = effects.gust > 0 ? game.gustDepth * 55 : 0;
  player.vx = approach(player.vx, across * direction * speed + gustX, tractionX * dt);
  player.vz = approach(player.vz, depth * direction * speed + gustZ, tractionZ * dt);

  player.coyote = grounded ? 0.095 : Math.max(0, player.coyote - dt);
  player.jumpBuffer = input.jump && !player.jumpHeld ? 0.12 : Math.max(0, player.jumpBuffer - dt);
  player.jumpHeld = Boolean(input.jump);
  if (!floating && ((player.coyote && player.jumpBuffer) || (grounded && effects.bounce))) {
    player.vy = boost ? 754 : 588;
    player.grounded = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
  }

  const oldY = player.y;
  player.x += player.vx * dt;
  if (player.x < halfWidth || player.x > WIDTH - halfWidth) {
    player.x = clamp(player.x, halfWidth, WIDTH - halfWidth);
    player.vx = 0;
  }

  player.z += player.vz * dt;
  if (player.z < halfDepth || player.z > DEPTH - halfDepth) {
    player.z = clamp(player.z, halfDepth, DEPTH - halfDepth);
    player.vz = 0;
  }

  if (player.grounded && !overPlatform(player, platformPosition(player.grounded, game.time))) {
    player.grounded = null;
  }

  if (!player.grounded) {
    player.vy = floating
      ? approach(player.vy, effects.flip ? 145 : 88, 820 * dt)
      : Math.max(-940, player.vy - 1270 * dt);
    player.y += player.vy * dt;
    if (player.y > goal.y + 270) {
      player.y = goal.y + 270;
      player.vy = Math.min(0, player.vy);
    }

    if (!floating && player.vy <= 0) {
      for (let index = platforms.length - 1; index >= 0; index -= 1) {
        const platform = platforms[index];
        const position = platformPosition(platform, game.time);
        const oldTop = platformPosition(platform, previousTime).y;
        if (oldY + 0.01 >= oldTop && player.y <= position.y && overPlatform(player, position)) {
          land(game, platform, position);
          break;
        }
      }
    }
  }

  if (player.y < game.checkpoint.y - 235 || player.y < -130) {
    respawn(game);
    game.notice = "Back at your checkpoint";
    game.noticeUntil = game.time + 2;
  }

  updateDragon(game, dt);
  game.bestY = Math.max(game.bestY, Math.min(goal.y, player.y));
  if (player.grounded === summit && Math.hypot(player.x - goal.x, player.z - goal.z) < 28) game.won = true;
}
