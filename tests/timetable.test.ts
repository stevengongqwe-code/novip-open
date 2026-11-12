// 大学课程表生成器 · 核心逻辑与 ICS 日历导出单元测试
// 运行：node --import tsx --test tests/timetable.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  blankCourse,
  buildICS,
  conflictsBetween,
  courseOccurrences,
  courseWeeks,
  coursesInWeek,
  dayOf,
  dayToISO,
  defaultSettings,
  emptyData,
  escapeICSText,
  findConflicts,
  foldLine,
  formatWeekList,
  generatePeriods,
  loadFromStorage,
  normalizeData,
  parseISODate,
  parseTime,
  parseWeekList,
  saveToStorage,
  shanghaiToday,
  splitRuns,
  termEndDay,
  validateCourse,
  validatePeriods,
  validateSettings,
  week1Monday,
  weekForDay,
  weekdayOfDay,
  type Course,
  type Settings,
  type StorageLike,
} from '../src/tools/timetable-core';

/** 将 ICS 折行还原并解析所有 VEVENT，展开 RRULE 得到每次课的实际日期与起止时间。 */
function parseAndExpandICS(icsText: string): {
  uid: string;
  summary: string;
  location: string;
  dates: { date: string; start: string; end: string }[];
  triggers: string[];
}[] {
  // 检查每行字节长度不超过 75 bytes（不含 CRLF）
  const rawLines = icsText.split('\r\n');
  const encoder = new TextEncoder();
  for (const line of rawLines) {
    assert.ok(
      encoder.encode(line).length <= 75,
      `ICS 存在超过 75 字节的行（${encoder.encode(line).length} 字节）：${line}`,
    );
  }
  // 展开折行
  const unfolded = icsText.replace(/\r\n /g, '');
  const lines = unfolded.split('\r\n').filter(Boolean);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines[lines.length - 1], 'END:VCALENDAR');

  const events: {
    uid: string;
    summary: string;
    location: string;
    dates: { date: string; start: string; end: string }[];
    triggers: string[];
  }[] = [];

  let inEvent = false;
  let inAlarm = false;
  let uid = '';
  let summary = '';
  let location = '';
  let dtstart = '';
  let dtend = '';
  let rrule = '';
  let triggers: string[] = [];

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      summary = '';
      location = '';
      dtstart = '';
      dtend = '';
      rrule = '';
      triggers = [];
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      const mStart = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(dtstart);
      const mEnd = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(dtend);
      assert.ok(mStart, `非法 DTSTART: ${dtstart}`);
      assert.ok(mEnd, `非法 DTEND: ${dtend}`);
      const baseDay = parseISODate(`${mStart[1]}-${mStart[2]}-${mStart[3]}`);
      assert.ok(baseDay !== null);
      const startStr = `${mStart[4]}:${mStart[5]}`;
      const endStr = `${mEnd[4]}:${mEnd[5]}`;

      let interval = 1;
      let count = 1;
      if (rrule) {
        const kv = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
        assert.equal(kv.FREQ, 'WEEKLY');
        interval = Number(kv.INTERVAL ?? '1');
        count = Number(kv.COUNT ?? '1');
      }
      const dates: { date: string; start: string; end: string }[] = [];
      for (let i = 0; i < count; i++) {
        dates.push({
          date: dayToISO(baseDay + i * interval * 7),
          start: startStr,
          end: endStr,
        });
      }
      events.push({ uid, summary, location, dates, triggers });
      continue;
    }
    if (!inEvent) continue;
    if (line === 'BEGIN:VALARM') {
      inAlarm = true;
      continue;
    }
    if (line === 'END:VALARM') {
      inAlarm = false;
      continue;
    }
    if (inAlarm) {
      if (line.startsWith('TRIGGER:')) triggers.push(line.slice('TRIGGER:'.length));
      continue;
    }
    if (line.startsWith('UID:')) uid = line.slice(4);
    else if (line.startsWith('SUMMARY:')) summary = line.slice(8);
    else if (line.startsWith('LOCATION:')) location = line.slice(9);
    else if (line.startsWith('DTSTART;TZID=Asia/Shanghai:')) dtstart = line.split(':')[1];
    else if (line.startsWith('DTEND;TZID=Asia/Shanghai:')) dtend = line.split(':')[1];
    else if (line.startsWith('RRULE:')) rrule = line.slice(6);
  }
  return events;
}

