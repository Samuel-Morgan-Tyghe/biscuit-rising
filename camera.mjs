import { PerspectiveCamera, Vector3 } from './vendor/three.module.min.js';

const DEFAULT_PITCH = 0.46;

export function createFollowCamera() {
  const camera = new PerspectiveCamera(56, 1, 2, 6500);
  const follow = new Vector3();
  const target = new Vector3();
  let yaw = 0;
  let pitch = DEFAULT_PITCH;
  let roll = 0;
  let ready = false;

  return {
    camera,
    get yaw() { return yaw; },
    resize(aspect) {
      camera.aspect = aspect;
      camera.fov = Math.max(56, 2 * Math.atan(0.32 / aspect) * 180 / Math.PI);
      camera.updateProjectionMatrix();
    },
    turn(deltaYaw, deltaPitch = 0) {
      yaw = (yaw + deltaYaw) % (Math.PI * 2);
      pitch = Math.max(-0.08, Math.min(1.16, pitch + deltaPitch));
    },
    reset(game, heading = 0) {
      yaw = heading;
      pitch = DEFAULT_PITCH;
      roll = 0;
      ready = false;
      this.update(game, 0, true);
    },
    update(game, dt, reducedMotion) {
      const { x, y, z } = game.player;
      target.set(x, y + 23, z);
      if (!ready || follow.distanceToSquared(target) > 260 ** 2) {
        ready = true;
        follow.copy(target);
      } else {
        follow.lerp(target, 1 - Math.exp(-dt * 14));
      }

      const distance = 230;
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      const radius = Math.cos(pitch) * distance;
      camera.position.set(follow.x + dx * radius, follow.y + Math.sin(pitch) * distance, follow.z + dz * radius);
      target.set(follow.x - dx * 74, follow.y + 35, follow.z - dz * 74);
      camera.lookAt(target);
      const goal = game.effects.flip > 0 ? Math.PI : 0;
      roll = reducedMotion ? goal : roll + (goal - roll) * (1 - Math.exp(-dt * 16));
      camera.rotateZ(roll);
    },
  };
}
