import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {calculateCountdown, EXAM_PRESETS} from '../src/tools/exam-countdown-core';

describe('ExamCountdownCore — 倒计时核心算法', () => {
  it('correctly calculates days, hours, minutes, and seconds remaining', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const target = new Date('2026-11-12T15:30:45Z'); // 2 days, 3 hours, 30 mins, 45 secs

    const res = calculateCountdown(target, now);
    assert.equal(res.days, 2);
    assert.equal(res.hours, 3);
    assert.equal(res.minutes, 30);
    assert.equal(res.seconds, 45);
    assert.equal(res.isPast, false);
    assert.equal(res.totalSeconds, 2 * 86400 + 3 * 3600 + 30 * 60 + 45);
  });

  it('handles past date gracefully without negative numbers', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const target = new Date('2026-11-09T12:00:00Z');

    const res = calculateCountdown(target, now);
    assert.equal(res.days, 0);
    assert.equal(res.hours, 0);
    assert.equal(res.minutes, 0);
    assert.equal(res.seconds, 0);
    assert.equal(res.isPast, true);
    assert.equal(res.totalSeconds, 0);
  });

  it('contains college exam presets with valid data', () => {
    assert.ok(EXAM_PRESETS.length >= 4);
    const postgrad = EXAM_PRESETS.find(p => p.id === 'postgrad-2027');
    assert.ok(postgrad);
    assert.ok(postgrad.name.includes('考研'));
    assert.ok(postgrad.defaultSlogan.length > 5);
  });
});
