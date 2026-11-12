import '@fontsource/noto-sans-sc/400.css';
import { useState } from 'react';
import { copyLocal } from '../tool-common';
import { ToolPage, Table, saveLocal, useJob } from './common';
import {
  AMOUNT_UNIT_LABELS,
  COMPOUND_FREQUENCY_LABELS,
  DEFAULT_INTEREST_FORM,
  DEFAULT_MORTGAGE_FORM,
  INTEREST_FORMULAS,
  INTEREST_MODE_LABELS,
  MORTGAGE_FORMULAS,
  REPAYMENT_METHOD_LABELS,
  calculateInterest,
  calculateMortgage,
  centsToAmountText,
  formatCents,
  formatPercentValue,
  formatPeriodsAsTerm,
  interestSummaryText,
  mortgageScheduleCsv,
  mortgageSummaryText,
  parseAmountToCents,
  validateInterestForm,
  validateMortgageForm,
  type AmountUnit,
  type CompoundFrequency,
  type InterestMode,
  type InterestResult,
  type MortgageFormValues,
  type MortgageResult,
} from './finance-core';
import './finance.css';

type MortgageSummaryItem = { label: string; value: string; hint?: string };
type InterestSummaryItem = { label: string; value: string };

/** 房贷结果摘要卡片（等额本金展示首月/末月月供，其余展示固定月供） */
function mortgageSummaryItems(result: MortgageResult): MortgageSummaryItem[] {
  const items: MortgageSummaryItem[] = [];
  if (result.method === 'equal-payment' && result.monthlyPaymentCents !== null) {
    items.push({ label: '每月月供', value: `${formatCents(result.monthlyPaymentCents)} 元` });
  } else {
    items.push(
      { label: '首月月供', value: `${formatCents(result.firstPaymentCents)} 元`, hint: '之后逐月递减' },
      { label: '末月月供', value: `${formatCents(result.lastPaymentCents)} 元` },
    );
    if (result.monthlyPrincipalCents !== null) {
      items.push({ label: '每月本金', value: `${formatCents(result.monthlyPrincipalCents)} 元`, hint: '最后一期按剩余本金调整' });
    }
  }
  items.push(
    { label: '总利息', value: `${formatCents(result.totalInterestCents)} 元` },
    { label: '总还款', value: `${formatCents(result.totalPaymentCents)} 元`, hint: '= 贷款金额 + 总利息' },
    { label: '利息占比', value: `${(result.interestRatio * 100).toFixed(2)}%`, hint: '总利息 ÷ 总还款' },
  );
  return items;
}

/** 利息结果摘要卡片 */
function interestSummaryItems(result: InterestResult): InterestSummaryItem[] {
  return [
    { label: '本息合计', value: `${formatCents(result.selectedTotalCents)} 元` },
    { label: '利息', value: `${formatCents(result.selectedInterestCents)} 元` },
    { label: '单利本息合计', value: `${formatCents(result.simpleTotalCents)} 元` },
    { label: '复利比单利多', value: `${formatCents(result.diffVsSimpleCents)} 元` },
    { label: '实际年化利率', value: `${formatPercentValue(result.effectiveAnnualRatePercent)}%` },
  ];
}

/** 逐月还款表（展示前 12 期；完整表通过 CSV 下载） */
function schedulePreviewRows(result: MortgageResult): (string | number)[][] {
  const rows: (string | number)[][] = [['期数', '月供（元）', '本金（元）', '利息（元）', '剩余本金（元）']];
  for (const row of result.schedule.slice(0, 12)) {
    rows.push([
      row.period,
      formatCents(row.paymentCents),
      formatCents(row.principalCents),
      formatCents(row.interestCents),
      formatCents(row.balanceCents),
    ]);
  }
  return rows;
}

function FormulaDetails({ title, formulas }: { title: string; formulas: string[] }) {
  return (
    <details className="finance-formulas">
      <summary>{title}</summary>
      <ul>
        {formulas.map((formula) => (
          <li key={formula}>{formula}</li>
        ))}
      </ul>
    </details>
  );
}

