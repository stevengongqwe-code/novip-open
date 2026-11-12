// BMI / 体脂率参考计算 · 纯函数测试
// 运行：node --import tsx --test tests/health.test.ts
// 期望值均由独立脚本（node -e，未调用本模块）复核后写死；BMR 另附任务书示例的年龄说明。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_LEVELS,
  BMR_FORMULA,
  BMI_CATEGORIES,
  BODY_FAT_REFERENCE,
  CM_PER_INCH,
  HEALTHY_BMI,
  LIMITS,
  classifyBmi,
  classifyBodyFat,
  cmToInch,
  computeBmi,
  computeBmr,
  computeEnergy,
  computeTdee,
  estimateBodyFat,
  tdeeTable,
  type Gender,
} from '../src/tools/health-core.ts';

// ---------------------------------------------------------------------------
// BMI
// ---------------------------------------------------------------------------
describe('BMI 已知算例与健康体重区间', () => {
  it('70kg / 175cm → BMI 22.857，中国成人分类「正常」', () => {
    const r = computeBmi(175, 70);
    assert.equal(r.heightCm, 175);
    assert.equal(r.weightKg, 70);
    assert.ok(Math.abs(r.bmi - 22.857142857) < 1e-6, `BMI 实际 ${r.bmi}`);
    assert.equal(r.bmi.toFixed(1), '22.9');
    assert.equal(r.category.level, 'normal');
    assert.equal(r.category.label, '正常');
    assert.equal(r.category.rangeText, '18.5 ≤ BMI < 24.0');
  });

  it('健康体重区间按 BMI 18.5–23.9 反推（175cm → 56.66–73.19kg）', () => {
    const r = computeBmi(175, 70);
    assert.ok(Math.abs(r.healthyWeightKg.min - 56.65625) < 1e-9, `下限 ${r.healthyWeightKg.min}`);
    assert.ok(Math.abs(r.healthyWeightKg.max - 73.19375) < 1e-9, `上限 ${r.healthyWeightKg.max}`);
    assert.deepEqual(r.healthyBmi, { min: 18.5, max: 23.9 });
    assert.ok(r.healthyWeightKg.min < r.weightKg && r.weightKg < r.healthyWeightKg.max);
  });

  it('不同身高的区间随身高平方变化', () => {
    const a = computeBmi(160, 50);
    const b = computeBmi(180, 70);
    assert.ok(Math.abs(a.healthyWeightKg.min - 18.5 * 1.6 * 1.6) < 1e-9);
    assert.ok(Math.abs(b.healthyWeightKg.max - 23.9 * 1.8 * 1.8) < 1e-9);
  });

  it('边界身高/体重可计算', () => {
    assert.doesNotThrow(() => computeBmi(100, 20));
    assert.doesNotThrow(() => computeBmi(250, 300));
  });
});

describe('BMI 中国成人分类边界（18.5 / 24 / 28）', () => {
  const cases: [number, string][] = [
    [18.49, 'underweight'],
    [18.5, 'normal'],
    [23.99, 'normal'],
    [24, 'overweight'],
    [27.99, 'overweight'],
    [28, 'obese'],
    [35, 'obese'],
  ];
  for (const [bmi, level] of cases) {
    it(`BMI ${bmi} → ${level}`, () => {
      assert.equal(classifyBmi(bmi).level, level);
    });
  }
  it('分类表为中国成人四档，最高档无上限', () => {
    assert.deepEqual(BMI_CATEGORIES.map((c) => c.label), ['偏瘦', '正常', '超重', '肥胖']);
    assert.deepEqual(BMI_CATEGORIES.map((c) => c.level), ['underweight', 'normal', 'overweight', 'obese']);
    assert.equal(BMI_CATEGORIES[3].bmiMax, null);
  });
  it('非法 BMI 拒绝', () => {
    for (const value of [NaN, Infinity, 0, -1]) {
      assert.throws(() => classifyBmi(value), `应拒绝 ${value}`);
    }
  });
});

describe('BMI 输入校验', () => {
  it('空值给出中文提示', () => {
    assert.throws(() => computeBmi('', 70), /请填写身高/);
    assert.throws(() => computeBmi(175, ''), /请填写体重/);
    assert.throws(() => computeBmi('   ', 70), /请填写身高/);
  });
  it('非数字拒绝', () => {
    assert.throws(() => computeBmi('175cm', 70), /身高必须是数字/);
    assert.throws(() => computeBmi(175, '70kg'), /体重必须是数字/);
    assert.throws(() => computeBmi(175, NaN), /体重必须是有效数字/);
  });
  it('负数与超范围拒绝', () => {
    assert.throws(() => computeBmi(-175, 70), /身高需在 100–250 cm 之间/);
    assert.throws(() => computeBmi(99.9, 70), /身高需在 100–250 cm 之间/);
    assert.throws(() => computeBmi(250.1, 70), /身高需在 100–250 cm 之间/);
    assert.throws(() => computeBmi(175, -70), /体重需在 20–300 kg 之间/);
    assert.throws(() => computeBmi(175, 19.9), /体重需在 20–300 kg 之间/);
    assert.throws(() => computeBmi(175, 300.1), /体重需在 20–300 kg 之间/);
  });
});

