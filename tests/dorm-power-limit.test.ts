// 宿舍限电功率计算器 · 核心逻辑单元测试
// 运行：node --import tsx --test tests/dorm-power-limit.test.ts
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLIANCE_PRESETS,
  COMMON_LIMITS_W,
  NEAR_RATIO,
  VOLTAGE_V,
  checkPowerLimits,
  describeStatus,
  formatPowerSummary,
  sampleAppliances,
  sanitizeAppliance,
  type PowerLimitInput,
} from '../src/tools/dorm-power-limit-core.ts';

function input(over: Partial<PowerLimitInput>): PowerLimitInput {
  return {
    singleLimitW: 500,
    totalLimitW: 800,
    voltageV: VOLTAGE_V,
    appliances: [],
    ...over,
  };
}

function app(id: string, watts: number, quantity = 1, on = true) {
  return {id, name: id, watts, quantity, on};
}

describe('求和与电流', () => {
  it('多电器×台数求和：65+10+20+800=895W', () => {
    const r = checkPowerLimits(input({appliances: sampleAppliances()}));
    assert.equal(r.totalWatts, 895);
  });
  it('关闭"同时使用"的电器不计入总功率', () => {
    const r = checkPowerLimits(input({
      appliances: [app('a', 800), app('b', 1500, 1, false)],
    }));
    assert.equal(r.totalWatts, 800);
  });
  it('空清单总功率 0W、状态安全', () => {
    const r = checkPowerLimits(input({appliances: []}));
    assert.equal(r.totalWatts, 0);
    assert.equal(r.status, 'safe');
  });
  it('电流换算：2200W ÷ 220V = 10A', () => {
    const r = checkPowerLimits(input({
      singleLimitW: 0,
      totalLimitW: 3000,
      appliances: [app('kettle', 2200)],
    }));
    assert.equal(r.totalCurrentA, 10);
  });
  it('电流换算：895W ≈ 4.07A', () => {
    const r = checkPowerLimits(input({appliances: sampleAppliances()}));
    assert.equal(r.totalCurrentA, 4.07);
  });
  it('占用率：400W ÷ 800W = 50%', () => {
    const r = checkPowerLimits(input({appliances: [app('pc', 400)]}));
    assert.equal(r.usageRatio, 0.5);
  });
  it('占用率不截断：895W ÷ 800W = 1.11875（展示层不得显示为 100%）', () => {
    const r = checkPowerLimits(input({appliances: sampleAppliances()}));
    assert.equal(r.usageRatio, 895 / 800);
  });
});

describe('状态判定边界', () => {
  it('总功率 < 80% 限值：安全', () => {
    const r = checkPowerLimits(input({appliances: [app('pc', 100)]}));
    assert.equal(r.status, 'safe');
    assert.equal(describeStatus(r.status), '安全');
  });
  it('总功率 = 80% 限值：接近上限', () => {
    const r = checkPowerLimits(input({singleLimitW: 0, appliances: [app('pc', 640)]}));
    assert.equal(r.status, 'near');
    assert.equal(describeStatus(r.status), '接近上限');
  });
  it('总功率 = 限值本身：不算超限（接近上限档）', () => {
    const r = checkPowerLimits(input({singleLimitW: 0, appliances: [app('pc', 800)]}));
    assert.equal(r.status, 'near');
    assert.equal(r.overTotalWatts, 0);
  });
  it('总功率 > 限值：会跳闸', () => {
    const r = checkPowerLimits(input({appliances: sampleAppliances()}));
    assert.equal(r.status, 'over');
    assert.equal(describeStatus(r.status), '会跳闸');
    assert.equal(r.overTotalWatts, 95);
  });
  it('单台功率 = 单台限值：不算超限', () => {
    const r = checkPowerLimits(input({appliances: [app('dryer', 500)]}));
    assert.equal(r.overSingle.length, 0);
    assert.equal(r.status, 'safe');
  });
  it('单台功率 > 单台限值：会跳闸（即使总功率未超）', () => {
    const r = checkPowerLimits(input({appliances: [app('dryer', 800)]}));
    assert.equal(r.status, 'over');
    assert.equal(r.overSingle.length, 1);
    assert.equal(r.overSingle[0].name, 'dryer');
    assert.equal(r.overTotalWatts, 0);
  });
  it('单台限值 0 = 不限：800W 吹风机只看总功率', () => {
    const r = checkPowerLimits(input({singleLimitW: 0, appliances: [app('dryer', 800)]}));
    assert.equal(r.overSingle.length, 0);
    assert.equal(r.status, 'near');
  });
  it('NEAR_RATIO 常量为 0.8', () => {
    assert.equal(NEAR_RATIO, 0.8);
  });
});

