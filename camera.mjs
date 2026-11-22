import { PerspectiveCamera, Vector3 } from './vendor/three.module.min.js';

import { PLAYER_HEIGHT } from './engine.mjs';

const THIRD_PERSON_PITCH = 0.46;
const FIRST_PERSON_PITCH = 0.12;
const EYE_HEIGHT = PLAYER_HEIGHT - 4;

export function createFollowCamera() {
  const camera = new PerspectiveCamera(56, 1, 2, 6500);
  const follow = new Vector3();
  const target = new Vector3();
  let yaw = 0;
  let view = 'third';
  let pitch = THIRD_PERSON_PITCH;
  let roll = 0;
  let ready = false;

  return {
    camera,
    get yaw() { return yaw; },
    get view() { return view; },
    setView(next) {
      if (next !== 'first' && next !== 'third') throw new RangeError('Unknown camera view');
      if (next === view) return;
      view = next;
      pitch = view === 'first' ? FIRST_PERSON_PITCH : THIRD_PERSON_PITCH;
      ready = false;
    },
    resize(aspect) {
      camera.aspect = aspect;
      camera.fov = Math.max(56, 2 * Math.atan(0.32 / aspect) * 180 / Math.PI);
      camera.updateProjectionMatrix();
    },
    turn(deltaYaw, deltaPitch = 0) {
      yaw = (yaw + deltaYaw) % (Math.PI * 2);
      const low = view === 'first' ? -1.38 : -0.08;
      const high = view === 'first' ? 1.38 : 1.16;
      pitch = Math.max(low, Math.min(high, pitch + deltaPitch));
    },
    reset(game, heading = 0) {
      yaw = heading;
      pitch = view === 'first' ? FIRST_PERSON_PITCH : THIRD_PERSON_PITCH;
      roll = 0;
      ready = false;
      this.update(game, 0, true);
    },
    update(game, dt, reducedMotion) {
      const { x, y, z } = game.player;
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      if (view === 'first') {
        const radius = Math.cos(pitch);
        camera.position.set(x, y + EYE_HEIGHT, z);
        target.set(x - dx * radius, y + EYE_HEIGHT - Math.sin(pitch), z - dz * radius);
      } else {
        target.set(x, y + 23, z);
        if (!ready || follow.distanceToSquared(target) > 260 ** 2) {
          ready = true;
          follow.copy(target);
        } else {
          follow.lerp(target, 1 - Math.exp(-dt * 14));
        }

        const distance = 230;
        const radius = Math.cos(pitch) * distance;
        camera.position.set(follow.x + dx * radius, follow.y + Math.sin(pitch) * distance, follow.z + dz * radius);
        target.set(follow.x - dx * 74, follow.y + 35, follow.z - dz * 74);
      }
      camera.lookAt(target);
      const goal = game.effects.flip > 0 ? Math.PI : 0;
      roll = reducedMotion ? goal : roll + (goal - roll) * (1 - Math.exp(-dt * 16));
      camera.rotateZ(roll);
    },
  };
}
