/**
 * 考试倒计时与备考倒排规划（Factory Day 8，2026-11-03）。
 * 多门考试撞期时，不知道先看哪门、每周该干什么、模考放在哪天？
 * 填好考试名和日期，就能看到每场剩余天数与阶段、选中一场的倒排周计划
 * 与模考节点，还能复制计划文本或下载 CSV。
 * 纯浏览器本地处理：不上传、不登录、不存 localStorage，刷新即清空；
 * 考试日期请以学校/官方通知为准，本工具不提供官方考试日历；
 * 计划为建议节奏，不承诺提分。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  csvDateSuffix,
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
  todayUtc,
  weeklyPlan,
  SAMPLE_EXAMS,
  type Exam,
} from './exam-plan-core';

export default function ExamPlan() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayUtc());
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [minutesText, setMinutesText] = useState('120');
  const [sessionText, setSessionText] = useState('25');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const today = todayUtc();
  const ordered = useMemo(() => {
    try {
      return sortedExams(exams);
    } catch {
      return [...exams].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
  }, [exams]);
  const nearest = useMemo(() => {
    try {
      return nearestExam(exams, today);
    } catch {
      return null;
    }
  }, [exams, today]);
  const selected = ordered.find((e) => `${e.name}@@${e.date}` === selectedName) ?? nearest ?? null;

  const rhythm = useMemo(() => {
    if (!selected) return null;
    try {
      return {
        days: daysUntil(selected.date, today),
        parsed: dailyRhythm(daysUntil(selected.date, today), parseDailyMinutes(minutesText), parseSessionMinutes(sessionText)),
        error: '',
      };
    } catch (e) {
      return { days: daysUntil(selected.date, today), parsed: null, error: e instanceof Error ? e.message : '每日节奏解析失败。' };
    }
  }, [selected, minutesText, sessionText, today]);

  const addExam = () => {
    try {
      setError('');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('请给考试起个名字（例如“大学英语四级”）。');
      const validDate = parseExamDate(date);
      const exam: Exam = {
        name: trimmed,
        date: validDate,
        subject: subject.trim() || undefined,
        note: note.trim() || undefined,
      };
      setExams((cur) => [...cur, exam]);
      setSelectedName(`${exam.name}@@${exam.date}`);
      setName('');
      setSubject('');
      setNote('');
      setStatus(`已加入「${exam.name}」（${exam.date}）。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败，请检查输入。');
    }
  };

  const loadSample = () => {
    setExams(SAMPLE_EXAMS);
    setSelectedName(`${SAMPLE_EXAMS[0].name}@@${SAMPLE_EXAMS[0].date}`);
    setMinutesText('120');
    setSessionText('25');
    setError('');
    setStatus('已填入示例考试 3 场：校内期中测验 2026-11-15、大学英语四级（示例）2026-12-19、高等数学期末（示例）2027-01-10；最近一场是校内期中测验。');
  };

  const clearAll = () => {
    setExams([]);
    setName('');
    setSubject('');
    setNote('');
    setSelectedName('');
    setStatus('');
    setError('');
  };

  const planText = () => {
    if (!selected) return '';
    try {
      return planToText({
        exam: selected,
        today,
        minutesPerDay: parseDailyMinutes(minutesText),
        sessionMinutes: parseSessionMinutes(sessionText),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成计划失败。');
      return '';
    }
  };

  const downloadCsv = () => {
    if (!selected) {
      setError('请先添加并选中一场考试，再下载 CSV。');
      return;
    }
    try {
      const csv = examsToCsv(exams, selected, today, parseDailyMinutes(minutesText), parseSessionMinutes(sessionText));
      saveLocal(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `novip-exam-plan-${csvDateSuffix()}.csv`);
      setError('');
      setStatus('已开始下载考试计划 CSV。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败，请检查每日节奏输入。');
    }
  };

  const weeks = selected ? weeklyPlan(selected.date, today) : [];
  const nodes = selected ? mockNodes(selected.date, today) : [];

  return (
    <ToolPage
      id="exam-plan"
      title="考试倒计时与备考倒排规划"
      description="多门考试撞期不知道先看哪门？填好考试名和日期，就能看到每场剩余天数与阶段、选中一场的倒排周计划与模考节点，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 添加考试</h2>
        <p>考试日期请以学校/官方通知为准，本工具不提供官方考试日历。考试清单与计划只在当前浏览器里处理，不上传、不保存，刷新页面即清空。</p>
        <label>
          考试名
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：大学英语四级" maxLength={40} />
        </label>
        <label>
          考试日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          科目（可选）
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="例如：英语" maxLength={20} />
        </label>
        <label>
          备注（可选）
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：上午 9:00 开考" maxLength={60} />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={addExam}>加入这场考试</button>
          <button className="study-btn alt" onClick={loadSample}>填入示例考试</button>
          <button className="study-btn alt" onClick={clearAll}>清空全部</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
      </section>

      {ordered.length > 0 && (
        <section className="study-card">
          <h2>2 考试倒计时（按日期升序）</h2>
          <ul>
            {ordered.map((e) => {
              const days = daysUntil(e.date, today);
              const stage = stageForDays(days);
              const isNearest = nearest?.name === e.name && nearest?.date === e.date;
              const key = `${e.name}@@${e.date}`;
              return (
                <li key={key}>
                  {e.name}（{e.date}）{e.subject ? ` ${e.subject}` : ''}：{days < 0 ? '已结束' : `剩余 ${days} 天`} · {stage.label}
                  {isNearest && ' · 最近一场'}
                  {e.note ? `（${e.note}）` : ''}
                  <button className="study-btn alt" onClick={() => setSelectedName(key)}>生成这场计划</button>
                  <button className="study-btn alt" onClick={() => setExams((cur) => cur.filter((x) => `${x.name}@@${x.date}` !== key))}>删除这场</button>
                </li>
              );
            })}
          </ul>
          {nearest && <p>最近一场：{nearest.name}（{nearest.date}）。</p>}
        </section>
      )}

      {selected && (
        <section className="study-card">
          <h2>3 倒排周计划：{selected.name}（{selected.date}）</h2>
          <p>
            剩余 {rhythm?.days} 天 · 阶段：{stageForDays(rhythm?.days ?? 0).label}
            （{stageForDays(rhythm?.days ?? 0).advice}）
          </p>
          <label>
            每日可学分钟数（30–600，默认 120）
            <input value={minutesText} onChange={(e) => setMinutesText(e.target.value)} placeholder="例如：120" inputMode="numeric" />
          </label>
          <label>
            单节时长（分钟，10–120，默认 25）
            <input value={sessionText} onChange={(e) => setSessionText(e.target.value)} placeholder="例如：25" inputMode="numeric" />
          </label>
          {rhythm?.parsed && (
            <p>
              每日节奏：共 {rhythm.parsed.studyDays} 个学习日（考试日当天不计）、{rhythm.parsed.totalMinutes} 分钟、约 {rhythm.parsed.totalSessions} 节。
            </p>
          )}
          {rhythm?.error && <p role="alert">{rhythm.error}</p>}
          <p>
            模考节点：{nodes.length === 0
              ? '无（考前 14 天与考前 3 天均不在今天至考试日区间内）'
              : nodes.map((n) => `${n.date} ${n.label}`).join('；')}
          </p>
          {weeks.length > 0 ? (
            <ul>
              {weeks.map((w) => (
                <li key={w.index}>
                  第 {w.index} 周 {w.startDate}～{w.endDate}（{w.stage.label}）：{w.tasks.join('、')}
                </li>
              ))}
            </ul>
          ) : (
            <p>考试已结束或就是今天，无学习周可排。</p>
          )}
          <div className="study-actions">
            <button className="study-btn alt" onClick={() => copyLocal(planText())}>复制计划文本</button>
            <button className="study-btn alt" onClick={downloadCsv}>下载 CSV</button>
          </div>
        </section>
      )}
      <p>计划为建议节奏，不承诺提分；考试日期请以学校/官方通知为准，本工具不提供官方考试日历。导出前请先复制或下载，刷新页面后清单即清空。</p>
    </ToolPage>
  );
}