// ---------------------------------------------------------------------------
// BMR / TDEE
// ---------------------------------------------------------------------------
describe('BMR（Mifflin-St Jeor）已知算例', () => {
  it('70kg / 175cm / 30 岁男性 = 1648.75 kcal', () => {
    const bmr = computeBmr({ gender: 'male', heightCm: 175, weightKg: 70, age: 30 });
    assert.ok(Math.abs(bmr - 1648.75) < 1e-9, `BMR 实际 ${bmr}`);
    // 独立复核：10×70 + 6.25×175 − 5×30 + 5
    assert.equal(bmr, 10 * 70 + 6.25 * 175 - 5 * 30 + 5);
  });

  it('任务书示例 1673.75 对应 25 岁；30 岁按公式为 1648.75', () => {
    const at25 = computeBmr({ gender: 'male', heightCm: 175, weightKg: 70, age: 25 });
    assert.ok(Math.abs(at25 - 1673.75) < 1e-9, `25 岁 BMR 实际 ${at25}`);
  });

  it('60kg / 165cm / 25 岁女性 = 1345.25 kcal', () => {
    const bmr = computeBmr({ gender: 'female', heightCm: 165, weightKg: 60, age: 25 });
    assert.ok(Math.abs(bmr - 1345.25) < 1e-9, `BMR 实际 ${bmr}`);
    assert.equal(bmr, 10 * 60 + 6.25 * 165 - 5 * 25 - 161);
  });

  it('相同身高体重年龄下男女相差固定 166 kcal（+5 与 −161）', () => {
    const base = { heightCm: 175, weightKg: 70, age: 30 } as const;
    assert.equal(computeBmr({ ...base, gender: 'male' }) - computeBmr({ ...base, gender: 'female' }), 166);
  });

  it('公式常量文案包含 Mifflin-St Jeor 的性别项', () => {
    assert.match(BMR_FORMULA, /10 × 体重/);
    assert.match(BMR_FORMULA, /男 s = \+5/);
    assert.match(BMR_FORMULA, /女 s = −161/);
  });
});

describe('BMR 输入校验', () => {
  it('年龄范围 10–100 且需整数', () => {
    assert.throws(
      () => computeBmr({ gender: 'male', heightCm: 175, weightKg: 70, age: 9 }),
      /年龄需在 10–100 岁之间/,
    );
    assert.throws(
      () => computeBmr({ gender: 'male', heightCm: 175, weightKg: 70, age: 101 }),
      /年龄需在 10–100 岁之间/,
    );
    assert.throws(
      () => computeBmr({ gender: 'male', heightCm: 175, weightKg: 70, age: 30.5 }),
      /年龄需为 10–100 的整数岁/,
    );
    assert.doesNotThrow(() => computeBmr({ gender: 'male', heightCm: 175, weightKg: 70, age: 10 }));
    assert.doesNotThrow(() => computeBmr({ gender: 'female', heightCm: 175, weightKg: 70, age: 100 }));
  });

  it('性别、身高、体重校验', () => {
    assert.throws(
      () => computeBmr({ gender: 'other' as Gender, heightCm: 175, weightKg: 70, age: 30 }),
      /请选择性别/,
    );
    assert.throws(
      () => computeBmr({ gender: 'male', heightCm: 99, weightKg: 70, age: 30 }),
      /身高需在 100–250 cm 之间/,
    );
    assert.throws(
      () => computeBmr({ gender: 'male', heightCm: 175, weightKg: 301, age: 30 }),
      /体重需在 20–300 kg 之间/,
    );
  });

  it('空值 / NaN / 负数拒绝', () => {
    assert.throws(() => computeBmr({ gender: 'male', heightCm: '', weightKg: 70, age: 30 }), /请填写身高/);
    assert.throws(() => computeBmr({ gender: 'male', heightCm: 175, weightKg: NaN, age: 30 }), /体重必须是有效数字/);
    assert.throws(() => computeBmr({ gender: 'male', heightCm: 175, weightKg: -70, age: 30 }), /体重需在 20–300 kg 之间/);
  });
});

