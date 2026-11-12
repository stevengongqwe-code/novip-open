/**
 * 考试倒计时与备考倒排规划 · 核心单测（Factory Day 8，2026-11-03）。
 * 覆盖严格日期校验、剩余天数、阶段边界、示例考试、周计划、模考节点、
 * 每日节奏、计划文本与 CSV、注册与 SEO 接线；全部以 2026-11-03 为“今天”。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tools, currentPage, SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT } from '../src/tools/registry';
import { pageSeo, toolNotes } from '../src/seo';
import {
  dailyRhythm,
  daysUntil,
  examsToCsv,
  mockNodes,
  nearestExam,
  parseDailyMinutes,
  parseExamDate,
  parseSessionMinutes,
  planToText,
  sortedExams,
  stageForDays,
  weeklyPlan,
  SAMPLE_EXAMS,
  type Exam,
} from '../src/tools/exam-plan-core';

const TODAY = '2026-11-03';

describe('严格日期校验（UTC 口径）', () => {
  it('合法日期通过', () => {
    assert.equal(parseExamDate('2026-11-15'), '2026-11-15');
    assert.equal(parseExamDate('2027-01-10'), '2027-01-10');
  });
  it('不存在的日期与错格式一律报错', () => {
    assert.throws(() => parseExamDate('2026-02-30'), /不存在/);
    assert.throws(() => parseExamDate('2026-13-01'), /不存在/);
    assert.throws(() => parseExamDate('2026/11/15'), /格式不对/);
    assert.throws(() => parseExamDate('2026-11-5'), /格式不对/);
    assert.throws(() => parseExamDate(''), /格式不对/);
  });
});

describe('剩余天数（PRD 示例，以 2026-11-03 为今天）', () => {
  it('三场示例：12 / 46 / 68 天', () => {
    assert.equal(daysUntil('2026-11-15', TODAY), 12);
    assert.equal(daysUntil('2026-12-19', TODAY), 46);
    assert.equal(daysUntil('2027-01-10', TODAY), 68);
  });
  it('考试日当天 0 天，已过期为负', () => {
    assert.equal(daysUntil('2026-11-03', TODAY), 0);
    assert.equal(daysUntil('2026-11-02', TODAY), -1);
  });
});

describe('阶段边界', () => {
  it('-1 已结束；0、7 临考冲刺；8、30 冲刺；31、90 强化；91 基础', () => {
    assert.equal(stageForDays(-1).label, '已结束');
    assert.equal(stageForDays(0).label, '临考冲刺');
    assert.equal(stageForDays(7).label, '临考冲刺');
    assert.equal(stageForDays(8).label, '冲刺');
    assert.equal(stageForDays(30).label, '冲刺');
    assert.equal(stageForDays(31).label, '强化');
    assert.equal(stageForDays(90).label, '强化');
    assert.equal(stageForDays(91).label, '基础');
  });
  it('临考冲刺建议为停新学转自测与错题复盘', () => {
    assert.ok(stageForDays(3).advice.includes('停新学'));
  });
});

describe('示例考试与最近一场', () => {
  it('示例 3 场按日期升序，最近一场 = 校内期中测验（12 天，冲刺）', () => {
    const ordered = sortedExams(SAMPLE_EXAMS);
    assert.deepEqual(ordered.map((e) => e.name), ['校内期中测验', '大学英语四级（示例）', '高等数学期末（示例）']);
    const nearest = nearestExam(SAMPLE_EXAMS, TODAY);
    assert.equal(nearest?.name, '校内期中测验');
    assert.equal(stageForDays(daysUntil('2026-11-15', TODAY)).label, '冲刺');
    assert.equal(stageForDays(daysUntil('2026-12-19', TODAY)).label, '强化');
    assert.equal(stageForDays(daysUntil('2027-01-10', TODAY)).label, '强化');
  });
  it('全部已结束时最近一场为 null；空名与非法日期不排序', () => {
    assert.equal(nearestExam([{ name: '旧考试', date: '2026-11-01' }], TODAY), null);
    assert.throws(() => sortedExams([{ name: ' ', date: '2026-11-15' }]), /名字/);
    assert.throws(() => sortedExams([{ name: 'x', date: '2026-02-30' }]), /不存在/);
  });
});

describe('周计划与模考节点（2026-11-03→2026-11-15）', () => {
  it('2 周：首周冲刺、次周临考冲刺，每周 3 条任务', () => {
    const weeks = weeklyPlan('2026-11-15', TODAY);
    assert.equal(weeks.length, 2);
    assert.deepEqual([weeks[0].startDate, weeks[0].endDate], ['2026-11-03', '2026-11-09']);
    assert.equal(weeks[0].stage.label, '冲刺');
    assert.deepEqual([weeks[1].startDate, weeks[1].endDate], ['2026-11-10', '2026-11-14']);
    assert.equal(weeks[1].stage.label, '临考冲刺');
    assert.equal(weeks[0].tasks.length, 3);
    assert.equal(weeks[1].tasks.length, 3);
    assert.ok(weeks[0].tasks.includes('限时套卷'));
    assert.ok(weeks[1].tasks.includes('作息调整'));
  });
  it('模考节点：考前 14 天（2026-11-01）早于今天不出现；考前 3 天（2026-11-12）在区间内出现且文案含“全真自测”', () => {
    const nodes = mockNodes('2026-11-15', TODAY);
    assert.deepEqual(nodes.map((n) => n.date), ['2026-11-12']);
    assert.equal(nodes[0].label, '全真自测');
    assert.ok(nodes[0].description.includes('全真自测'));
  });
  it('46 天场次：两模考节点都在区间内（2026-12-05 第一次模考、2026-12-16 全真自测）', () => {
    const nodes = mockNodes('2026-12-19', TODAY);
    assert.deepEqual(nodes.map((n) => [n.date, n.label]), [['2026-12-05', '第一次模考'], ['2026-12-16', '全真自测']]);
  });
  it('考试日当天与已结束：无周计划、无模考节点', () => {
    assert.deepEqual(weeklyPlan('2026-11-03', TODAY), []);
    assert.deepEqual(mockNodes('2026-11-03', TODAY), []);
    assert.deepEqual(weeklyPlan('2026-11-01', TODAY), []);
    assert.deepEqual(mockNodes('2026-11-01', TODAY), []);
  });
});

describe('每日节奏', () => {
  it('剩余 12 天 × 120 分钟 = 1440 分钟，单节 25 分钟 → 57 节', () => {
    const r = dailyRhythm(12, 120, 25);
    assert.deepEqual([r.studyDays, r.totalMinutes, r.totalSessions], [12, 1440, 57]);
  });
  it('考试日当天不计学习日；已结束为 0', () => {
    assert.deepEqual([dailyRhythm(0, 120, 25).totalMinutes, dailyRhythm(-5, 120, 25).totalMinutes], [0, 0]);
  });
  it('范围外输入报错', () => {
    assert.throws(() => parseDailyMinutes('29'), /30–600/);
    assert.throws(() => parseDailyMinutes('601'), /30–600/);
    assert.throws(() => parseDailyMinutes('abc'), /整数/);
    assert.throws(() => parseSessionMinutes('9'), /10–120/);
    assert.throws(() => parseSessionMinutes('121'), /10–120/);
    assert.throws(() => dailyRhythm(12, 10, 25), /30–600/);
  });
});

describe('计划文本与 CSV', () => {
  const exam: Exam = { name: '校内期中测验', date: '2026-11-15' };
  it('计划文本含考试名、日期、剩余天数、阶段、模考节点、周计划行与免责文案', () => {
    const text = planToText({ exam, today: TODAY, minutesPerDay: 120, sessionMinutes: 25 });
    for (const needle of ['校内期中测验', '2026-11-15', '剩余 12 天', '冲刺', '2026-11-12', '全真自测', '第 1 周', '2026-11-03～2026-11-09', '1440 分钟', '57 节', '不承诺提分', '学校/官方通知为准']) {
      assert.ok(text.includes(needle), `计划文本缺：${needle}`);
    }
  });
  it('CSV 含考试清单表头、三场示例与选中场周计划', () => {
    const csv = examsToCsv(SAMPLE_EXAMS, exam, TODAY, 120, 25);
    assert.ok(csv.includes('考试名'));
    assert.ok(csv.includes('大学英语四级（示例）'));
    assert.ok(csv.includes('高等数学期末（示例）'));
    assert.ok(csv.includes('第 1 周'));
    assert.ok(csv.includes('全真自测'));
  });
});

describe('注册与 SEO 接线', () => {
  it('registry 含 exam-plan，路由解析正确', () => {
    assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
    assert.ok(tools.some((t) => t.id === 'exam-plan' && t.path === '/tools/exam-plan' && t.group === '学习写作'));
    assert.equal(currentPage('/tools/exam-plan', ''), 'exam-plan');
    assert.equal(currentPage('/tools/exam-plan/', ''), 'exam-plan');
  });
  it('pageSeo 与 toolNotes 含 exam-plan', () => {
    const seo = pageSeo('exam-plan');
    assert.equal(seo.title, '考试倒计时与备考倒排规划（多考试倒计时·阶段判定·周计划·模考节点·纯本地）｜NOVIP 大学生工具');
    assert.ok(seo.description.includes('模考节点'));
    assert.ok((toolNotes['exam-plan'] ?? '').includes('周计划'));
  });
});
