const callLength = 2.2;

export function dragonCall(sampleRate) {
  const data = new Float32Array(Math.round(sampleRate * callLength));
  let phase = 0, breath = 0, rasp = 0, seed = 7443;
  for (let index = 0; index < data.length; index++) {
    const time = index / sampleRate;
    const age = index / (data.length - 1);
    const pitch = 51 + 27 * Math.exp(-time * 1.8) + 6 * Math.sin(time * 12);
    phase += 2 * Math.PI * pitch / sampleRate;

    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    breath += (noise - breath) * .075;
    rasp += (noise - rasp) * .24;
    const throat = Math.sin(phase) * .39 + Math.sin(phase * 2.02) * .19 +
      Math.sin(phase * 3.94 + time * 21) * .1;
    const flutter = .77 + .23 * Math.sin(time * 86 + Math.sin(time * 11));
    const envelope = (1 - Math.exp(-time * 19)) * (1 - age) ** 1.55;
    data[index] = envelope * (flutter * throat + breath * .45 + (rasp - breath) * .32);
  }
  return data;
}

export function createGiftAudio(AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext) {
  let context, call;
  let muted = false;
  let giftMuted = false;
  let lastDragon, lastCue;
  const playing = new Set();

  function stop() {
    for (const source of playing) source.stop();
    playing.clear();
  }

  function play({ seconds = 1.25, power = 1, pan = 0 } = {}) {
    if (muted || giftMuted || context?.state !== 'running' || playing.size >= 3) return;
    if (!call) {
      const data = dragonCall(context.sampleRate);
      call = context.createBuffer(1, data.length, context.sampleRate);
      call.copyToChannel(data, 0);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const stereo = context.createStereoPanner();
    source.buffer = call;
    source.playbackRate.value = callLength / Math.max(.5, Math.min(5, seconds));
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(2100, Math.max(300, 1050 * power));
    gain.gain.value = Math.min(.27, Math.max(.08, .19 * power));
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(stereo).connect(context.destination);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
    playing.add(source);
    source.start();
  }

  return {
    get muted() { return muted; },
    setMuted(value) {
      muted = Boolean(value);
      if (muted) stop();
    },
    unlock() {
      if (!AudioContextClass || muted) return;
      try {
        context ??= new AudioContextClass();
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch {
        // Device audio can be unavailable while the game remains playable.
      }
    },
    stop,
    update(game) {
      const silenced = game.levelComplete || game.effects.mute > 0;
      if (silenced && !giftMuted) stop();
      giftMuted = silenced;
      if (game.dragon !== lastDragon) {
        lastDragon = game.dragon;
        if (lastDragon?.phase === 'warning' && !game.levelComplete) {
          play({ pan: lastDragon.direction > 0 ? -.7 : .7 });
        }
      }
      if (game.soundCue !== lastCue) {
        lastCue = game.soundCue;
        if (lastCue?.kind === 'dragon' && !game.levelComplete) play(lastCue);
      }
    },
  };
}