describe('TDEE 五档活动系数', () => {
  it('系数固定为 1.2 / 1.375 / 1.55 / 1.725 / 1.9', () => {
    assert.deepEqual(ACTIVITY_LEVELS.map((l) => l.factor), [1.2, 1.375, 1.55, 1.725, 1.9]);
    assert.deepEqual(ACTIVITY_LEVELS.map((l) => l.id), ['sedentary', 'light', 'moderate', 'active', 'veryActive']);
    assert.deepEqual(ACTIVITY_LEVELS.map((l) => l.label), ['久坐少动', '轻度活动', '中度活动', '高度活动', '极高活动']);
  });

  it('1648.75 kcal 的 5 档 TDEE 算例', () => {
    const expected = [1978.5, 2267.03125, 2555.5625, 2844.09375, 3132.625];
    const rows = tdeeTable(1648.75);
    assert.equal(rows.length, 5);
    rows.forEach((row, index) => {
      assert.ok(Math.abs(row.tdee - expected[index]) < 1e-9, `${row.id} 实际 ${row.tdee}`);
      assert.ok(Math.abs(row.tdee - 1648.75 * ACTIVITY_LEVELS[index].factor) < 1e-9);
    });
  });

  it('computeTdee 按选中档位计算', () => {
    const row = computeTdee(1648.75, 'moderate');
    assert.equal(row.label, '中度活动');
    assert.equal(row.factor, 1.55);
    assert.ok(Math.abs(row.tdee - 2555.5625) < 1e-9);
    assert.equal(computeTdee(2000, 'sedentary').tdee, 2400);
    assert.equal(computeTdee(2000, 'veryActive').tdee, 3800);
  });

  it('非法活动水平与 BMR 拒绝', () => {
    assert.throws(() => computeTdee(1648.75, 'invalid' as typeof ACTIVITY_LEVELS[number]['id']), /请选择有效的活动水平/);
    assert.throws(() => tdeeTable(NaN), /BMR必须是有效数字/);
    assert.throws(() => tdeeTable(0), /BMR 必须是大于 0 的数值/);
    assert.throws(() => tdeeTable(-100), /BMR 必须是大于 0 的数值/);
    assert.throws(() => computeTdee('', 'light'), /请填写BMR/);
  });

  it('computeEnergy 一次返回 BMR 与 5 档表', () => {
    const energy = computeEnergy({ gender: 'male', heightCm: 175, weightKg: 70, age: 30 });
    assert.ok(Math.abs(energy.bmr - 1648.75) < 1e-9);
    assert.equal(energy.rows.length, 5);
    assert.equal(energy.rows[0].tdee, 1648.75 * 1.2);
  });
});

// ---------------------------------------------------------------------------
// 体脂率（美国海军围度公式）
// ---------------------------------------------------------------------------
describe('体脂率已知算例（cm → inch）', () => {
  it('男性 175cm / 腰 85 / 颈 38 → 17.0077%', () => {
    const r = estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 85, neckCm: 38 });
    assert.ok(Math.abs(r.percent - 17.0077191723) < 1e-6, `实际 ${r.percent}`);
    assert.equal(r.percent.toFixed(1), '17.0');
    assert.equal(r.category.level, 'fitness');
    assert.equal(r.category.label, '健身参考');
    assert.equal(r.category.text, '14–17%');
    assert.equal(r.measurements.hipCm, null);
    assert.equal(r.method, '美国海军围度公式（Hodgdon & Beckett, 1984）');
  });

  it('女性 170cm / 腰 80 / 臀 95 / 颈 34 → 27.9720%', () => {
    const r = estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 80, neckCm: 34, hipCm: 95 });
    assert.ok(Math.abs(r.percent - 27.9720228984) < 1e-6, `实际 ${r.percent}`);
    assert.equal(r.percent.toFixed(1), '28.0');
    assert.equal(r.category.level, 'average');
    assert.equal(r.category.label, '平均参考');
    assert.equal(r.category.text, '25–31%');
    assert.equal(r.measurements.hipCm, 95);
  });

  it('与手工英寸制公式一致（单位换算正确）', () => {
    const r = estimateBodyFat({ gender: 'male', heightCm: 180, waistCm: 90, neckCm: 40 });
    const expected =
      86.01 * Math.log10(90 / CM_PER_INCH - 40 / CM_PER_INCH) -
      70.041 * Math.log10(180 / CM_PER_INCH) +
      36.76;
    assert.ok(Math.abs(r.percent - expected) < 1e-12);
    assert.ok(Math.abs(r.percent - 18.4620789223) < 1e-6, `实际 ${r.percent}`);
  });

  it('与美国海军另一公开公制变体（495 式）结果接近（<0.5 个百分点）', () => {
    const male = estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 85, neckCm: 38 });
    const metricMale = 495 / (1.0324 - 0.19077 * Math.log10(85 - 38) + 0.15456 * Math.log10(175)) - 450;
    assert.ok(Math.abs(male.percent - metricMale) < 0.5, `差值 ${male.percent - metricMale}`);
    const female = estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 80, neckCm: 34, hipCm: 95 });
    const metricFemale =
      495 / (1.29579 - 0.35004 * Math.log10(80 + 95 - 34) + 0.221 * Math.log10(170)) - 450;
    assert.ok(Math.abs(female.percent - metricFemale) < 0.5, `差值 ${female.percent - metricFemale}`);
  });

  it('男性不需要臀围；即使传入也被忽略', () => {
    const base = { gender: 'male' as const, heightCm: 175, waistCm: 85, neckCm: 38 };
    const without = estimateBodyFat(base);
    const withHip = estimateBodyFat({ ...base, hipCm: 200 });
    assert.equal(without.percent, withHip.percent);
    assert.equal(withHip.measurements.hipCm, null);
  });

  it('参考区间表为 ACE 公开五档', () => {
    assert.deepEqual(BODY_FAT_REFERENCE.male.map((r) => r.text), ['2–5%', '6–13%', '14–17%', '18–24%', '≥25%']);
    assert.deepEqual(BODY_FAT_REFERENCE.female.map((r) => r.text), ['10–13%', '14–20%', '21–24%', '25–31%', '≥32%']);
    assert.equal(BODY_FAT_REFERENCE.male[4].max, null);
    assert.equal(BODY_FAT_REFERENCE.female[4].max, null);
  });
});

