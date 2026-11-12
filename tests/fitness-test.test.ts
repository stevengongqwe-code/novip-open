import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bmiScore,
  bonusFor,
  calcFitness,
  formatRunTime,
  parseCount,
  parseTimeSeconds,
  resultToCsv,
  resultToText,
  scoreHighBetter,
  scoreLowBetter,
  SAMPLE_INPUT,
} from '../src/tools/fitness-test-core';
import { tools, SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT } from '../src/tools/registry';

test('体测：PRD 锁定示例（男生大一/大二，BMI 100 分档、其余 6 项 80 分档）', () => {
  const r = calcFitness(SAMPLE_INPUT);
  assert.equal(r.filledCount, 7);
  assert.equal(r.partial, false);
  assert.deepEqual(r.items.map((it) => it.score), [100, 80, 80, 80, 80, 80, 80]);
  assert.equal(r.standardScore, 83);
  assert.equal(r.bonus, 0);
  assert.equal(r.total, 83);
  assert.equal(r.grade, '良好');
  assert.equal(r.nextGradeGap, 7);
  assert.equal(r.nextGradeLabel, '优秀');
  assert.equal(r.bmiValue, 22.2);
});

test('体测：查表取最高档、介于两档取低档、低于 10 分档为 0', () => {
  // 男生大一/大二肺活量：4300→80；4400 介于 4300(80) 与 4550(85) 之间→80；2299 低于 2300(10)→0。
  const lung = [5040, 4920, 4800, 4550, 4300, 4180, 4060, 3940, 3820, 3700, 3580, 3460, 3340, 3220, 3100, 2940, 2780, 2620, 2460, 2300] as const;
  assert.equal(scoreHighBetter(4300, lung), 80);
  assert.equal(scoreHighBetter(4400, lung), 80);
  assert.equal(scoreHighBetter(2299, lung), 0);
  // 50 米低优：7.1→80；7.2 介于 7.1(80) 与 7.3(78) 之间→78；10.2 慢于 10.1(10)→0。
  const sprint = [6.7, 6.8, 6.9, 7.0, 7.1, 7.3, 7.5, 7.7, 7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1] as const;
  assert.equal(scoreLowBetter(7.1, sprint), 80);
  assert.equal(scoreLowBetter(7.2, sprint), 78);
  assert.equal(scoreLowBetter(10.2, sprint), 0);
});

test('体测：男生引体空档跳过（15 次→80、14 次→76）与女生组别差异', () => {
  const r = calcFitness({ gender: 'male', group: 'lower', strength: 15 });
  assert.equal(r.items[0].score, 80);
  const r2 = calcFitness({ gender: 'male', group: 'lower', strength: 14 });
  assert.equal(r2.items[0].score, 76);
  // 同为 15 次：大三/大四组 100 分档为 16 次，15 次只到 76 分档。
  const r3 = calcFitness({ gender: 'male', group: 'upper', strength: 15 });
  assert.equal(r3.items[0].score, 76);
  // 女生大一/大二仰卧起坐 56 次→100，55 次→95。
  assert.equal(calcFitness({ gender: 'female', group: 'lower', strength: 56 }).items[0].score, 100);
  assert.equal(calcFitness({ gender: 'female', group: 'lower', strength: 55 }).items[0].score, 95);
});

test('体测：BMI 分档（男正常/低体重/超重/肥胖）', () => {
  assert.equal(bmiScore(22.2, 'male'), 100);
  assert.equal(bmiScore(17.8, 'male'), 80);
  assert.equal(bmiScore(25.0, 'male'), 80);
  assert.equal(bmiScore(28.0, 'male'), 60);
  assert.equal(bmiScore(17.2, 'female'), 100);
  assert.equal(bmiScore(17.1, 'female'), 80);
});

test('体测：附加分（男引体次数、女仰卧起坐档位、男女长跑秒数）', () => {
  // 男大一/大二：引体 20 次（超 19 次 1 次）→+1；1000 米 3'00"=180 秒（快于 197 秒 17 秒，介于 16 与 20 之间→+4）。
  assert.equal(bonusFor('male', 'lower', 20, 180), 5);
  assert.equal(bonusFor('male', 'lower', 29, 197), 10); // 引体封顶 10，长跑未超不加分
  // 女大一/大二：仰卧起坐 69 次（超 56 次 13 次）→+10；800 米 2'28"=148 秒（快于 198 秒 50 秒）→+10，合计封顶 20。
  assert.equal(bonusFor('female', 'lower', 69, 148), 20);
  // 女仰卧起坐超 3 次（介于 2→1 与 4→2 之间）→+1。
  assert.equal(bonusFor('female', 'lower', 59, 198), 1);
});

test('体测：等级边界与部分填写', () => {
  const full = calcFitness({ ...SAMPLE_INPUT, lung: 5040, sprint50: 6.7, sitReach: 24.9, jump: 273, strength: 19, runSeconds: 197 });
  assert.equal(full.total, 100);
  assert.equal(full.grade, '优秀');
  assert.equal(full.nextGradeGap, null);
  const partial = calcFitness({ gender: 'male', group: 'lower', lung: 4300 });
  assert.equal(partial.partial, true);
  assert.equal(partial.grade, '待补全');
  assert.equal(partial.filledCount, 1);
});

test('体测：时间解析（分秒写法与纯秒）与非法输入', () => {
  assert.equal(parseTimeSeconds(`3'45"`, '1000 米跑'), 225);
  assert.equal(parseTimeSeconds('3:45', '1000 米跑'), 225);
  assert.equal(parseTimeSeconds('3分45秒', '1000 米跑'), 225);
  assert.equal(parseTimeSeconds('225', '1000 米跑'), 225);
  assert.equal(parseTimeSeconds('7.2', '50 米跑'), 7.2);
  assert.throws(() => parseTimeSeconds(`3'60"`, '1000 米跑'), /秒数不能/);
  assert.throws(() => parseTimeSeconds(`0'00"`, '1000 米跑'), /大于 0/);
  assert.throws(() => parseTimeSeconds('0:00', '1000 米跑'), /大于 0/);
  assert.throws(() => parseTimeSeconds('0分0秒', '1000 米跑'), /大于 0/);
  assert.equal(parseTimeSeconds(`0'01"`, '1000 米跑'), 1);
  assert.throws(() => parseTimeSeconds('abc', '1000 米跑'), /格式不对/);
  assert.throws(() => parseCount('2.5', '引体向上'), /非负整数/);
  assert.equal(formatRunTime(222), `3'42"`);
  assert.equal(formatRunTime(197), `3'17"`);
});

test('体测：结果文本与 CSV 含关键行', () => {
  const r = calcFitness(SAMPLE_INPUT);
  const text = resultToText(r, 'male', 'lower');
  assert.match(text, /学年总分：83\.0 分；等级：良好/);
  assert.match(text, /最弱项/);
  assert.match(text, /到优秀还差 7\.0 分/);
  const csv = resultToCsv(r, 'male', 'lower');
  assert.match(csv, /学年总分/);
  assert.match(csv, /83.0/);
});

test('体测：注册表含新工具且动态工具总数', () => {
  const tool = tools.find((t) => t.id === 'fitness-test');
  assert.ok(tool);
  assert.equal(tool?.path, '/tools/fitness-test');
  assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
});
