import assert from "node:assert/strict";
import test from "node:test";
import { advanceLevel, createGame, landingPoint, LEVEL_COUNT, levels, platformPosition, platformSurface, platformTop, PLAYER_HEIGHT, PLAYER_WIDTH, WIDTH, DEPTH, step, targetPlatform, trigger } from "../engine.mjs";

const dt = 1 / 120;
const { platforms } = levels[0];

function play(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds / dt); frame += 1) step(game, input, dt);
}

function standOn(game, platform) {
  const point = landingPoint(platformPosition(platform, game.time));
  game.lastPlatform = platform;
  Object.assign(game.player, { ...point, vx: 0, vy: 0, vz: 0, grounded: platform });
}

function crossTo(game, target) {
  const start = game.player.grounded;
  const rise = landingPoint(platformPosition(target, game.time)).y > game.player.y;
  const walk = target.slope || target.stairway !== undefined || start?.slope || start?.stairway !== undefined || !rise;
  for (let frame = 0; frame < 190; frame += 1) {
    const { player } = game;
    const point = landingPoint(platformPosition(target, game.time + 0.13));
    const stoppingDistance = (velocity) => velocity * Math.abs(velocity) / (2 * 1750);
    const across = point.x - player.x - stoppingDistance(player.vx);
    const depth = point.z - player.z - stoppingDistance(player.vz);
    step(game, { left: across < -3, right: across > 3, front: depth > 3, back: depth < -3, jump: !walk && frame === 0 }, dt);
    const distance = Math.hypot(point.x - player.x, point.z - player.z);
    const advancedOnStairs = target.stairway !== undefined && player.grounded?.stairway === target.stairway && player.grounded.y > target.y;
    if (game.levelComplete || advancedOnStairs || (player.grounded === target && distance < 19)) return;
  }
  const point = landingPoint(platformPosition(target, game.time));
  const position = ({ x, y, z }) => [x, y, z].map(Math.round).join(",");
  assert.fail(`level ${game.level.index + 1} missed ${target.pieceCode} ${target.obstacle ?? target.kind} at ${position(point)} from ${start?.pieceCode}, ended at ${position(game.player)} on ${game.player.grounded?.pieceCode}`);
}

function climb(game) {
  for (let transfer = 0; targetPlatform(game) && transfer < game.level.platforms.length; transfer += 1) {
    crossTo(game, targetPlatform(game));
  }
}

test("all fifty stages are distinct, playable and strictly higher than the previous finish", () => {
  const game = createGame();
  assert.equal(levels.length, LEVEL_COUNT);
  assert.equal(LEVEL_COUNT, 50);
  assert.equal(advanceLevel(game), false);
  assert.equal(createGame("length").level, levels[0]);
  const layouts = new Set();
  const pieceSeeds = new Set();
  const pieceCodes = new Set();
  let pieces = 0;
  for (const level of levels) {
    assert.equal(game.level, level);
    if (level.index > 0) assert(level.spawn.y > levels[level.index - 1].goal.y);
    const route = level.platforms;
    assert(route.every(({ x, z, w, d }) => x >= 0 && z >= 0 && x + w <= WIDTH && z + d <= DEPTH));
    for (const platform of route) {
      const { designSeed, pieceCode } = platform;
      assert(Number.isInteger(designSeed));
      const point = landingPoint(platform);
      assert.equal(platformSurface(platform, point.x, point.z), point.y, `solid landing target for ${pieceCode}`);
      pieceSeeds.add(designSeed);
      pieceCodes.add(pieceCode);
      pieces += 1;
    }
    const layout = route.slice(1).flatMap((platform, index) => {
      const previous = route[index];
      if (platform.kind === "stair" && previous.stairway === platform.stairway) return [];
      const dx = platform.x + platform.w / 2 - previous.x - previous.w / 2;
      const dz = platform.z + platform.d / 2 - previous.z - previous.d / 2;
      const direction = Math.abs(dx) > Math.abs(dz) ? `x${Math.sign(dx)}` : `z${Math.sign(dz)}`;
      const action = ["ramp", "bridge", "stair", "flag"].includes(platform.kind) ? platform.kind : "deck";
      return [`${action}:${direction}`];
    });
    layouts.add(layout.join("|"));
    climb(game);
    assert.equal(game.levelComplete, true);
    assert.equal(game.bestY, level.goal.y);
    assert.equal(trigger(game, "dragon"), false);
    assert.equal(game.won, level.index === LEVEL_COUNT - 1);
    assert.equal(advanceLevel(game), level.index < LEVEL_COUNT - 1);
  }
  assert.equal(layouts.size, LEVEL_COUNT);
  assert.equal(pieceSeeds.size, pieces);
  assert.equal(pieceCodes.size, pieces);
  assert.equal(game.level.index, LEVEL_COUNT - 1);
  assert.equal(game.won, true);
});

