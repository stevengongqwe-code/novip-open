import React, {useState, useMemo} from 'react';
import {ToolPage, copyLocal} from './common';
import {
  WEIGHT_PRESETS,
  calculatePostgradScore,
  type ScoreInput,
} from './postgrad-score-core';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import './postgrad-score.css';

const TOOL_ID = 'postgrad-score';

export default function PostgradScore() {
  const [initialScore, setInitialScore] = useState<number>(365);
  const [initialMax, setInitialMax] = useState<number>(500);
  const [reExamScore, setReExamScore] = useState<string>('82');
  const [reExamMax, setReExamMax] = useState<number>(100);
  const [weightId, setWeightId] = useState<string>('50_50');
  const [targetScore, setTargetScore] = useState<string>('76');
  const [copied, setCopied] = useState<boolean>(false);

  const input: ScoreInput = useMemo(
    () => ({
      initialScore,
      initialMaxScore: initialMax,
      reExamScore: reExamScore ? parseFloat(reExamScore) : undefined,
      reExamMaxScore: reExamMax,
      weightPresetId: weightId,
      targetCompositeScore: targetScore ? parseFloat(targetScore) : undefined,
    }),
    [initialScore, initialMax, reExamScore, reExamMax, weightId, targetScore],
  );

  const result = useMemo(() => calculatePostgradScore(input), [input]);

  const handleCopySummary = async () => {
    playHoverTick(readStoredSoundEnabled());
    const text = `【NOVIP 考研初复试折算战术单】
• 初试成绩：${initialScore} / ${initialMax}（折算百分制 ${result.initialConvertedPercent} 分）
• 权重配比：${WEIGHT_PRESETS.find((w) => w.id === weightId)?.label}
• 初试贡献分：${result.initialContribution} 分
${
  result.reExamContribution
    ? `• 复试成绩：${reExamScore} / ${reExamMax}（贡献分 ${result.reExamContribution} 分）\n• 综合总成绩：${result.finalCompositeScore} 分`
    : ''
}
${
  result.reExamNeededForTarget !== undefined
    ? `• 目标综合分：${targetScore} 分 → 复试至少需要考到：${result.reExamNeededForTarget} 分`
    : ''
}
• 战术建议：${result.statusAdvice}
（免充值、无水印，考研人都在用的 NOVIP：https://novip.site/tools/postgrad-score）`;

    await copyLocal(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  return (
    <ToolPage
      id={TOOL_ID}
      title="考研初试与复试成绩折算器"
      description="按报考院校初试与复试权重（5:5、6:4、7:3等）精准计算最终综合分，并智能反推目标上岸线所需的最低复试逆袭分。"
    >
      <div className="postgrad-container">
        <section className="postgrad-form-card" aria-label="考研成绩与权重设置">
          <div className="postgrad-grid-row">
            <div className="postgrad-field">
              <label className="postgrad-label" htmlFor="initial-score-input">
                你的初试得分 (分)
              </label>
              <input
                id="initial-score-input"
                className="postgrad-input"
                type="number"
                min="0"
                max={initialMax}
                value={initialScore}
                onChange={(e) => setInitialScore(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="postgrad-field">
              <label className="postgrad-label" htmlFor="initial-max-select">
                初试总分分制
              </label>
              <select
                id="initial-max-select"
                className="postgrad-input"
                value={initialMax}
                onChange={(e) => setInitialMax(parseInt(e.target.value, 10))}
              >
                <option value={500}>500 分满分 (学硕 / 多数专硕)</option>
                <option value={300}>300 分满分 (管理类联考 MBA/MPAcc/MEM)</option>
              </select>
            </div>
          </div>

          <div className="postgrad-grid-row">
            <div className="postgrad-field">
              <label className="postgrad-label" htmlFor="weight-preset-select">
                院校录取权重配比
              </label>
              <select
                id="weight-preset-select"
                className="postgrad-input"
                value={weightId}
                onChange={(e) => setWeightId(e.target.value)}
              >
                {WEIGHT_PRESETS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="postgrad-field">
              <label className="postgrad-label" htmlFor="reexam-max-select">
                复试满分分制
              </label>
              <select
                id="reexam-max-select"
                className="postgrad-input"
                value={reExamMax}
                onChange={(e) => setReExamMax(parseInt(e.target.value, 10))}
              >
                <option value={100}>100 分满分 (百分制)</option>
                <option value={500}>500 分满分 (等额还原初试分制)</option>
                <option value={200}>200 分满分</option>
                <option value={220}>220 分满分</option>
              </select>
            </div>
          </div>

          <div className="postgrad-grid-row">
            <div className="postgrad-field">
              <label className="postgrad-label" htmlFor="reexam-score-input">
                复试得分 (可选 · 估分测算)
              </label>
              <input
                id="reexam-score-input"
                className="postgrad-input"
                type="number"
                min="0"
                max={reExamMax}
                placeholder="如 80"
                value={reExamScore}
                onChange={(e) => setReExamScore(e.target.value)}
              />
            </div>

            <div className="postgrad-field">
              <label className="postgrad-label" htmlFor="target-score-input">
                目标综合总分 (用于逆袭反推)
              </label>
              <input
                id="target-score-input"
                className="postgrad-input"
                type="number"
                min="0"
                max="100"
                placeholder="如往年录取中位线 75"
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="postgrad-results-card" aria-label="折算结果与战术建议">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <div style={{fontSize: 13, fontWeight: 600, color: '#64748b'}}>
                综合折合总成绩 (百分制)
              </div>
              <div className="postgrad-score-badge" aria-label={`综合成绩 ${result.finalCompositeScore}`}>
                {result.finalCompositeScore}
                <span style={{fontSize: 16, fontWeight: 500, color: '#64748b', marginLeft: 4}}>
                  / 100 分
                </span>
              </div>
            </div>

            <button
              type="button"
              className="button primary"
              onClick={handleCopySummary}
              style={{padding: '8px 16px', fontSize: 13}}
            >
              {copied ? '已复制战术单 ✓' : '复制分析战术单'}
            </button>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14}}>
            <div style={{padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.4)'}}>
              <div style={{fontSize: 12, color: '#64748b'}}>初试百分制转换</div>
              <div style={{fontSize: 18, fontWeight: 700}}>{result.initialConvertedPercent} 分</div>
              <div style={{fontSize: 11, color: '#64748b'}}>贡献值: {result.initialContribution} 分</div>
            </div>

            {result.reExamContribution > 0 && (
              <div style={{padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.4)'}}>
                <div style={{fontSize: 12, color: '#64748b'}}>复试百分制转换</div>
                <div style={{fontSize: 18, fontWeight: 700}}>{result.reExamConvertedPercent} 分</div>
                <div style={{fontSize: 11, color: '#64748b'}}>贡献值: {result.reExamContribution} 分</div>
              </div>
            )}

            {result.reExamNeededForTarget !== undefined && (
              <div style={{padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.4)'}}>
                <div style={{fontSize: 12, color: '#64748b'}}>目标分最低复试要求</div>
                <div style={{fontSize: 18, fontWeight: 700, color: result.isTargetReachable ? '#059669' : '#e11d48'}}>
                  {result.reExamNeededForTarget} 分
                </div>
                <div style={{fontSize: 11, color: '#64748b'}}>
                  {result.isTargetReachable ? '处于可冲刺逆袭线' : '超出满分'}
                </div>
              </div>
            )}
          </div>

          <div className="postgrad-advice-box">
            <strong>🎯 上岸战术建议：</strong> {result.statusAdvice}
          </div>
        </section>
      </div>
    </ToolPage>
  );
}