describe('民用日期与中国标准时间（Asia/Shanghai）', () => {
  it('正确解析合法日期并拒绝伪造日期（如 2 月 29/30 日）', () => {
    assert.equal(parseISODate('2026-02-28') !== null, true);
    assert.equal(parseISODate('2026-02-29'), null); // 2026 非闰年
    assert.equal(parseISODate('2024-02-29') !== null, true); // 2024 闰年
    assert.equal(parseISODate('2026-04-31'), null);
    assert.equal(parseISODate('2026-9-1'), null);

    const d = parseISODate('2026-09-07')!;
    assert.equal(dayToISO(d), '2026-09-07');
    assert.equal(weekdayOfDay(d), 1); // 周一
    assert.equal(weekdayOfDay(d + 6), 7); // 周日
  });

  it('shanghaiToday 按 UTC+8 切换自然日，不受运行环境时区影响', () => {
    // 2026-09-06 15:59:59 UTC = 北京时间 2026-09-06 23:59:59
    const beforeMidnight = Date.UTC(2026, 8, 6, 15, 59, 59);
    assert.equal(dayToISO(shanghaiToday(beforeMidnight)), '2026-09-06');

    // 2026-09-06 16:00:00 UTC = 北京时间 2026-09-07 00:00:00
    const atMidnight = Date.UTC(2026, 8, 6, 16, 0, 0);
    assert.equal(dayToISO(shanghaiToday(atMidnight)), '2026-09-07');
  });
});