test("every level increases the tallest required jump from solid ground", () => {
  let previous = 0;
  for (const level of levels) {
    const rises = level.platforms.slice(1).map((target, index) => {
      const start = level.platforms[index];
      const walk = target.slope || start.slope || target.stairway !== undefined || start.stairway !== undefined;
      return walk ? 0 : target.y - start.y;
    });
    const hardestJump = Math.max(...rises);
    assert(hardestJump > previous, `level ${level.index + 1} must demand a higher jump`);
    previous = hardestJump;
  }

  const ordinary = (group) => group.flatMap((level) => level.platforms.filter(({ kind }) =>
    !["ramp", "stair", "bridge", "flag", "floor"].includes(kind)));
  const meanWidth = (pieces) => pieces.reduce((sum, { w, d }) => sum + Math.min(w, d), 0) / pieces.length;
  const easy = ordinary(levels.slice(4, 12));
  const hard = ordinary(levels.slice(-8));
  assert(meanWidth(hard) < meanWidth(easy) - 18);
  assert(hard.filter(({ kind }) => kind === "moving").length > easy.filter(({ kind }) => kind === "moving").length);
  assert(levels[4].platforms[0].movementRate < levels.at(-1).platforms[0].movementRate);
});

test("generated jump slabs leave standing room throughout both wobble cycles", () => {
  for (const level of levels.slice(4)) {
    const firstCrossing = level.platforms.findIndex(({ kind }) => ["bridge", "ramp", "stair"].includes(kind));
    for (let index = 1; index < firstCrossing; index += 1) {
      const lower = level.platforms[index - 1];
      const upper = level.platforms[index];
      const highestFloor = lower.y + (lower.kind === "wobble" ? 8 : 0);
      const lowestCeiling = upper.y - upper.thickness - (upper.kind === "wobble" ? 8 : 0);
      assert(lowestCeiling - highestFloor >= PLAYER_HEIGHT, `level ${level.index + 1}, piece ${upper.pieceCode}`);
    }
  }
});

test("the opening gear needs forward movement and has a landable rim", () => {
  const game = createGame();
  const launchX = game.player.x;
  const launchZ = game.player.z;
  const target = platforms[1];
  assert.equal(target.obstacle, "gear");
  play(game, 0.94, { jump: true });
  assert.equal(game.player.x, launchX);
  assert.equal(game.player.z, launchZ);
  assert.equal(game.player.grounded, platforms[0]);

  step(game, {}, dt);
  crossTo(game, target);
  assert.equal(game.player.grounded, target);
  assert.equal(game.player.y, platformSurface(target, game.player.x, game.player.z));
});

test("a falling climber passes through the opening gear hole", () => {
  const game = createGame();
  const gear = platforms[1];
  const x = gear.x + gear.w / 2;
  const z = gear.z + gear.d / 2;
  assert.equal(platformSurface(gear, x, z), null);
  Object.assign(game.player, { x, y: gear.y + 55, z, grounded: null, vy: -420 });
  play(game, 0.3);
  assert(game.player.y < gear.y - gear.thickness);
  assert.notEqual(game.player.grounded, gear);
});

test("the full quarry staircase can be run up and down without jumping", () => {
  const game = createGame();
  const steps = platforms.filter(({ stairway }) => stairway === 65);
  standOn(game, platforms[1]);
  game.player.x = steps[0].x + steps[0].w / 2;
  game.player.z = 708;
  const climbed = new Set();
  for (let frame = 0; frame < 108; frame += 1) {
    step(game, { back: true }, dt);
    if (steps.includes(game.player.grounded)) climbed.add(game.player.grounded);
  }
  assert.equal(climbed.size, steps.length);
  const landing = platforms[platforms.indexOf(steps.at(-1)) + 1];
  assert.equal(game.player.y, landingPoint(landing).y);
  assert.equal(game.player.grounded, landing);
  play(game, 1, { front: true });
  assert.equal(game.player.grounded, platforms[1]);
  assert.equal(game.player.y, landingPoint(platforms[1]).y);
});

