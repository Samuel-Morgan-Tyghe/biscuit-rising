export const WIDTH = 480;
export const HEIGHT = 720;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 30;

const sections = [
  {
    name: "The biscuit tin",
    ledges: [
      [100, 0, 200, "floor"],
      [205, 84, 110, "biscuit"],
      [325, 173, 96, "wafer"],
      [249, 264, 82, "biscuit"],
      [124, 355, 100, "wobble"],
      [94, 450, 54, "wafer"],
      [222, 543, 88, "biscuit"],
      [346, 630, 102, "wafer"],
    ],
  },
  {
    name: "The corner shop",
    ledges: [
      [275, 724, 159, "crate"],
      [153, 813, 72, "bottle"],
      [99, 906, 63, "bottle"],
      [224, 995, 92, "moving"],
      [351, 1084, 80, "bottle"],
      [257, 1178, 92, "wobble"],
      [135, 1268, 100, "crate"],
    ],
  },
  {
    name: "Rail replacement service",
    ledges: [
      [220, 1361, 156, "crate"],
      [348, 1450, 98, "wire"],
      [263, 1543, 95, "moving"],
      [150, 1632, 74, "wire"],
      [85, 1728, 55, "wobble"],
      [206, 1818, 112, "wire"],
      [333, 1910, 90, "moving"],
    ],
  },
  {
    name: "The weather warning",
    ledges: [
      [280, 2000, 160, "cloud"],
      [163, 2090, 91, "cloud"],
      [96, 2186, 60, "wobble"],
      [218, 2278, 81, "moving"],
      [350, 2369, 56, "cloud"],
      [259, 2462, 92, "wire"],
      [144, 2555, 150, "flag"],
    ],
  },
];

export const platforms = sections.flatMap(({ ledges }, zone) => ledges.map(
  ([centre, y, w, kind], index) => ({ x: centre - w / 2, y, w, kind, zone, checkpoint: index === 0 }),
));

export const zones = sections.map(({ name, ledges }, index) => ({
  name,
  y: ledges[0][1],
  endY: sections[index + 1]?.ledges[0][1] ?? ledges.at(-1)[1],
}));

const summit = platforms.at(-1);
export const goal = { x: summit.x + summit.w / 2, y: summit.y };

const durations = { slippery: 9, boost: 9, float: 10, flip: 1.65, gust: 4.5, bounce: 8 };
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const halfWidth = PLAYER_WIDTH / 2;

export function platformPosition(platform, time) {
  const phase = time * 1.8 + platform.y * 0.028;
  const x = platform.x + (platform.kind === "moving" ? 25 * Math.sin(phase) : 0);
  const y = platform.y + (platform.kind === "wobble" ? 8 * Math.sin(phase) : 0);
  return { ...platform, x, y };
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
  };
  respawn(game);
  return game;
}

export function respawn(game) {
  const { x, y, w } = platformPosition(game.checkpoint, game.time);
  Object.assign(game.player, {
    x: x + w / 2, y, vx: 0, vy: 0, grounded: game.checkpoint, coyote: 0, jumpBuffer: 0, jumpHeld: false,
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
      phase: "warning",
      direction,
      elapsed: 0,
      hit: false,
    };
    return true;
  }

  if (!Object.hasOwn(durations, effect)) return false;
  if (effect === "gust") game.gustDirection = game.player.x < WIDTH / 2 ? -1 : 1;
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
  if (!dragon.hit && overlapsX && player.y < dragon.y + 20 && player.y + PLAYER_HEIGHT > dragon.y - 20) {
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
    player.y = ground.y;
  }

  const floating = effects.float > 0 || effects.flip > 0;
  const grounded = Boolean(player.grounded);
  const slippery = effects.slippery > 0;
  const boost = effects.boost > 0;
  const direction = (Number(Boolean(input.right)) - Number(Boolean(input.left))) * (effects.flip ? -1 : 1);

  const speed = boost ? 342 : 265;
  const traction = slippery ? (direction ? 580 : 118) : grounded ? 3100 : 1750;
  const gust = effects.gust > 0 ? game.gustDirection * 110 : 0;
  player.vx = approach(player.vx, direction * speed + gust, traction * dt);

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

  if (player.grounded) {
    const ground = platformPosition(player.grounded, game.time);
    if (player.x + halfWidth <= ground.x || player.x - halfWidth >= ground.x + ground.w) player.grounded = null;
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
        if (oldY + 0.01 >= oldTop && player.y <= position.y
          && player.x + halfWidth > position.x && player.x - halfWidth < position.x + position.w) {
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
  if (player.grounded === summit && Math.abs(player.x - goal.x) < 28) game.won = true;
}