export default function Finance() {
  const job = useJob();

  const [mortgageForm, setMortgageForm] = useState<MortgageFormValues>({ ...DEFAULT_MORTGAGE_FORM });
  const [mortgage, setMortgage] = useState<MortgageResult | null>(null);
  const [mortgageMessage, setMortgageMessage] = useState('');

  const [interestForm, setInterestForm] = useState({ ...DEFAULT_INTEREST_FORM });
  const [interest, setInterest] = useState<InterestResult | null>(null);
  const [interestMessage, setInterestMessage] = useState('');

  const updateMortgage = (patch: Partial<MortgageFormValues>) => {
    setMortgageForm((current) => ({ ...current, ...patch }));
    setMortgage(null);
    setMortgageMessage('');
  };

  /** 切换元/万元时按已填金额换算，避免数字含义意外变化 */
  const switchAmountUnit = (unit: AmountUnit) => {
    setMortgage(null);
    setMortgageMessage('');
    setMortgageForm((current) => {
      if (current.amountUnit === unit) return current;
      try {
        const cents = parseAmountToCents(current.amountText, current.amountUnit);
        return { ...current, amountUnit: unit, amountText: centsToAmountText(cents, unit) };
      } catch {
        return { ...current, amountUnit: unit };
      }
    });
  };

  const updateInterest = (patch: Partial<typeof DEFAULT_INTEREST_FORM>) => {
    setInterestForm((current) => ({ ...current, ...patch }));
    setInterest(null);
    setInterestMessage('');
  };

  const runMortgage = () => {
    void job.run(
      async () => {
        const { params, errors } = validateMortgageForm(mortgageForm);
        if (!params) throw new Error(errors.join('；'));
        return calculateMortgage(params);
      },
      (result) => {
        setMortgage(result);
        setMortgageMessage('计算完成，可复制结果或下载完整还款表。');
      },
    );
  };

  const runInterest = () => {
    void job.run(
      async () => {
        const { params, errors } = validateInterestForm(interestForm);
        if (!params) throw new Error(errors.join('；'));
        return calculateInterest(params);
      },
      (result) => {
        setInterest(result);
        setInterestMessage('计算完成，可复制结果。');
      },
    );
  };

  const downloadMortgageCsv = () => {
    if (!mortgage) return;
    const csv = mortgageScheduleCsv(mortgage);
    saveLocal(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), `NOVIP-房贷还款表-${mortgage.periods}期.csv`);
    setMortgageMessage(`已生成 CSV：共 ${mortgage.schedule.length} 期逐月数据。`);
  };

  const copyMortgage = () => {
    if (!mortgage) return;
    void copyLocal(mortgageSummaryText(mortgage)).then(
      () => setMortgageMessage('已复制房贷结果文本。'),
      (error: unknown) => setMortgageMessage((error as Error).message),
    );
  };

  const copyInterest = () => {
    if (!interest) return;
    void copyLocal(interestSummaryText(interest)).then(
      () => setInterestMessage('已复制利息结果文本。'),
      (error: unknown) => setInterestMessage((error as Error).message),
    );
  };

  const resetMortgage = () => {
    job.reset();
    setMortgageForm({ ...DEFAULT_MORTGAGE_FORM });
    setMortgage(null);
    setMortgageMessage('');
  };

  const resetInterest = () => {
    job.reset();
    setInterestForm({ ...DEFAULT_INTEREST_FORM });
    setInterest(null);
    setInterestMessage('');
  };

  return (
    <ToolPage
      id="finance"
      title="房贷与利息计算器"
      description="等额本息/等额本金月供、总利息与逐月还款表，以及单利/复利估算。全部在本机计算，不联网、不上传任何数据。"
      job={job}
    >
      <div className="tool-grid">
        {/* ---------------- 房贷计算 ---------------- */}
        <section className="study-card" aria-label="房贷计算">
          <h2>
            <span className="study-step">1</span>房贷计算
          </h2>
          <div className="finance-fields">
            <label>
              贷款金额
              <span className="finance-inline">
                <input
                  aria-label="贷款金额"
                  inputMode="decimal"
                  value={mortgageForm.amountText}
                  onChange={(event) => updateMortgage({ amountText: event.target.value })}
                  placeholder="如 100"
                />
                <select
                  aria-label="金额单位"
                  value={mortgageForm.amountUnit}
                  onChange={(event) => switchAmountUnit(event.target.value as AmountUnit)}
                >
                  {(Object.keys(AMOUNT_UNIT_LABELS) as AmountUnit[]).map((unit) => (
                    <option key={unit} value={unit}>
                      {AMOUNT_UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label>
              年利率（%）
              <input
                aria-label="年利率"
                inputMode="decimal"
                value={mortgageForm.rateText}
                onChange={(event) => updateMortgage({ rateText: event.target.value })}
                placeholder="0–24，如 4.9"
              />
            </label>
            <label>
              期限（年）
              <input
                aria-label="贷款期限"
                inputMode="decimal"
                value={mortgageForm.termText}
                onChange={(event) => updateMortgage({ termText: event.target.value })}
                placeholder="1–40，支持小数"
              />
            </label>
            <label>
              还款方式
              <select
                aria-label="还款方式"
                value={mortgageForm.method}
                onChange={(event) => updateMortgage({ method: event.target.value as MortgageFormValues['method'] })}
              >
                {(Object.keys(REPAYMENT_METHOD_LABELS) as MortgageFormValues['method'][]).map((method) => (
                  <option key={method} value={method}>
                    {REPAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-wide">
              每月额外还款（元，可选）
              <input
                aria-label="每月额外还款"
                inputMode="decimal"
                value={mortgageForm.extraText}
                onChange={(event) => updateMortgage({ extraText: event.target.value })}
                placeholder="用于提前还款模拟，如 1000"
              />
            </label>
          </div>
          <p className="finance-hint">
            金额支持元/万元切换；年利率 0–24%；期限 1–40 年（可填小数，如 30.5）。额外还款会全部冲减本金，用于估算节省利息与缩短期限。
          </p>
          <div className="study-actions">
            <button className="study-btn" type="button" disabled={job.busy} onClick={runMortgage}>
              计算房贷
            </button>
            <button className="study-btn alt" type="button" disabled={job.busy} onClick={resetMortgage}>
              清空
            </button>
          </div>
        </section>

        {/* ---------------- 利息计算 ---------------- */}
        <section className="study-card" aria-label="利息计算">
          <h2>
            <span className="study-step">2</span>单利 / 复利计算
          </h2>
          <div className="finance-fields">
            <label>
              计息方式
              <select
                aria-label="计息方式"
                value={interestForm.mode}
                onChange={(event) => updateInterest({ mode: event.target.value as InterestMode })}
              >
                {(Object.keys(INTEREST_MODE_LABELS) as InterestMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {INTEREST_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              本金（元）
              <input
                aria-label="本金"
                inputMode="decimal"
                value={interestForm.principalText}
                onChange={(event) => updateInterest({ principalText: event.target.value })}
                placeholder="如 10000"
              />
            </label>
            <label>
              年利率（%）
              <input
                aria-label="利息年利率"
                inputMode="decimal"
                value={interestForm.rateText}
                onChange={(event) => updateInterest({ rateText: event.target.value })}
                placeholder="0–24，如 3"
              />
            </label>
            <label>
              年限（年）
              <input
                aria-label="利息年限"
                inputMode="decimal"
                value={interestForm.yearsText}
                onChange={(event) => updateInterest({ yearsText: event.target.value })}
                placeholder="如 3，支持小数"
              />
            </label>
            <label className="finance-wide">
              复利频率{interestForm.mode === 'simple' ? '（单利不适用）' : ''}
              <select
                aria-label="复利频率"
                value={interestForm.frequency}
                disabled={interestForm.mode === 'simple'}
                onChange={(event) => updateInterest({ frequency: event.target.value as CompoundFrequency })}
              >
                {(Object.keys(COMPOUND_FREQUENCY_LABELS) as CompoundFrequency[]).map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {COMPOUND_FREQUENCY_LABELS[frequency]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="finance-hint">同时给出单利与复利结果，方便对比差额；复利频率支持年/季/月/日。</p>
          <div className="study-actions">
            <button className="study-btn" type="button" disabled={job.busy} onClick={runInterest}>
              计算利息
            </button>
            <button className="study-btn alt" type="button" disabled={job.busy} onClick={resetInterest}>
              清空
            </button>
          </div>
        </section>
      </div>

      {/* ---------------- 房贷结果 ---------------- */}
      {mortgage && (
        <section className="study-card" aria-label="房贷计算结果">
          <h2>
            <span className="study-step">3</span>房贷结果
          </h2>
          <p className="finance-meta">
            {formatCents(mortgage.principalCents)} 元 · 年利率 {formatPercentValue(mortgage.annualRatePercent)}% ·{' '}
            {formatPercentValue(mortgage.termYears)} 年（{mortgage.periods} 期） · {REPAYMENT_METHOD_LABELS[mortgage.method]}
          </p>
          <div className="finance-summary">
            {mortgageSummaryItems(mortgage).map((item) => (
              <div className="finance-summary-item" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {item.hint && <small>{item.hint}</small>}
              </div>
            ))}
          </div>

          {mortgage.extraMonthlyCents > 0 && (
            <div className="finance-extra" role="status">
              <strong>提前还款估算：</strong>每月额外还款 {formatCents(mortgage.extraMonthlyCents)} 元，可节省利息{' '}
              {formatCents(mortgage.interestSavedCents)} 元，缩短期限 {formatPeriodsAsTerm(mortgage.monthsSaved)}（
              {mortgage.monthsSaved} 期）。
            </div>
          )}

          <h3>逐月还款表（前 12 期，完整 {mortgage.periods} 期请下载 CSV）</h3>
          <Table rows={schedulePreviewRows(mortgage)} />
          <div className="study-actions">
            <button className="study-btn" type="button" onClick={downloadMortgageCsv}>
              下载完整还款表 CSV（{mortgage.schedule.length} 期）
            </button>
            <button className="study-btn alt" type="button" onClick={copyMortgage}>
              复制结果
            </button>
          </div>
          <p role="status" className="study-message">
            {mortgageMessage}
          </p>
          <FormulaDetails title="房贷公式与舍入说明" formulas={MORTGAGE_FORMULAS} />
        </section>
      )}

      {/* ---------------- 利息结果 ---------------- */}
      {interest && (
        <section className="study-card" aria-label="利息计算结果">
          <h2>
            <span className="study-step">4</span>利息结果
          </h2>
          <p className="finance-meta">
            {formatCents(interest.principalCents)} 元 · 年利率 {formatPercentValue(interest.annualRatePercent)}% ·{' '}
            {formatPercentValue(interest.years)} 年 · {INTEREST_MODE_LABELS[interest.mode]} ·{' '}
            {interest.mode === 'simple' ? '单利不涉及复利频率' : COMPOUND_FREQUENCY_LABELS[interest.frequency]}
          </p>
          <div className="finance-summary">
            {interestSummaryItems(interest).map((item) => (
              <div className="finance-summary-item" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="study-actions">
            <button className="study-btn alt" type="button" onClick={copyInterest}>
              复制结果
            </button>
          </div>
          <p role="status" className="study-message">
            {interestMessage}
          </p>
          <FormulaDetails title="利息公式与舍入说明" formulas={INTEREST_FORMULAS} />
        </section>
      )}

      <section className="study-card">
        <h2>
          <span className="study-step">i</span>使用说明
        </h2>
        <ul className="finance-notes">
          <li>全部计算在本机完成：输入只存在于当前页面内存，刷新即清空，不发送给任何服务器。</li>
          <li>金额以「分」为单位做整数运算，每期利息四舍五入到分，最后一期本金取剩余本金，避免浮点误差累积。</li>
          <li>结果仅供估算：实际利率、手续费、保险、税费和提前还款规则以贷款合同与银行账单为准。</li>
          <li>等额本息每月月供固定；等额本金每月归还本金固定、月供逐月递减，首月最高。</li>
        </ul>
      </section>
    </ToolPage>
  );
}
