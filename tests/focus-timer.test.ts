import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_PRESETS,
  AMBIENT_PRESETS,
  formatSeconds,
  calculateProgress,
  EndelSynthesizer,
} from '../src/tools/focus-core';

describe('FocusTimer Core & Ambient Synthesizer', () => {
  it('formats seconds into mm:ss accurately', () => {
    assert.equal(formatSeconds(0), '00:00');
    assert.equal(formatSeconds(59), '00:59');
    assert.equal(formatSeconds(60), '01:00');
    assert.equal(formatSeconds(1500), '25:00');
    assert.equal(formatSeconds(3000), '50:00');
  });

  it('calculates timer progress ratio clamped between 0 and 1', () => {
    assert.equal(calculateProgress(1500, 1500), 0);
    assert.equal(calculateProgress(750, 1500), 0.5);
    assert.equal(calculateProgress(0, 1500), 1);
    assert.equal(calculateProgress(-10, 1500), 1);
    assert.equal(calculateProgress(1600, 1500), 0);
    assert.equal(calculateProgress(100, 0), 0);
  });

  it('verifies FOCUS_PRESETS contains pomodoro, deepWork, shortBreak, longBreak', () => {
    assert.equal(FOCUS_PRESETS.length, 4);
    const ids = FOCUS_PRESETS.map((p) => p.id);
    assert.ok(ids.includes('pomodoro'));
    assert.ok(ids.includes('deepWork'));
    assert.ok(ids.includes('shortBreak'));
    assert.ok(ids.includes('longBreak'));
  });

  it('verifies AMBIENT_PRESETS contains rain, fire, stream, pink', () => {
    assert.equal(AMBIENT_PRESETS.length, 4);
    const ids = AMBIENT_PRESETS.map((p) => p.id);
    assert.ok(ids.includes('rain'));
    assert.ok(ids.includes('fire'));
    assert.ok(ids.includes('stream'));
    assert.ok(ids.includes('pink'));
  });

  it('instantiates EndelSynthesizer safely in headless environment without crashing', () => {
    const synth = new EndelSynthesizer();
    assert.equal(typeof synth.start, 'function');
    assert.equal(typeof synth.stop, 'function');
    assert.equal(typeof synth.setVolume, 'function');
    synth.setVolume(0.8);
    const status = synth.getStatus();
    assert.equal(status.isPlaying, false);
    assert.equal(status.volume, 0.8);
    synth.stop();
  });
});
