import assert from "node:assert/strict";
import test from "node:test";
import { createGame, goal, platformPosition, platforms, respawn, step, trigger } from "../engine.mjs";

const dt = 1 / 120;

function play(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds / dt); frame += 1) step(game, input, dt);
}

test("one continuous climb can reach the flag and save all four checkpoints", () => {
  const game = createGame();
  for (const target of platforms.slice(1)) {
    let landed = false;
    for (let frame = 0; frame < 145; frame += 1) {
      const { player } = game;
      const position = platformPosition(target, game.time + 0.13);
      const distance = position.x + position.w / 2 - player.x;
      const stoppingDistance = player.vx * Math.abs(player.vx) / (2 * 1750);
      const steer = distance - stoppingDistance;
      step(game, { left: steer < -3, right: steer > 3, jump: frame === 0 }, dt);
      if (player.grounded === target) {
        landed = true;
        break;
      }
    }
    assert(landed, `missed ${target.kind} at ${target.y}`);
    if (target.checkpoint) assert.equal(game.checkpoint, target);
  }
  for (let frame = 0; frame < 120 && !game.won; frame += 1) {
    step(game, { left: game.player.x > goal.x, right: game.player.x < goal.x }, dt);
  }
  assert.equal(game.bestY, goal.y);
  assert.equal(game.won, true);
  assert.equal(trigger(game, "dragon"), false);
});

test("falling returns to the latest checkpoint and the next jump works", () => {
  const game = createGame();
  const checkpoint = platforms.find((platform) => platform.checkpoint && platform.zone === 2);
  game.checkpoint = checkpoint;
  respawn(game);
  for (let frame = 0; frame < 360 && !game.notice; frame += 1) {
    step(game, { left: true }, dt);
  }
  assert.equal(game.notice, "Back at your checkpoint");
  assert.equal(game.checkpoint, checkpoint);
  assert.equal(game.player.grounded, checkpoint);
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
});

test("slippery surfaces preserve momentum and boosted jumps add height", () => {
  const baseline = createGame();
  const sliding = createGame();
  trigger(sliding, "slippery");
  for (const game of [baseline, sliding]) {
    play(game, 0.38, { right: true });
    play(game, 0.3);
  }
  assert(sliding.player.vx > baseline.player.vx + 150);

  const normal = createGame();
  const boosted = createGame();
  trigger(boosted, "boost");
  for (const game of [normal, boosted]) play(game, 0.5, { jump: true });
  assert(boosted.player.y > normal.player.y + 75);
});

test("levitation lasts ten seconds and releasing it puts the player back under gravity", () => {
  const game = createGame();
  trigger(game, "float");
  assert.equal(game.effects.float, 10);
  play(game, 9.95);
  assert(game.player.y > 800);
  assert(game.player.vy > 0);
  play(game, 0.25);
  assert.equal(game.effects.float, 0);
  assert(game.player.vy < 0);
});

test("flip reverses movement and gravity temporarily, then lets the player land", () => {
  const game = createGame();
  trigger(game, "flip");
  play(game, 0.35, { right: true });
  assert(game.player.x < 55);
  assert(game.player.y > 30);
  play(game, 3);
  assert.equal(game.effects.flip, 0);
  assert(game.player.grounded);
});

test("gust pushes the player and springs launch from solid ground", () => {
  const game = createGame();
  trigger(game, "gust");
  play(game, 0.5);
  assert(game.player.x < 75);
  trigger(game, "bounce");
  play(game, 0.12);
  assert(game.player.y > 50);
  assert.equal(trigger(game, "toString"), false);
});
