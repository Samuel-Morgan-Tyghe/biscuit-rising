import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from '../vendor/three.module.min.js';
import { createFollowCamera } from '../camera.mjs';
import { createGame, PLAYER_HEIGHT } from '../engine.mjs';

test('first-person view follows the climber at eye height and shares the movement heading', () => {
  const game = createGame();
  const follow = createFollowCamera();
  follow.setView('first');
  follow.reset(game);
  assert.equal(follow.view, 'first');
  assert(follow.camera.getWorldDirection(new Vector3()).z < -.99);

  follow.turn(Math.PI / 2);
  game.player.x += 25;
  game.player.y += 18;
  game.player.z -= 4;
  follow.update(game, 1 / 60, false);

  assert.deepEqual(follow.camera.position.toArray(), [game.player.x, game.player.y + PLAYER_HEIGHT - 4, game.player.z]);
  assert(follow.camera.getWorldDirection(new Vector3()).x < -.99);
});

test('recentring keeps first person and gravity flip still rolls either view', () => {
  const game = createGame();
  const follow = createFollowCamera();
  follow.setView('first');
  game.effects.flip = 1;
  follow.reset(game, Math.PI / 2);
  assert.equal(follow.view, 'first');
  assert.equal(follow.yaw, Math.PI / 2);
  assert(new Vector3(0, 1, 0).applyQuaternion(follow.camera.quaternion).y < -.95);

  follow.setView('third');
  follow.update(game, 1 / 60, true);
  assert.equal(follow.yaw, Math.PI / 2);
  assert(follow.camera.position.x > game.player.x + 180);
  assert(new Vector3(0, 1, 0).applyQuaternion(follow.camera.quaternion).y < -.95);
});
