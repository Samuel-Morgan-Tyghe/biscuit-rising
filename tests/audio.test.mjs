import assert from 'node:assert/strict';
import test from 'node:test';
import { createGiftAudio, dragonCall } from '../audio.mjs';

test('the dragon warning has an audible envelope without clipping', () => {
  const samples = dragonCall(8000);
  assert.equal(samples.length, 17600);
  assert(Math.abs(samples[0]) < .0001);
  assert(Math.abs(samples.at(-1)) < .0001);
  const peak = Math.max(...samples.map(Math.abs));
  assert(peak > .15 && peak < 1);
});

test('dragon and phantom warnings play once, and a mute gift respects the user setting', () => {
  let starts = 0, stops = 0;
  function node() {
    return {
      frequency: {}, gain: {}, pan: {}, playbackRate: {},
      connect: (next) => next, disconnect() {},
      start() { starts++; }, stop() { stops++; },
    };
  }
  class Context {
    state = 'running';
    sampleRate = 8000;
    destination = node();
    createBuffer() { return { copyToChannel() {} }; }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createGain() { return node(); }
    createStereoPanner() { return node(); }
  }
  const audio = createGiftAudio(Context);
  audio.unlock();
  const game = { effects: {}, dragon: { phase: 'warning', direction: -1 } };
  audio.update(game);
  audio.update(game);
  assert.equal(starts, 1);
  game.soundCue = { kind: 'dragon', seconds: 1.4, power: 1, pan: .3 };
  audio.update(game);
  assert.equal(starts, 2);
  game.effects.mute = 1;
  game.soundCue = { ...game.soundCue };
  audio.update(game);
  assert.equal(starts, 2);
  assert.equal(stops, 2);
  audio.setMuted(true);
  game.effects.mute = 0;
  game.soundCue = { ...game.soundCue };
  audio.update(game);
  assert.equal(starts, 2);
  audio.setMuted(false);
  audio.update(game);
  assert.equal(starts, 2, 'a warning suppressed by mute must not play afterwards');
  game.soundCue = { ...game.soundCue };
  audio.update(game);
  assert.equal(starts, 3);
  game.levelComplete = true;
  audio.update(game);
  assert.equal(stops, 3);
});
