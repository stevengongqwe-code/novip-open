import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCoursePoint,
  calculateGpaSummary,
  calculateFinalExamNeeded,
  parseCoursesText,
  formatGpaReport,
  SAMPLE_COURSES,
  GPA_SCALES,
} from '../src/tools/grades-core';

test('GPA核心 · 单门课程绩点转换', () => {
  // 标准 4.0
  assert.equal(calculateCoursePoint(95, 'standard-4'), 4.0);
  assert.equal(calculateCoursePoint(90, 'standard-4'), 4.0);
  assert.equal(calculateCoursePoint(85, 'standard-4'), 3.0);
  assert.equal(calculateCoursePoint(75, 'standard-4'), 2.0);
  assert.equal(calculateCoursePoint(65, 'standard-4'), 1.0);
  assert.equal(calculateCoursePoint(59, 'standard-4'), 0.0);

  // 标准 4.5
  assert.equal(calculateCoursePoint(92, 'standard-4.5'), 4.5);
  assert.equal(calculateCoursePoint(82, 'standard-4.5'), 3.5);
  assert.equal(calculateCoursePoint(55, 'standard-4.5'), 0.0);

  // 北大 4.0 连续算法
  // 100 分 -> 4.0
  assert.equal(calculateCoursePoint(100, 'pku-4'), 4.0);
  // 90 分 -> 4 - 3*(10)^2/1600 = 4 - 300/1600 = 4 - 0.1875 = 3.81
  assert.equal(calculateCoursePoint(90, 'pku-4'), 3.81);
  // <60 分 -> 0
  assert.equal(calculateCoursePoint(59, 'pku-4'), 0.0);

  // 五分制
  assert.equal(calculateCoursePoint(100, 'standard-5'), 5.0);
  assert.equal(calculateCoursePoint(90, 'standard-5'), 4.0);
  assert.equal(calculateCoursePoint(60, 'standard-5'), 1.0);
  assert.equal(calculateCoursePoint(55, 'standard-5'), 0.0);
});

test('GPA核心 · 多门课程综合学分绩点计算', () => {
  const result = calculateGpaSummary(SAMPLE_COURSES, 'standard-4');

  // 总学分: 4.0 + 2.0 + 3.0 + 3.0 + 3.5 = 15.5
  assert.equal(result.totalCredits, 15.5);
  assert.equal(result.passedCredits, 15.5);

  // 各科绩点:
  // 89 分 -> 3.0 * 4 = 12
  // 92 分 -> 4.0 * 2 = 8
  // 78 分 -> 2.0 * 3 = 6
  // 86 分 -> 3.0 * 3 = 9
  // 84 分 -> 3.0 * 3.5 = 10.5
  // 总加权绩点 = 12 + 8 + 6 + 9 + 10.5 = 45.5
  // 加权 GPA = 45.5 / 15.5 = 2.9354... -> 2.94
  assert.equal(result.weightedGpa, 2.94);

  // 加权平均分: (89*4 + 92*2 + 78*3 + 86*3 + 84*3.5) / 15.5 = (356 + 184 + 234 + 258 + 294) / 15.5 = 1326 / 15.5 = 85.548... -> 85.55
  assert.equal(result.weightedAverageScore, 85.55);

  // 格式化文本校验
  const report = formatGpaReport(result, GPA_SCALES['standard-4'].name);
  assert.match(report, /平均学分绩点 \(GPA\): 2\.94 \/ 4\.0/);
  assert.match(report, /高等数学/);
  assert.match(report, /15\.5 学分/);
});

test('GPA核心 · 平时分期末反推计算', () => {
  // 1. 平时分 80，平时权重 30%，目标 60 (及格)
  // 期末卷面 = (60 - 80*0.3) / 0.7 = (60 - 24) / 0.7 = 36 / 0.7 = 51.428... -> 51.4
  const res1 = calculateFinalExamNeeded(80, 30, 60);
  assert.equal(res1.neededExamScore, 51.4);
  assert.equal(res1.possible, true);
  assert.equal(res1.alreadyEnough, false);
  assert.equal(res1.difficulty, 'easy');

  // 2. 平时分 90，平时权重 40%，目标 85 (优秀)
  // 期末卷面 = (85 - 90*0.4) / 0.6 = (85 - 36) / 0.6 = 49 / 0.6 = 81.666... -> 81.7
  const res2 = calculateFinalExamNeeded(90, 40, 85);
  assert.equal(res2.neededExamScore, 81.7);
  assert.equal(res2.possible, true);
  assert.equal(res2.difficulty, 'challenging');

  // 3. 平时分太低 40 分，占比 30%，目标 95 分
  // (95 - 40*0.3) / 0.7 = (95 - 12) / 0.7 = 83 / 0.7 = 118.57... > 100 不可达
  const res3 = calculateFinalExamNeeded(40, 30, 95);
  assert.equal(res3.possible, false);
  assert.equal(res3.difficulty, 'impossible');

  // 4. 平时分 100，占比 60%，目标 60 及格
  // 平时贡献 60 分已经够了
  const res4 = calculateFinalExamNeeded(100, 60, 60);
  assert.equal(res4.alreadyEnough, true);
  assert.equal(res4.difficulty, 'already_enough');
});

test('GPA核心 · 课程文本智能解析', () => {
  const text = `
    大学物理 85 3
    高等数学, 90, 4.0
    毛泽东思想概论 88 3
    75, 2
  `;
  const parsed = parseCoursesText(text);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].name, '大学物理');
  assert.equal(parsed[0].score, 85);
  assert.equal(parsed[0].credits, 3);

  assert.equal(parsed[1].name, '高等数学');
  assert.equal(parsed[1].score, 90);
  assert.equal(parsed[1].credits, 4.0);

  assert.equal(parsed[3].score, 75);
  assert.equal(parsed[3].credits, 2);
});