describe('体脂率输入校验', () => {
  it('女性缺少臀围时明确提示', () => {
    assert.throws(
      () => estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 80, neckCm: 34 }),
      /女性体脂估算需要填写臀围/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 80, neckCm: 34, hipCm: '' }),
      /女性体脂估算需要填写臀围/,
    );
  });

  it('男性腰围必须大于颈围', () => {
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 38, neckCm: 38 }),
      /腰围需大于颈围/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 30, neckCm: 40 }),
      /腰围需大于颈围/,
    );
  });

  it('女性腰围+臀围需大于颈围', () => {
    assert.throws(
      () => estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 30, neckCm: 250, hipCm: 30 }),
      /腰围与臀围之和需大于颈围/,
    );
  });

  it('围度范围 30–250cm、身高 100–250cm', () => {
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 29, neckCm: 30 }),
      /腰围需在 30–250 cm 之间/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 251, neckCm: 30 }),
      /腰围需在 30–250 cm 之间/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 85, neckCm: 29 }),
      /颈围需在 30–250 cm 之间/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 80, neckCm: 34, hipCm: 251 }),
      /臀围需在 30–250 cm 之间/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 99, waistCm: 85, neckCm: 38 }),
      /身高需在 100–250 cm 之间/,
    );
  });

  it('空值 / NaN / 负数 / 非数字拒绝', () => {
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: '', waistCm: 85, neckCm: 38 }),
      /请填写身高/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: NaN, neckCm: 38 }),
      /腰围必须是有效数字/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: -85, neckCm: 38 }),
      /腰围需在 30–250 cm 之间/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 85, neckCm: '38cm' }),
      /颈围必须是数字/,
    );
  });

  it('公式结果超出常见范围时拒绝而不是给出荒谬数值', () => {
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 250, waistCm: 31, neckCm: 30 }),
      /超出公式常见范围/,
    );
    assert.throws(
      () => estimateBodyFat({ gender: 'male', heightCm: 100, waistCm: 250, neckCm: 30 }),
      /超出公式常见范围/,
    );
  });
});