test("the quarry ramp is a continuous uphill surface into a runnable bridge", () => {
  const game = createGame();
  const ramp = platforms.find(({ kind }) => kind === "ramp");
  const preceding = platforms[platforms.indexOf(ramp) - 1];
  const bridge = platforms[platforms.indexOf(ramp) + 1];
  standOn(game, preceding);
  game.player.z = ramp.z + ramp.d / 2;
  game.player.y = platformSurface(preceding, game.player.x, game.player.z);
  assert.notEqual(game.player.y, null);
  const heights = new Set();
  for (let frame = 0; frame < 120; frame += 1) {
    step(game, { right: true }, dt);
    assert(game.player.grounded, "the trail should stay underfoot");
    if (game.player.grounded === ramp) heights.add(game.player.y);
  }
  assert(heights.size > 25, "height should change continuously rather than in steps");
  assert.equal(game.player.grounded, bridge);
  assert(game.player.x - bridge.x > 100);
  play(game, 0.81, { left: true });
  assert.equal(game.player.grounded, ramp);
  assert(game.player.y < bridge.y - 8);
  assert(game.player.y > ramp.y);
});

test("the thin part of an inclined ramp stays solid under a fast upward sweep", () => {
  const game = createGame();
  const ramp = platforms.find(({ kind }) => kind === "ramp");
  const x = 661;
  const z = ramp.z + ramp.d / 2;
  const ceiling = platformTop(ramp, x - PLAYER_WIDTH / 2, z) - ramp.thickness - PLAYER_HEIGHT;
  Object.assign(game.player, { x, y: ceiling - 8, z, grounded: null, vy: 754 });
  step(game, {}, 0.15);
  assert(Math.abs(game.player.y - ceiling) < 1e-7);
  assert.equal(game.player.vy, 0);
  assert.equal(game.player.grounded, null);
});

test("boosted, levitating, and inverted motion cannot pass through a ledge from below", () => {
  const floor = platforms[0];
  const ceiling = floor.y - floor.thickness - PLAYER_HEIGHT;
  for (const effect of ["boost", "float", "flip"]) {
    const game = createGame();
    trigger(game, effect);
    Object.assign(game.player, {
      ...landingPoint(floor), y: ceiling - 8, grounded: null, vy: 754,
    });
    step(game, {}, 0.2);
    assert.equal(game.player.y, ceiling, effect);
    assert.equal(game.player.vy, 0, effect);
    assert.equal(game.player.grounded, null, effect);
  }
});

test("side contact stops movement through a ledge but allows sliding along it", () => {
  const game = createGame();
  const floor = platforms[0];
  const wall = floor.x - PLAYER_WIDTH / 2;
  const z = floor.z + floor.d / 2;
  Object.assign(game.player, { x: wall - 40, y: -5, z, grounded: null, vx: 900 });
  step(game, { right: true, front: true }, 0.1);
  assert.equal(game.player.x, wall);
  assert.equal(game.player.vx, 0);
  assert(game.player.z > z + 15);
});

test("a fast fall lands on the first visible solid surface it hits", () => {
  const game = createGame();
  const platform = platforms[1];
  const point = landingPoint(platform);
  Object.assign(game.player, { ...point, y: point.y + 150, grounded: null, vy: -940 });
  step(game, {}, 0.26);
  assert.equal(game.player.y, point.y);
  assert.equal(game.player.vy, 0);
  assert.equal(game.player.grounded, platform);
});

test("a moving lift pushes the player along its side and carries the player on top", () => {
  const platform = { ...levels[1].platforms.find(({ kind }) => kind === "moving"), mesh: undefined, footprint: undefined, landing: undefined };
  const fixture = () => {
    const game = createGame(1);
    game.level = { ...game.level, platforms: [platform] };
    return game;
  };
  const phase = platform.visualY * 0.028;
  const startTime = (Math.ceil(phase / (2 * Math.PI)) * 2 * Math.PI - phase) / 1.8;
  const start = platformPosition(platform, startTime);
  const end = platformPosition(platform, startTime + 0.1);
  assert(end.x > start.x + 1);

  const side = fixture();
  side.time = startTime;
  Object.assign(side.player, {
    x: start.x + start.w + PLAYER_WIDTH / 2 + 1,
    y: start.y - 12, z: start.z + start.d / 2, grounded: null,
  });
  step(side, {}, 0.1);
  assert(Math.abs(side.player.x - end.x - end.w - PLAYER_WIDTH / 2) < 1e-7);

  const top = fixture();
  top.time = startTime;
  standOn(top, platform);
  step(top, {}, 0.1);
  assert(Math.abs(top.player.x - end.x - end.w / 2) < 1e-7);
  assert(Math.abs(top.player.z - end.z - end.d / 2) < 1e-7);
  assert.equal(top.player.grounded, platform);
});