describe('学期周次、跨月份与单双周日期计算', () => {
  const settings: Settings = {
    ...defaultSettings(),
    termStart: '2026-09-07', // 周一
    totalWeeks: 18,
  };

  it('正确计算第 1 周周一、跨月份日期与学期结束日期', () => {
    const m1 = week1Monday(settings)!;
    assert.equal(dayToISO(m1), '2026-09-07');
    // 第 4 周周四：2026-09-07 + 3*7 + 3 = 2026-10-01（跨 9 月→10 月）
    assert.equal(dayToISO(dayOf(settings, 4, 4)!), '2026-10-01');
    // 第 18 周周日：2026-09-07 + 18*7 - 1 = 2027-01-10（跨年）
    assert.equal(dayToISO(termEndDay(settings)!), '2027-01-10');
  });

  it('正确判断开学前、学期中、学期后状态', () => {
    assert.deepEqual(weekForDay(settings, parseISODate('2026-09-01')!), { week: 1, status: 'before' });
    assert.deepEqual(weekForDay(settings, parseISODate('2026-09-07')!), { week: 1, status: 'during' });
    assert.deepEqual(weekForDay(settings, parseISODate('2026-09-20')!), { week: 2, status: 'during' });
    assert.deepEqual(weekForDay(settings, parseISODate('2027-01-11')!), { week: 18, status: 'after' });
  });

  it('支持每周、单周、双周与自定义周次', () => {
    assert.deepEqual(
      courseWeeks({ startWeek: 1, endWeek: 6, weekRule: 'all', customWeeks: [] }, 18),
      [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(
      courseWeeks({ startWeek: 1, endWeek: 6, weekRule: 'odd', customWeeks: [] }, 18),
      [1, 3, 5],
    );
    assert.deepEqual(
      courseWeeks({ startWeek: 1, endWeek: 6, weekRule: 'even', customWeeks: [] }, 18),
      [2, 4, 6],
    );
    assert.deepEqual(
      courseWeeks({ startWeek: 1, endWeek: 18, weekRule: 'custom', customWeeks: [8, 1, 3, 2, 3, 25] }, 18),
      [1, 2, 3, 8],
    );
  });

  it('解析并格式化自定义周次字符串', () => {
    const r = parseWeekList('第1-4周，6、8～10', 18);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.weeks, [1, 2, 3, 4, 6, 8, 9, 10]);
    assert.equal(formatWeekList(r.weeks), '1-4, 6, 8-10');

    assert.ok(parseWeekList('5-2', 18).error);
    assert.ok(parseWeekList('1-20', 18).error);
    assert.ok(parseWeekList('abc', 18).error);
  });

  it('当学期从周三开始时，第 1 周周一周二的课不会错误生成在开学前', () => {
    const midWeekSettings: Settings = { ...settings, termStart: '2026-09-09' }; // 周三
    const monCourse = blankCourse(midWeekSettings, {
      name: '周一课',
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
      startWeek: 1,
      endWeek: 3,
    });
    const thuCourse = blankCourse(midWeekSettings, {
      name: '周四课',
      weekday: 4,
      startPeriod: 1,
      endPeriod: 2,
      startWeek: 1,
      endWeek: 3,
    });
    const monOcc = courseOccurrences(monCourse, midWeekSettings);
    const thuOcc = courseOccurrences(thuCourse, midWeekSettings);
    assert.deepEqual(monOcc.map((o) => o.date), ['2026-09-14', '2026-09-21']);
    assert.deepEqual(thuOcc.map((o) => o.date), ['2026-09-10', '2026-09-17', '2026-09-24']);
    assert.equal(coursesInWeek([monCourse, thuCourse], midWeekSettings, 1).length, 1);
  });
});

describe('时间冲突检测与校验', () => {
  const settings = defaultSettings();

  it('同星期同节次：单周与双周课程不冲突，周次重叠时精确报告冲突周', () => {
    const oddCourse = blankCourse(settings, {
      name: '线性代数（单周）',
      weekday: 2,
      startPeriod: 3,
      endPeriod: 4,
      startWeek: 1,
      endWeek: 16,
      weekRule: 'odd',
    });
    const evenCourse = blankCourse(settings, {
      name: '物理实验（双周）',
      weekday: 2,
      startPeriod: 3,
      endPeriod: 4,
      startWeek: 1,
      endWeek: 16,
      weekRule: 'even',
    });
    assert.deepEqual(conflictsBetween(oddCourse, evenCourse, 18), []);

    const extraCourse = blankCourse(settings, {
      name: '选修课',
      weekday: 2,
      startPeriod: 4,
      endPeriod: 5,
      startWeek: 1,
      endWeek: 6,
      weekRule: 'all',
    });
    const conflicts = findConflicts([oddCourse, evenCourse, extraCourse], 18);
    assert.equal(conflicts.length, 2);
    assert.deepEqual(conflicts[0].weeks, [1, 3, 5]);
    assert.deepEqual(conflicts[1].weeks, [2, 4, 6]);
  });

  it('校验节次时间、学期设置与课程字段', () => {
    assert.equal(validatePeriods(settings.periods), null);
    assert.match(
      validatePeriods([{ start: '09:00', end: '08:30' }]),
      /下课时间需晚于上课时间/,
    );
    assert.match(
      validatePeriods([
        { start: '08:00', end: '09:00' },
        { start: '08:50', end: '09:35' },
      ]),
      /时间重叠/,
    );
    const generated = generatePeriods(4, '08:00', 45, 10);
    assert.equal(generated.length, 4);
    assert.equal(generated[3].end, '11:30');
    assert.equal(validateSettings({ ...settings, termStart: '2026-02-30' }) !== null, true);
    assert.match(
      validateCourse(blankCourse(settings, { name: '   ' }), settings) ?? '',
      /请填写课程名称/,
    );
    assert.match(
      validateCourse(blankCourse(settings, { name: '无双周', startWeek: 3, endWeek: 3, weekRule: 'even' }), settings) ?? '',
      /没有双周/,
    );
  });
});

describe('ICS 日历导出与重新解析校验', () => {
  it('导出标准 ICS 并重新展开验证：单周、双周、每周、自定义周次日期 0 误差、0 重复', () => {
    const settings: Settings = {
      ...defaultSettings(),
      termStart: '2026-09-07', // 周一
      totalWeeks: 10,
      reminder: 15,
    };
    const courses: Course[] = [
      blankCourse(settings, {
        id: 'c-all',
        name: '高等数学, A; (必修)',
        teacher: '王老师',
        room: '教一 201',
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        startWeek: 1,
        endWeek: 4,
        weekRule: 'all',
      }),
      blankCourse(settings, {
        id: 'c-odd',
        name: '线性代数',
        teacher: '张老师',
        room: '教二 108',
        weekday: 2,
        startPeriod: 3,
        endPeriod: 4,
        startWeek: 1,
        endWeek: 6,
        weekRule: 'odd',
      }),
      blankCourse(settings, {
        id: 'c-even',
        name: '大学物理实验',
        teacher: '赵老师',
        room: '实验楼 B204',
        weekday: 4,
        startPeriod: 5,
        endPeriod: 6,
        startWeek: 1,
        endWeek: 6,
        weekRule: 'even',
      }),
      blankCourse(settings, {
        id: 'c-custom',
        name: '程序设计基础（含超长课程备注验证折行与UTF-8字符不截断）',
        teacher: '陈老师',
        room: '信息楼机房 302',
        weekday: 5,
        startPeriod: 1,
        endPeriod: 2,
        startWeek: 1,
        endWeek: 10,
        weekRule: 'custom',
        customWeeks: [1, 2, 3, 5, 8, 9],
      }),
    ];

    const data = { version: 1 as const, settings, courses };
    const { text, events, occurrences } = buildICS(data, { nowMs: 1760000000000 });
    // c-all: 1 run (4), c-odd: 1 run (1,3,5 -> 3), c-even: 1 run (2,4,6 -> 3), c-custom: [1,2,3] + [5,8] + [9] -> 3 runs (6)
    assert.equal(occurrences, 4 + 3 + 3 + 6);
    assert.ok(events >= 4);

    const parsedEvents = parseAndExpandICS(text);
    assert.equal(parsedEvents.length, events);

    // 验证每个事件都带有 -PT15M 提醒
    for (const ev of parsedEvents) {
      assert.deepEqual(ev.triggers, ['-PT15M']);
    }

    // 汇总每个课程的所有展开课次，与 courseOccurrences 逐一比对
    for (const course of courses) {
      const expected = courseOccurrences(course, settings).map((o) => ({
        date: o.date,
        start: o.start,
        end: o.end,
      }));
      const actual = parsedEvents
        .filter((ev) => ev.uid.startsWith(course.id + '-'))
        .flatMap((ev) => ev.dates);
      assert.deepEqual(actual, expected, `课程 ${course.name} 展开日期与预期不一致`);
      // 确认无重复日期
      assert.equal(new Set(actual.map((a) => a.date)).size, actual.length);
    }

    // 验证不提醒（reminder: 0）时不生成 VALARM
    const noAlarm = buildICS({ ...data, settings: { ...settings, reminder: 0 } });
    assert.equal(noAlarm.text.includes('BEGIN:VALARM'), false);

    // 验证 5 / 10 / 30 分钟提醒
    for (const min of [5, 10, 30] as const) {
      const withAlarm = buildICS(data, { reminder: min });
      assert.equal(withAlarm.text.includes(`TRIGGER:-PT${min}M`), true);
    }
  });

  it('escapeICSText 与 foldLine 正确处理特殊字符和多字节中文', () => {
    assert.equal(escapeICSText('A,B;C\\D\nE'), 'A\\,B\\;C\\\\D\\nE');
    const longLine = 'SUMMARY:' + '高等数学课程测试'.repeat(10);
    const folded = foldLine(longLine);
    assert.equal(folded.replace(/\r\n /g, ''), longLine);
    assert.equal(folded.includes('\ufffd'), false);
  });
});

describe('本地存储恢复与备份数据清洗', () => {
  function memStorage(): StorageLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  }

  it('保存并从 localStorage 完整恢复课表，处理单数字小时与损坏条目', () => {
    const store = memStorage();
    const base = emptyData(Date.UTC(2026, 8, 7));
    base.settings.periods[0] = { start: '8:00', end: '08:45' };
    base.courses = [
      blankCourse(base.settings, { name: '数据结构', weekday: 3, startPeriod: 1, endPeriod: 2 }),
    ];

    assert.equal(saveToStorage(store, base), null);
    const loaded = loadFromStorage(store);
    assert.equal(loaded.source, 'saved');
    assert.equal(loaded.warning, undefined);
    assert.equal(loaded.data.courses.length, 1);
    assert.equal(loaded.data.courses[0].name, '数据结构');
    assert.equal(loaded.data.settings.periods[0].start, '08:00');

    // 混入 1 条非法课程时跳过并给出提示，合法课程正常恢复
    const raw = JSON.parse(store.getItem(STORAGE_KEY)!);
    raw.courses.push({ name: '', weekday: 99 });
    const norm = normalizeData(raw);
    assert.equal(norm.ok, true);
    if (norm.ok) {
      assert.equal(norm.dropped, 1);
      assert.equal(norm.data.courses.length, 1);
    }

    // 损坏 JSON 不抛异常，返回安全空课表与中文告警
    store.setItem(STORAGE_KEY, '{bad-json');
    const corrupted = loadFromStorage(store);
    assert.equal(corrupted.source, 'new');
    assert.match(corrupted.warning ?? '', /损坏/);
  });
});
