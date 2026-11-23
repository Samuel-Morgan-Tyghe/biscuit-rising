import { AnimationClip, AnimationMixer, Box3, Quaternion, Vector3 } from './vendor/three.module.min.js';

export function fitClimber(model, height) {
  const { min, max } = new Box3().setFromObject(model);
  const scale = height / (max.y - min.y);
  model.scale.setScalar(scale);
  model.position.set(-(min.x + max.x) * scale / 2, -min.y * scale, -(min.z + max.z) * scale / 2);
}

export function airborneClip(idle) {
  const folds = {
    thigh_L: .49, thigh_R: .30, calf_L: -.64, calf_R: -.45,
    upperarm_L: .34, upperarm_R: .21, spine: .12,
  };
  const axis = new Vector3(1, 0, 0);
  const tracks = idle.tracks.map((track) => {
    const values = Array.from(track.values.slice(0, track.getValueSize()));
    const angle = folds[track.name.split('.')[0]];
    if (!angle || !track.name.endsWith('.quaternion')) return new track.constructor(track.name, [0, .62], [...values, ...values]);
    const standing = new Quaternion().fromArray(values);
    const bent = (amount) => standing.clone().multiply(new Quaternion().setFromAxisAngle(axis, angle * amount)).toArray();
    return new track.constructor(track.name, [0, .17, .62], [...bent(.45), ...bent(1), ...bent(.72)]);
  });
  return new AnimationClip('airborne', .62, tracks);
}

export function createClimberPose(model, animations) {
  const mixer = new AnimationMixer(model);
  const idle = animations.find(({ name }) => name === 'idle');
  const clips = [...animations, airborneClip(idle)];
  const actions = new Map(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  let active, sampledTime;
  return {
    clips,
    apply(name, time) {
      const next = actions.get(name);
      if (active === next && sampledTime === time) return;
      if (active !== next) {
        active?.stop();
        next.reset().play();
        next.paused = true;
        active = next;
      }
      // Seeking freezes the same instant for the visible skeleton and the collision sample.
      active.time = time;
      mixer.update(0);
      sampledTime = time;
    },
  };
}