test("orbiting the camera rotates horizontal movement in world space", () => {
  const game = createGame();
  const { x, z } = game.player;
  play(game, 0.22, { back: true, yaw: Math.PI / 2 });
  assert(game.player.x < x - 35);
  assert(Math.abs(game.player.z - z) < 0.01);
  assert(game.player.vx < -240);
});

test("touching a level flag freezes the stage and unlocks precisely the next ascent", () => {
  const game = createGame();
  standOn(game, platforms.at(-1));
  game.player.z += 42;
  play(game, 0.1);
  assert.equal(game.levelComplete, false);
  assert.equal(advanceLevel(game), false);
  assert.equal(trigger(game, "boost"), true);
  play(game, 0.13, { back: true });
  assert.equal(game.levelComplete, true);
  const arrival = { ...game.player };
  play(game, 1, { right: true, jump: true });
  assert.deepEqual(game.player, arrival);
  assert.equal(advanceLevel(game), true);
  assert.equal(game.level, levels[1]);
  assert.equal(game.effects.boost, 0);
  assert.equal(game.levelComplete, false);
  assert.equal(game.player.y, levels[1].baseY);
  assert.equal(advanceLevel(game), false);
});

test("falling restarts the same level at its entrance and the next jump works", () => {
  const game = createGame(13);
  const { level } = game;
  for (let frame = 0; frame < 360 && !game.notice; frame += 1) {
    step(game, { front: true }, dt);
  }
  assert.equal(game.notice, "Back at the level start");
  assert.equal(game.level, level);
  assert.equal(game.player.grounded, level.platforms[0]);
  assert.equal(game.player.z, level.spawn.z);
  const feet = game.player.y;
  play(game, 0.12, { jump: true });
  assert(game.player.y > feet + 50);
});

test("the dragon telegraphs its swoop, clips an idle player and can be jumped", () => {
  const idle = createGame();
  const startingX = idle.player.x;
  assert.equal(trigger(idle, "dragon"), true);
  assert.equal(trigger(idle, "dragon"), false);
  play(idle, 0.9);
  assert.equal(idle.dragon.phase, "warning");
  play(idle, 0.5);
  assert.equal(idle.dragon.phase, "swoop");
  assert.equal(idle.dragon.hit, true);
  assert(idle.player.x > startingX + 35);

  const jumper = createGame();
  trigger(jumper, "dragon");
  play(jumper, 1.01);
  play(jumper, 0.42, { jump: true });
  assert.equal(jumper.dragon.hit, false);
  assert(jumper.player.y > 60);
  play(jumper, 1);
  assert.equal(jumper.dragon, null);

  const dodger = createGame();
  trigger(dodger, "dragon");
  play(dodger, 0.25, { front: true });
  play(dodger, 1.15);
  assert.equal(dodger.dragon.hit, false);
  assert.equal(dodger.player.grounded, platforms[0]);
});

test("slippery surfaces preserve momentum and boosted jumps add height", () => {
  const baseline = createGame();
  const sliding = createGame();
  trigger(sliding, "slippery");
  for (const game of [baseline, sliding]) {
    play(game, 0.38, { right: true, back: true });
    play(game, 0.3);
  }
  assert(sliding.player.vx > baseline.player.vx + 130);
  assert(sliding.player.vz < baseline.player.vz - 130);

  const normal = createGame();
  const boosted = createGame();
  trigger(boosted, "boost");
  for (const game of [normal, boosted]) play(game, 0.5, { jump: true });
  assert(boosted.player.y > normal.player.y + 75);
});

test("levitation lasts ten seconds and releasing it puts the player back under gravity", () => {
  const game = createGame(3);
  trigger(game, "float");
  assert.equal(game.effects.float, 10);
  play(game, 9.95);
  assert(game.player.y > game.level.baseY + 800);
  assert(game.player.vy > 0);
  play(game, 0.25);
  assert.equal(game.effects.float, 0);
  assert(game.player.vy < 0);
});

test("flip reverses movement and gravity temporarily, then lets the player land", () => {
  const game = createGame();
  const { x, z } = game.player;
  trigger(game, "flip");
  play(game, 0.35, { right: true, front: true });
  assert(game.player.x < x - 45);
  assert(game.player.z < z - 45);
  assert(game.player.y > 30);
  play(game, 3);
  assert.equal(game.effects.flip, 0);
  assert(game.player.grounded);
});

test("gust pushes the player and springs launch from solid ground", () => {
  const game = createGame();
  const { x, z } = game.player;
  trigger(game, "gust");
  play(game, 0.5);
  assert(game.player.x < x - 25);
  assert(game.player.z > z + 20);
  trigger(game, "bounce");
  play(game, 0.12);
  assert(game.player.y > 50);
  assert.equal(trigger(game, "toString"), false);
});
