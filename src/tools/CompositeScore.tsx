/**
 * 综合测评计算（Factory Day 10，2026-11-05）。
 * 单人：德育/智育/体育按可调权重加权＋附加分封顶＋总分封顶，得总分与
 * 评奖档次；智育不会算时可用课程×学分子算；班委粘贴全班数据得并列
 * 名次、班级平均分与公示文本/CSV。
 * 纯浏览器本地处理：不上传、不登录、不存 localStorage，刷新即清空；
 * 权重、附加分上限与分档阈值各校不同，最终以学校公布结果为准。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  batchToCsv,
  batchToText,
  calcBatch,
  calcIntellectual,
  calcSingle,
  csvDateSuffix,
  parseCourses,
  singleToText,
  SAMPLE_BATCH_TEXT,
  SAMPLE_COURSES_TEXT,
  SAMPLE_SINGLE,
  type BatchResult,
  type CompositeSettings,
  type SingleResult,
} from './composite-score-core';

function parseNum(s: string, label: string): number {
  const v = Number(s.trim());
  if (s.trim() === '' || !Number.isFinite(v)) throw new Error(`${label}须为数字`);
  return v;
}

export default function CompositeScore() {
  const [wMoral, setWMoral] = useState('20');
  const [wIntellectual, setWIntellectual] = useState('70');
  const [wPhysical, setWPhysical] = useState('10');
  const [bonusCap, setBonusCap] = useState('10');
  const [capEnabled, setCapEnabled] = useState(true);
  const [totalCap, setTotalCap] = useState('100');
  const [tierFirst, setTierFirst] = useState('90');
  const [tierSecond, setTierSecond] = useState('80');
  const [tierThird, setTierThird] = useState('70');

  const [moral, setMoral] = useState('');
  const [intellectual, setIntellectual] = useState('');
  const [physical, setPhysical] = useState('');
  const [bonus, setBonus] = useState('');
  const [coursesText, setCoursesText] = useState('');
  const [batchText, setBatchText] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const computed = useMemo((): {
    settings: CompositeSettings | null;
    settingsError: string;
    single: SingleResult | null;
    singleError: string;
    batch: BatchResult | null;
    batchError: string;
  } => {
    let settings: CompositeSettings | null = null;
    let settingsError = '';
    try {
      settings = {
        weights: {
          moral: parseNum(wMoral, '德育权重'),
          intellectual: parseNum(wIntellectual, '智育权重'),
          physical: parseNum(wPhysical, '体育权重'),
        },
        bonusCap: parseNum(bonusCap, '附加分上限'),
        totalCap: capEnabled ? parseNum(totalCap, '总分上限') : null,
        tiers: {
          first: parseNum(tierFirst, '一等阈值'),
          second: parseNum(tierSecond, '二等阈值'),
          third: parseNum(tierThird, '三等阈值'),
        },
      };
      // 触发一次校验，错误进 settingsError。
      calcSingle({ moral: 0, intellectual: 0, physical: 0, bonus: 0 }, settings);
    } catch (e) {
      settings = null;
      settingsError = e instanceof Error ? e.message : '权重设置有误。';
    }

    let single: SingleResult | null = null;
    let singleError = '';
    if (settings) {
      const has = (s: string) => s.trim() !== '';
      if (has(moral) && has(intellectual) && has(physical) && has(bonus)) {
        try {
          single = calcSingle(
            {
              moral: parseNum(moral, '德育分'),
              intellectual: parseNum(intellectual, '智育分'),
              physical: parseNum(physical, '体育分'),
              bonus: parseNum(bonus, '附加分'),
            },
            settings,
          );
        } catch (e) {
          singleError = e instanceof Error ? e.message : '计算失败，请检查输入。';
        }
      }
    }

    let batch: BatchResult | null = null;
    let batchError = '';
    if (settings && batchText.trim() !== '') {
      try {
        batch = calcBatch(batchText, settings);
      } catch (e) {
        batchError = e instanceof Error ? e.message : '班级数据解析失败。';
      }
    }
    return { settings, settingsError, single, singleError, batch, batchError };
  }, [wMoral, wIntellectual, wPhysical, bonusCap, capEnabled, totalCap, tierFirst, tierSecond, tierThird, moral, intellectual, physical, bonus, batchText]);

  const loadSingleSample = () => {
    setMoral(String(SAMPLE_SINGLE.moral));
    setIntellectual(String(SAMPLE_SINGLE.intellectual));
    setPhysical(String(SAMPLE_SINGLE.physical));
    setBonus(String(SAMPLE_SINGLE.bonus));
    setError('');
    setStatus('已填入示例：德育 88、智育 86、体育 92、附加分 6，默认权重下总分 93.00 分、一等。');
  };

  const loadBatchSample = () => {
    setBatchText(SAMPLE_BATCH_TEXT);
    setError('');
    setStatus('已填入 5 人班级示例，排名与公示见下方第 4 节。');
  };

  const applyCourses = () => {
    try {
      const avg = calcIntellectual(parseCourses(coursesText));
      setIntellectual(String(avg));
      setError('');
      setStatus(`智育分已算出：${avg.toFixed(2)} 分，已带回第 2 节智育栏。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '智育子算失败。');
    }
  };

  const loadCoursesSample = () => {
    setCoursesText(SAMPLE_COURSES_TEXT);
    setError('');
    setStatus('已填入智育示例课程：高数 92 分 5 学分、英语 85 分 4 学分、线代 78 分 3 学分。');
  };

  const clearSingle = () => {
    setMoral('');
    setIntellectual('');
    setPhysical('');
    setBonus('');
    setError('');
    setStatus('');
  };

  const copySingle = async () => {
    if (!computed.single || !computed.settings) {
      setError('请先在第 2 节填完 4 项成绩，再复制结果。');
      return;
    }
    try {
      await copyLocal(
        singleToText(
          {
            moral: parseNum(moral, '德育分'),
            intellectual: parseNum(intellectual, '智育分'),
            physical: parseNum(physical, '体育分'),
            bonus: parseNum(bonus, '附加分'),
          },
          computed.single,
          computed.settings,
        ),
      );
      setError('');
      setStatus('单人结果文本已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const copyBatch = async () => {
    if (!computed.batch) {
      setError('请先在第 4 节粘贴班级数据，再复制公示文本。');
      return;
    }
    try {
      await copyLocal(batchToText(computed.batch));
      setError('');
      setStatus('班级公示文本已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const downloadBatchCsv = () => {
    if (!computed.batch) {
      setError('请先在第 4 节粘贴班级数据，再下载 CSV。');
      return;
    }
    try {
      saveLocal(new Blob([`\ufeff${batchToCsv(computed.batch)}`], { type: 'text/csv;charset=utf-8' }), `novip-composite-score-${csvDateSuffix()}.csv`);
      setError('');
      setStatus('已开始下载班级排名 CSV。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const single = computed.single;
  const shownError = error || computed.settingsError || computed.singleError || computed.batchError;

  return (
    <ToolPage
      id="composite-score"
      title="综合测评计算"
      description="评奖评优前不知道综测多少分、在班里排第几？填德育、智育、体育与附加分，按可调权重算出总分与评奖档次，班委粘贴全班数据还能得并列名次与公示文本，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 权重与规则（按本校文件改）</h2>
        <p>默认权重德育 20 / 智育 70 / 体育 10、附加分上限 10 分、总分上限 100 分、分档一等 90 / 二等 80 / 三等 70。各校细则不同，改成你学校文件里的数再算；三项权重之和必须为 100，分档阈值须递减。成绩只在当前浏览器里处理，不上传、不保存，刷新页面即清空。</p>
        <label>
          德育权重（%）
          <input value={wMoral} onChange={(e) => setWMoral(e.target.value)} placeholder="例如：20" inputMode="decimal" />
        </label>
        <label>
          智育权重（%）
          <input value={wIntellectual} onChange={(e) => setWIntellectual(e.target.value)} placeholder="例如：70" inputMode="decimal" />
        </label>
        <label>
          体育权重（%）
          <input value={wPhysical} onChange={(e) => setWPhysical(e.target.value)} placeholder="例如：10" inputMode="decimal" />
        </label>
        <label>
          附加分上限（分）
          <input value={bonusCap} onChange={(e) => setBonusCap(e.target.value)} placeholder="例如：10" inputMode="decimal" />
        </label>
        <label>
          <input type="checkbox" checked={capEnabled} onChange={(e) => setCapEnabled(e.target.checked)} />
          总分封顶
        </label>
        {capEnabled && (
          <label>
            总分上限（分）
            <input value={totalCap} onChange={(e) => setTotalCap(e.target.value)} placeholder="例如：100" inputMode="decimal" />
          </label>
        )}
        <label>
          一等阈值（分）
          <input value={tierFirst} onChange={(e) => setTierFirst(e.target.value)} placeholder="例如：90" inputMode="decimal" />
        </label>
        <label>
          二等阈值（分）
          <input value={tierSecond} onChange={(e) => setTierSecond(e.target.value)} placeholder="例如：80" inputMode="decimal" />
        </label>
        <label>
          三等阈值（分）
          <input value={tierThird} onChange={(e) => setTierThird(e.target.value)} placeholder="例如：70" inputMode="decimal" />
        </label>
        {computed.settingsError && <p role="alert">{computed.settingsError}</p>}
      </section>

      <section className="study-card">
        <h2>2 单人计算</h2>
        <p>4 项都填完才出总分与档次；附加分填原始分，超出上限的部分自动不计。</p>
        <label>
          德育分（0–100）
          <input value={moral} onChange={(e) => setMoral(e.target.value)} placeholder="例如：88" inputMode="decimal" />
        </label>
        <label>
          智育分（0–100，不会算先看第 3 节）
          <input value={intellectual} onChange={(e) => setIntellectual(e.target.value)} placeholder="例如：86" inputMode="decimal" />
        </label>
        <label>
          体育分（0–100）
          <input value={physical} onChange={(e) => setPhysical(e.target.value)} placeholder="例如：92" inputMode="decimal" />
        </label>
        <label>
          附加分（≥0，竞赛/荣誉等加分合计）
          <input value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="例如：6" inputMode="decimal" />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={loadSingleSample}>填入示例成绩</button>
          <button className="study-btn alt" onClick={clearSingle}>清空</button>
        </div>
        {single && (
          <div>
            <p>
              加权分：{single.weighted.toFixed(2)} 分；计入附加分：{single.bonusApplied.toFixed(2)} 分；综合测评总分：
              <strong>{single.total.toFixed(2)} 分</strong>；档次：<strong>{single.tier}</strong>
            </p>
            {single.nextTierLabel !== null && single.nextTierGap !== null ? (
              <p>到{single.nextTierLabel}还差 {single.nextTierGap.toFixed(2)} 分。</p>
            ) : (
              <p>已达一等，保持就好。</p>
            )}
            <div className="study-actions">
              <button className="study-btn" onClick={copySingle}>复制结果文本</button>
            </div>
          </div>
        )}
        {computed.singleError && <p role="alert">{computed.singleError}</p>}
      </section>

      <section className="study-card">
        <h2>3 智育子算（可选）</h2>
        <p>每行「课程 成绩 学分」，空格或逗号分隔；算出的是按学分加权的智育平均分，点按钮后自动带回第 2 节智育栏。</p>
        <label>
          课程清单
          <textarea value={coursesText} onChange={(e) => setCoursesText(e.target.value)} placeholder={'例如：\n高数 92 5\n英语 85 4\n线代 78 3'} rows={4} />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={applyCourses}>算出智育分并带回</button>
          <button className="study-btn alt" onClick={loadCoursesSample}>填入示例课程</button>
        </div>
      </section>

      <section className="study-card">
        <h2>4 班级排名（班委模式）</h2>
        <p>每行「姓名 德育 智育 体育 附加分」，空格或逗号分隔；总分相同共享名次（1, 1, 3），下一名次顺延。名单只在当前页面内存里，不上传、不保存。</p>
        <label>
          班级数据
          <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} placeholder={'例如：\n陈晨 90 92 88 5\n林晓 88 86 92 6'} rows={6} />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={loadBatchSample}>填入 5 人班级示例</button>
          <button className="study-btn alt" onClick={() => setBatchText('')}>清空班级数据</button>
        </div>
        {computed.batch && (
          <div>
            <p>
              共 {computed.batch.count} 人；班级平均分 {computed.batch.average.toFixed(2)} 分；最高 {computed.batch.max.toFixed(2)} 分；最低{' '}
              {computed.batch.min.toFixed(2)} 分
            </p>
            <table>
              <thead>
                <tr>
                  <th>名次</th>
                  <th>姓名</th>
                  <th>总分</th>
                  <th>档次</th>
                </tr>
              </thead>
              <tbody>
                {computed.batch.rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`}>
                    <td>{r.rank}</td>
                    <td>{r.name}</td>
                    <td>{r.result.total.toFixed(2)} 分</td>
                    <td>{r.result.tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="study-actions">
              <button className="study-btn" onClick={copyBatch}>复制公示文本</button>
              <button className="study-btn alt" onClick={downloadBatchCsv}>下载排名 CSV</button>
            </div>
          </div>
        )}
        {computed.batchError && <p role="alert">{computed.batchError}</p>}
        {shownError && !computed.settingsError && !computed.singleError && !computed.batchError && <p role="alert">{shownError}</p>}
        {status && <p role="status">{status}</p>}
        <p>权重、附加分上限与分档阈值各校不同，最终以学校公布结果为准；本页结果仅供自查与公示草稿使用。</p>
      </section>
    </ToolPage>
  );
}
