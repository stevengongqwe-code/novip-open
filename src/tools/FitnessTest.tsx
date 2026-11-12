/**
 * 体测成绩计算（Factory Day 9，2026-11-04）。
 * 体测 7 项成绩一次填完，按《国家学生体质健康标准（2014年修订）》
 * 大学组评分表算出每项单项分、加权标准分、附加分、学年总分与等级，
 * 并告诉你最弱项和到下一等级还差多少。
 * 纯浏览器本地处理：不上传、不登录、不存 localStorage，刷新即清空；
 * 各校执行细则可能有差异，最终以学校/体育部公布结果为准。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  calcFitness,
  csvDateSuffix,
  formatRunTime,
  parseCount,
  parsePositive,
  parseSigned,
  parseTimeSeconds,
  resultToCsv,
  resultToText,
  runLabel,
  strengthLabel,
  GRADE_GROUP_LABEL,
  SAMPLE_INPUT,
  type FitnessResult,
  type Gender,
  type GradeGroup,
} from './fitness-test-core';

export default function FitnessTest() {
  const [gender, setGender] = useState<Gender>('male');
  const [group, setGroup] = useState<GradeGroup>('lower');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bmiDirect, setBmiDirect] = useState('');
  const [lung, setLung] = useState('');
  const [sprint, setSprint] = useState('');
  const [sitReach, setSitReach] = useState('');
  const [jump, setJump] = useState('');
  const [strength, setStrength] = useState('');
  const [run, setRun] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const computed = useMemo((): { result: FitnessResult | null; error: string } => {
    try {
      const input: Parameters<typeof calcFitness>[0] = { gender, group };
      const has = (s: string) => s.trim() !== '';
      if (has(bmiDirect)) {
        input.bmi = parsePositive(bmiDirect, '直接 BMI');
      } else if (has(height) || has(weight)) {
        input.heightCm = parsePositive(height, '身高');
        input.weightKg = parsePositive(weight, '体重');
      }
      if (has(lung)) input.lung = parsePositive(lung, '肺活量');
      if (has(sprint)) input.sprint50 = parsePositive(sprint, '50 米跑');
      if (has(sitReach)) input.sitReach = parseSigned(sitReach, '坐位体前屈');
      if (has(jump)) input.jump = parsePositive(jump, '立定跳远');
      if (has(strength)) input.strength = parseCount(strength, strengthLabel(gender));
      if (has(run)) input.runSeconds = parseTimeSeconds(run, runLabel(gender));
      const result = calcFitness(input);
      if (result.filledCount === 0) return { result: null, error: '' };
      return { result, error: '' };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : '计算失败，请检查输入。' };
    }
  }, [gender, group, height, weight, bmiDirect, lung, sprint, sitReach, jump, strength, run]);

  const loadSample = () => {
    setGender(SAMPLE_INPUT.gender);
    setGroup(SAMPLE_INPUT.group);
    setHeight(String(SAMPLE_INPUT.heightCm ?? ''));
    setWeight(String(SAMPLE_INPUT.weightKg ?? ''));
    setBmiDirect('');
    setLung(String(SAMPLE_INPUT.lung ?? ''));
    setSprint(String(SAMPLE_INPUT.sprint50 ?? ''));
    setSitReach(String(SAMPLE_INPUT.sitReach ?? ''));
    setJump(String(SAMPLE_INPUT.jump ?? ''));
    setStrength(String(SAMPLE_INPUT.strength ?? ''));
    setRun(SAMPLE_INPUT.runSeconds !== undefined ? formatRunTime(SAMPLE_INPUT.runSeconds) : '');
    setError('');
    setStatus('已填入示例成绩：男生大一/大二，BMI 100 分档、其余 6 项 80 分档，总分 83.0 分、良好。换成你自己的成绩即可重算。');
  };

  const clearAll = () => {
    setHeight('');
    setWeight('');
    setBmiDirect('');
    setLung('');
    setSprint('');
    setSitReach('');
    setJump('');
    setStrength('');
    setRun('');
    setError('');
    setStatus('');
  };

  const copyResult = async () => {
    if (!computed.result) {
      setError('请先填写至少一项成绩，再复制结果。');
      return;
    }
    try {
      await copyLocal(resultToText(computed.result, gender, group));
      setError('');
      setStatus('结果文本已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const downloadCsv = () => {
    if (!computed.result) {
      setError('请先填写至少一项成绩，再下载 CSV。');
      return;
    }
    try {
      const csv = resultToCsv(computed.result, gender, group);
      saveLocal(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `novip-fitness-test-${csvDateSuffix()}.csv`);
      setError('');
      setStatus('已开始下载体测成绩 CSV。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const result = computed.result;
  const shownError = error || computed.error;

  return (
    <ToolPage
      id="fitness-test"
      title="体测成绩计算"
      description="体测 7 项成绩一次填完，按国家学生体质健康标准大学组评分表算出单项分、总分与等级，并告诉你最弱项和到下一等级还差多少，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 选性别与年级组</h2>
        <p>评分表按性别与年级组区分：大学分大一/大二组与大三/大四组。成绩只在当前浏览器里处理，不上传、不保存，刷新页面即清空。</p>
        <label>
          性别
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </label>
        <label>
          年级组
          <select value={group} onChange={(e) => setGroup(e.target.value as GradeGroup)}>
            <option value="lower">{GRADE_GROUP_LABEL.lower}</option>
            <option value="upper">{GRADE_GROUP_LABEL.upper}</option>
          </select>
        </label>
      </section>

      <section className="study-card">
        <h2>2 填 7 项成绩</h2>
        <p>只填已知的项也能算（会明示为部分成绩）；填完 7 项才给正式总分与等级。长跑可填“分&apos;秒&quot;”（如 3&apos;45&quot;）或纯秒（如 225）。</p>
        <label>
          身高（厘米）
          <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="例如：175" inputMode="decimal" />
        </label>
        <label>
          体重（千克）
          <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="例如：68" inputMode="decimal" />
        </label>
        <label>
          或直接填 BMI（填了这项就不用填身高体重）
          <input value={bmiDirect} onChange={(e) => setBmiDirect(e.target.value)} placeholder="例如：22.2" inputMode="decimal" />
        </label>
        <label>
          肺活量（毫升）
          <input value={lung} onChange={(e) => setLung(e.target.value)} placeholder="例如：4300" inputMode="numeric" />
        </label>
        <label>
          50 米跑（秒）
          <input value={sprint} onChange={(e) => setSprint(e.target.value)} placeholder="例如：7.1" inputMode="decimal" />
        </label>
        <label>
          坐位体前屈（厘米，可为负数）
          <input value={sitReach} onChange={(e) => setSitReach(e.target.value)} placeholder="例如：17.7" inputMode="decimal" />
        </label>
        <label>
          立定跳远（厘米）
          <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="例如：248" inputMode="numeric" />
        </label>
        <label>
          {strengthLabel(gender)}（次）
          <input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder={gender === 'male' ? '例如：15' : '例如：46'} inputMode="numeric" />
        </label>
        <label>
          {runLabel(gender)}（分&apos;秒&quot; 或纯秒）
          <input value={run} onChange={(e) => setRun(e.target.value)} placeholder={gender === 'male' ? "例如：3'42\"" : "例如：3'44\""} />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={loadSample}>填入示例成绩</button>
          <button className="study-btn alt" onClick={clearAll}>清空</button>
        </div>
        {shownError && <p role="alert">{shownError}</p>}
      </section>

      {result && (
        <section className="study-card">
          <h2>3 成绩结果</h2>
          {result.partial && <p>注意：只填了 {result.filledCount}/7 项，总分为部分成绩、仅供参考；填完 7 项才给正式总分与等级。</p>}
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th>实测值</th>
                <th>单项分</th>
                <th>权重</th>
                <th>贡献</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it) => (
                <tr key={it.key}>
                  <td>{it.label}</td>
                  <td>{it.display}</td>
                  <td>{it.score} 分</td>
                  <td>{it.weight}%</td>
                  <td>{it.contribution.toFixed(1)} 分</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            标准分：{result.standardScore.toFixed(1)} 分；附加分：{result.bonus} 分；学年总分：
            <strong>{result.total.toFixed(1)} 分</strong>；等级：<strong>{result.grade}</strong>
          </p>
          {result.weakest && <p>最弱项：{result.weakest.label}（贡献 {result.weakest.contribution.toFixed(1)} 分），先补这一项提分最快。</p>}
          {result.nextGradeGap !== null && <p>到{result.nextGradeLabel}还差 {result.nextGradeGap.toFixed(1)} 分（按当前附加分不变）。</p>}
          {result.nextGradeGap === null && !result.partial && <p>已达优秀，保持就好。</p>}
          <p>依据：《国家学生体质健康标准（2014年修订）》大学组；各校执行细则可能有差异，最终以学校/体育部公布结果为准。</p>
          <div className="study-actions">
            <button className="study-btn" onClick={copyResult}>复制结果文本</button>
            <button className="study-btn alt" onClick={downloadCsv}>下载 CSV</button>
          </div>
          {status && <p role="status">{status}</p>}
        </section>
      )}
    </ToolPage>
  );
}
