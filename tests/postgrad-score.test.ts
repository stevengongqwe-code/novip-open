import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  WEIGHT_PRESETS,
  calculatePostgradScore,
} from '../src/tools/postgrad-score-core';

describe('PostgradScore Core', () => {
  it('has valid WEIGHT_PRESETS with initial + re-exam weights summing to 1.0', () => {
    assert.ok(WEIGHT_PRESETS.length >= 4);
    for (const w of WEIGHT_PRESETS) {
      assert.equal(Math.round((w.initialWeight + w.reExamWeight) * 100) / 100, 1.0);
    }
  });

  it('calculates 50:50 weight score correctly on 500-scale initial and 100-scale re-exam', () => {
    // 350 / 500 = 70% initial -> 35 contribution
    // 80 / 100 = 80% re-exam -> 40 contribution
    // total = 75
    const res = calculatePostgradScore({
      initialScore: 350,
      initialMaxScore: 500,
      reExamScore: 80,
      reExamMaxScore: 100,
      weightPresetId: '50_50',
    });

    assert.equal(res.initialConvertedPercent, 70);
    assert.equal(res.initialContribution, 35);
    assert.equal(res.reExamConvertedPercent, 80);
    assert.equal(res.reExamContribution, 40);
    assert.equal(res.finalCompositeScore, 75);
  });

  it('calculates 60:40 weight score correctly', () => {
    // 400 / 500 = 80% * 0.6 = 48
    // 90 / 100 = 90% * 0.4 = 36
    // total = 84
    const res = calculatePostgradScore({
      initialScore: 400,
      initialMaxScore: 500,
      reExamScore: 90,
      reExamMaxScore: 100,
      weightPresetId: '60_40',
    });

    assert.equal(res.initialContribution, 48);
    assert.equal(res.reExamContribution, 36);
    assert.equal(res.finalCompositeScore, 84);
  });

  it('reverse calculates minimum required re-exam score for target composite score', () => {
    // Initial 350 / 500 = 70% * 0.5 = 35
    // Target = 75
    // Needed contribution = 40
    // Re-exam weight = 0.5 -> needed percent = 80% -> raw needed = 80
    const res = calculatePostgradScore({
      initialScore: 350,
      initialMaxScore: 500,
      reExamMaxScore: 100,
      weightPresetId: '50_50',
      targetCompositeScore: 75,
    });

    assert.equal(res.reExamNeededForTarget, 80);
    assert.equal(res.isTargetReachable, true);
  });

  it('detects unreachable target score when required re-exam exceeds maximum', () => {
    // Initial 250 / 500 = 50% * 0.5 = 25
    // Target = 95 -> needs 70 contribution -> 140% re-exam! Impossible!
    const res = calculatePostgradScore({
      initialScore: 250,
      initialMaxScore: 500,
      reExamMaxScore: 100,
      weightPresetId: '50_50',
      targetCompositeScore: 95,
    });

    assert.equal(res.isTargetReachable, false);
    assert.ok(res.reExamNeededForTarget! > 100);
    assert.ok(res.statusAdvice.includes('超出满分'));
  });
});
