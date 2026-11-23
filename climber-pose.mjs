import { hikerClips } from './hiker-contact.mjs';

const contactFrames = new WeakMap();

function useFrame(pose) {
  const { duration, fps, frames } = hikerClips[pose.clip];
  const oneShot = pose.clip === 'airborne' || pose.clip === 'wave';
  const elapsed = oneShot ? Math.min(pose.elapsed, duration) : pose.elapsed % duration;
  const frame = elapsed >= duration ? frames.at(-1) : frames[Math.min(frames.length - 1, Math.floor(elapsed * fps + 1e-8))];
  if (!contactFrames.has(frame)) {
    const withLift = (segment, boot) => segment.vertices
      ? { ...segment, boot, vertices: segment.vertices.map(([x, y, z]) => [x, y + frame.lift, z]) }
      : { ...segment, boot, y: segment.y + frame.lift };
    contactFrames.set(frame, [...frame.boots.map((boot) => withLift(boot, true)), ...frame.body.map((body) => withLift(body, false))]);
  }
  if (pose.frame !== frame || pose.contactFacing !== pose.facing) {
    pose.time = frame.time;
    pose.lift = frame.lift;
    pose.frame = frame;
    pose.contactFacing = pose.facing;
    pose.segments = contactFrames.get(frame).map((segment) => ({ ...segment, yaw: pose.facing }));
    pose.boots = pose.segments.slice(0, frame.boots.length);
  }
  return pose;
}

export function createClimberPose(facing = Math.PI) {
  return useFrame({ clip: 'idle', elapsed: 0, facing });
}

export function advanceClimberPose(player, dt, won = false, restart = false) {
  const { pose, vx, vz } = player;
  const speed = Math.hypot(vx, vz);
  const clip = won ? 'wave' : !player.grounded ? 'airborne' : speed > 14 ? 'walk' : 'idle';
  if (speed > 22 && !won) {
    const target = Math.atan2(vx, vz);
    const turn = Math.atan2(Math.sin(target - pose.facing), Math.cos(target - pose.facing));
    pose.facing += turn * (1 - Math.exp(-dt * 14));
  }
  if (clip !== pose.clip || restart) {
    pose.clip = clip;
    pose.elapsed = 0;
  } else {
    const rate = clip === 'walk' ? Math.min(2.25, Math.max(.55, speed / 146)) : 1;
    pose.elapsed += dt * rate;
  }
  useFrame(pose);
}