describe('体脂率分级（ACE 公开区间）', () => {
  const maleCases: [number, string][] = [
    [1.9, 'low'],
    [2, 'essential'],
    [5.9, 'essential'],
    [6, 'athlete'],
    [13.9, 'athlete'],
    [14, 'fitness'],
    [17.9, 'fitness'],
    [18, 'average'],
    [24.9, 'average'],
    [25, 'high'],
    [45, 'high'],
  ];
  for (const [percent, level] of maleCases) {
    it(`男性 ${percent}% → ${level}`, () => {
      assert.equal(classifyBodyFat(percent, 'male').level, level);
    });
  }
  const femaleCases: [number, string][] = [
    [9.9, 'low'],
    [10, 'essential'],
    [13.9, 'essential'],
    [14, 'athlete'],
    [20.9, 'athlete'],
    [21, 'fitness'],
    [24.9, 'fitness'],
    [25, 'average'],
    [31.9, 'average'],
    [32, 'high'],
  ];
  for (const [percent, level] of femaleCases) {
    it(`女性 ${percent}% → ${level}`, () => {
      assert.equal(classifyBodyFat(percent, 'female').level, level);
    });
  }
  it('低于公开下限单独标注', () => {
    assert.equal(classifyBodyFat(1.5, 'male').level, 'low');
    assert.equal(classifyBodyFat(1.5, 'male').text, '< 2%');
    assert.equal(classifyBodyFat(9, 'female').text, '< 10%');
  });
  it('非法分级输入拒绝', () => {
    for (const value of [NaN, Infinity, 0, -1, 100.1]) {
      assert.throws(() => classifyBodyFat(value, 'male'), `应拒绝 ${value}`);
    }
    assert.throws(() => classifyBodyFat(20, 'other' as Gender), /请选择性别/);
  });
});

// ---------------------------------------------------------------------------
// 单位换算
// ---------------------------------------------------------------------------
describe('单位换算', () => {
  it('1 英寸 = 2.54 厘米', () => {
    assert.equal(CM_PER_INCH, 2.54);
    assert.equal(cmToInch(2.54), 1);
    assert.ok(Math.abs(cmToInch(175) - 68.897637795276) < 1e-9);
    assert.ok(Math.abs(cmToInch(85) - 33.464566929134) < 1e-9);
  });
  it('非法输入拒绝', () => {
    assert.throws(() => cmToInch(NaN), /有效数字/);
    assert.throws(() => cmToInch(Infinity), /有效数字/);
  });
});

// ---------------------------------------------------------------------------
// 纯函数、隐私与页面契约
// ---------------------------------------------------------------------------
describe('纯函数与隐私', () => {
  it('相同输入结果确定一致且对象独立', () => {
    const a = computeBmi(175, 70);
    const b = computeBmi(175, 70);
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
    const c = estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 85, neckCm: 38 });
    const d = estimateBodyFat({ gender: 'male', heightCm: 175, waistCm: 85, neckCm: 38 });
    assert.deepEqual(c, d);
    assert.notEqual(c, d);
  });

  it('结果对象可 JSON 序列化（可直接复制/下载）', () => {
    const payload = {
      bmi: computeBmi(175, 70),
      bodyFat: estimateBodyFat({ gender: 'female', heightCm: 170, waistCm: 80, neckCm: 34, hipCm: 95 }),
      energy: computeEnergy({ gender: 'male', heightCm: 175, weightKg: 70, age: 30 }),
    };
    assert.doesNotThrow(() => JSON.stringify(payload));
  });

  it('核心与 UI 均无网络 / 上报 / 持久化调用', async () => {
    const fs = await import('node:fs');
    const read = (name: string) => fs.readFileSync(new URL(`../src/tools/${name}`, import.meta.url), 'utf8');
    const core = read('health-core.ts');
    const ui = read('Health.tsx');
    for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'analytics', 'localStorage', 'sessionStorage']) {
      assert.ok(!core.includes(word), `核心不应包含 ${word}`);
    }
    for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'analytics', 'localStorage.setItem', 'location.href', 'history.pushState']) {
      assert.ok(!ui.includes(word), `UI 不应包含 ${word}`);
    }
  });

  it('页面默认导出、由 ToolPage 包裹且 id 为 health', async () => {
    const fs = await import('node:fs');
    const ui = fs.readFileSync(new URL('../src/tools/Health.tsx', import.meta.url), 'utf8');
    assert.match(ui, /export default function Health\(/);
    assert.match(ui, /ToolPage/);
    assert.match(ui, /id="health"/);
    assert.match(ui, /from '\.\/health-core'/);
    assert.match(ui, /参考值，非诊断|非诊断/);
  });

  it('输入范围常量与界面提示一致（10–100 岁、围度 30–250cm）', () => {
    assert.deepEqual(LIMITS.age, { min: 10, max: 100, unit: '岁' });
    assert.deepEqual(LIMITS.heightCm, { min: 100, max: 250, unit: 'cm' });
    assert.deepEqual(LIMITS.weightKg, { min: 20, max: 300, unit: 'kg' });
    assert.deepEqual(LIMITS.circumferenceCm, { min: 30, max: 250, unit: 'cm' });
    assert.deepEqual(HEALTHY_BMI, { min: 18.5, max: 23.9 });
  });
});