describe('移除建议', () => {
  it('只列出能让总功率回到限值内的项', () => {
    const r = checkPowerLimits(input({appliances: sampleAppliances()}));
    // 895W 超 95W：去掉吹风机 800W → 95W 可行；去掉笔记本 65W → 830W 仍超，不列
    assert.equal(r.removals.length, 1);
    assert.equal(r.removals[0].name, '吹风机（常见）');
    assert.equal(r.removals[0].afterTotalW, 95);
  });
  it('按去掉的瓦数从小到大排序', () => {
    const r = checkPowerLimits(input({
      singleLimitW: 0,
      appliances: [app('a', 500), app('b', 300), app('c', 100)],
    }));
    // 总 900W 超 100W：去掉 a→400、可行；去掉 b→600、可行；去掉 c→800、可行（=限值）
    assert.deepEqual(r.removals.map((x) => x.name), ['c', 'b', 'a']);
    assert.deepEqual(r.removals.map((x) => x.removedWatts), [100, 300, 500]);
  });
  it('去掉一件仍超限时建议为空', () => {
    const r = checkPowerLimits(input({
      singleLimitW: 0,
      appliances: [app('a', 1500), app('b', 1500)],
    }));
    assert.equal(r.removals.length, 0);
  });
  it('单台超限时，移除违规电器可修复', () => {
    const r = checkPowerLimits(input({
      appliances: [app('dryer', 800), app('pc', 65)],
    }));
    // 总 865W 超 65W 且吹风机超单台限：去掉吹风机 → 65W 且无单台超限，可行；去掉电脑 → 800W 但吹风机仍超单台限，不可行
    assert.equal(r.removals.length, 1);
    assert.equal(r.removals[0].name, 'dryer');
  });
  it('状态非超限时无移除建议', () => {
    const r = checkPowerLimits(input({appliances: [app('pc', 100)]}));
    assert.equal(r.removals.length, 0);
  });
});

describe('预设库', () => {
  it('限值预设含 500/700/800W', () => {
    assert.ok(COMMON_LIMITS_W.includes(500));
    assert.ok(COMMON_LIMITS_W.includes(700));
    assert.ok(COMMON_LIMITS_W.includes(800));
  });
  it('电器预设含吹风机 800W 与电热水壶 1500W', () => {
    const dryer = APPLIANCE_PRESETS.find((p) => p.name === '吹风机（常见）');
    const kettle = APPLIANCE_PRESETS.find((p) => p.name === '电热水壶');
    assert.equal(dryer?.watts, 800);
    assert.equal(kettle?.watts, 1500);
  });
  it('示例数据：895W 超限，移除建议含吹风机', () => {
    const r = checkPowerLimits(input({appliances: sampleAppliances()}));
    assert.equal(r.totalWatts, 895);
    assert.equal(r.status, 'over');
    assert.ok(r.removals.some((x) => x.name === '吹风机（常见）'));
  });
});

describe('复制文本与输入钳制', () => {
  it('仅超单台限时复制文本不写"超出限值"，写单台超限', () => {
    const inp = input({appliances: [app('dryer', 800)]});
    const r = checkPowerLimits(inp);
    assert.equal(r.status, 'over');
    assert.equal(r.overTotalWatts, 0);
    const text = formatPowerSummary(inp, r);
    assert.ok(!text.includes('超出限值'));
    assert.ok(text.includes('超过单台限值'));
  });
  it('复制文本含限值、总功率、总电流与状态结论', () => {
    const inp = input({appliances: sampleAppliances()});
    const r = checkPowerLimits(inp);
    const text = formatPowerSummary(inp, r);
    assert.ok(text.includes('800W'));
    assert.ok(text.includes('895W'));
    assert.ok(text.includes('4.07A'));
    assert.ok(text.includes('会跳闸'));
    assert.ok(text.includes('吹风机'));
  });
  it('总限值 ≤0：valid=false，不计算占用率', () => {
    const r = checkPowerLimits(input({totalLimitW: 0, appliances: [app('pc', 100)]}));
    assert.equal(r.valid, false);
    assert.equal(r.usageRatio, 0);
    assert.equal(r.status, 'safe');
  });
  it('非法值钳制：负功率→0、台数 0→1、台数 20→9', () => {
    assert.equal(sanitizeAppliance({id: 'x', name: 'a', watts: -50, quantity: 0, on: true}).watts, 0);
    assert.equal(sanitizeAppliance({id: 'x', name: 'a', watts: 100, quantity: 0, on: true}).quantity, 1);
    assert.equal(sanitizeAppliance({id: 'x', name: 'a', watts: 100, quantity: 20, on: true}).quantity, 9);
  });
  it('空名钳制为"电器"', () => {
    assert.equal(sanitizeAppliance({id: 'x', name: '  ', watts: 100, quantity: 1, on: true}).name, '电器');
  });
});
