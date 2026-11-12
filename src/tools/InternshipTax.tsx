/**
 * 实习劳务报酬个税计算（Factory Day 11，2026-11-06）。
 * 实习报酬到手多少、会被扣多少税？按学生实习累计预扣法与一般按次
 * 法两种口径对比算清每月预扣与到手，并估算年度汇算退补。
 * 纯浏览器本地处理：不上传、不登录、不存 localStorage，刷新即清空；
 * 累计预扣法由扣缴义务人选择适用，预扣不等于最终税负，最终以税务
 * 机关核定为准。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  calcMonthly,
  calcSettlement,
  csvDateSuffix,
  monthlyToCsv,
  monthlyToText,
  parseMonthly,
  settlementToText,
  SAMPLE_HIGH_TEXT,
  SAMPLE_SUMMER_TEXT,
  SAMPLE_XIAOZHANG_TEXT,
  type MonthlyResult,
  type SettlementResult,
} from './internship-tax-core';

function parseOptionalNum(s: string, label: string): number {
  if (s.trim() === '') return 0;
  const v = Number(s.trim());
  if (!Number.isFinite(v)) throw new Error(`${label}须为数字`);
  return v;
}

export default function InternshipTax() {
  const [monthlyText, setMonthlyText] = useState('');
  const [otherIncome, setOtherIncome] = useState('');
  const [specialDeduction, setSpecialDeduction] = useState('');
  const [specialAdditional, setSpecialAdditional] = useState('');
  const [otherDeduction, setOtherDeduction] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const computed = useMemo((): {
    monthly: MonthlyResult | null;
    monthlyError: string;
    settlement: SettlementResult | null;
    settlementError: string;
  } => {
    let monthly: MonthlyResult | null = null;
    let monthlyError = '';
    if (monthlyText.trim() !== '') {
      try {
        monthly = calcMonthly(parseMonthly(monthlyText));
      } catch (e) {
        monthlyError = e instanceof Error ? e.message : '月度数据解析失败。';
      }
    }

    let settlement: SettlementResult | null = null;
    let settlementError = '';
    if (monthly) {
      try {
        settlement = calcSettlement({
          laborGrossTotal: monthly.grossTotal,
          otherIncomeAmount: parseOptionalNum(otherIncome, '其他综合所得收入额'),
          specialDeduction: parseOptionalNum(specialDeduction, '专项扣除'),
          specialAdditionalDeduction: parseOptionalNum(specialAdditional, '专项附加扣除'),
          otherDeduction: parseOptionalNum(otherDeduction, '其他扣除'),
          withheldCumulative: monthly.cumulativeTotal,
          withheldGeneral: monthly.generalTotal,
        });
      } catch (e) {
        settlementError = e instanceof Error ? e.message : '汇算估算失败。';
      }
    }
    return { monthly, monthlyError, settlement, settlementError };
  }, [monthlyText, otherIncome, specialDeduction, specialAdditional, otherDeduction]);

  const loadSample = (text: string, note: string) => {
    setMonthlyText(text);
    setError('');
    setStatus(note);
  };

  const clearAll = () => {
    setMonthlyText('');
    setOtherIncome('');
    setSpecialDeduction('');
    setSpecialAdditional('');
    setOtherDeduction('');
    setError('');
    setStatus('');
  };

  const copyMonthly = async () => {
    if (!computed.monthly) {
      setError('请先在第 1 节填好月度实习报酬，再复制结果。');
      return;
    }
    try {
      await copyLocal(monthlyToText(computed.monthly));
      setError('');
      setStatus('逐月对比结果文本已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const copySettlement = async () => {
    if (!computed.monthly || !computed.settlement) {
      setError('请先在第 1 节填好月度实习报酬，再复制汇算估算。');
      return;
    }
    try {
      await copyLocal(settlementToText(computed.settlement, computed.monthly));
      setError('');
      setStatus('年度汇算估算文本已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const downloadCsv = () => {
    if (!computed.monthly) {
      setError('请先在第 1 节填好月度实习报酬，再下载 CSV。');
      return;
    }
    try {
      saveLocal(
        new Blob([`\ufeff${monthlyToCsv(computed.monthly)}`], { type: 'text/csv;charset=utf-8' }),
        `novip-internship-tax-${csvDateSuffix()}.csv`,
      );
      setError('');
      setStatus('已开始下载逐月对比 CSV。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const downloadJson = () => {
    if (!computed.monthly) {
      setError('请先在第 1 节填好月度实习报酬，再下载计算记录。');
      return;
    }
    try {
      saveLocal(
        new Blob(
          [
            JSON.stringify(
              { monthly: computed.monthly, settlement: computed.settlement, policy: '国家税务总局公告2018年第61号、2020年第13号；财税〔2018〕164号' },
              null,
              2,
            ),
          ],
          { type: 'application/json;charset=utf-8' },
        ),
        `novip-internship-tax-${csvDateSuffix()}.json`,
      );
      setError('');
      setStatus('已开始下载完整计算记录 JSON。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const monthly = computed.monthly;
  const settlement = computed.settlement;
  const shownError = error || computed.monthlyError || computed.settlementError;

  return (
    <ToolPage
      id="internship-tax"
      title="实习劳务报酬个税计算"
      description="实习报酬到手多少、会被扣多少税？按学生实习累计预扣法与一般按次法两种口径对比算清每月预扣与到手，并估算年度汇算退补，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 月度实习报酬（税前）</h2>
        <p>
          每行「月份 金额」，空格或逗号分隔；只填金额也可以，会按顺序编月。金额填税前报酬（扣税前的数）。累计预扣法只适用于正在接受全日制学历教育的学生因实习取得劳务报酬所得，且由扣缴义务人选择适用——不是所有实习都自动按累计法扣，先和单位确认口径再对照。
        </p>
        <label>
          月度报酬
          <textarea
            value={monthlyText}
            onChange={(e) => setMonthlyText(e.target.value)}
            placeholder={'例如：\n8月 8000\n9月 8000'}
            rows={6}
          />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={() => loadSample(SAMPLE_XIAOZHANG_TEXT, '已填入官方示例：8 月实习 8000 元，累计法只预扣 42 元，一般法预扣 1280 元。')}>
            填入示例：8月 8000
          </button>
          <button className="study-btn alt" onClick={() => loadSample(SAMPLE_SUMMER_TEXT, '已填入暑期示例：7–9 月每月 8000 元。')}>
            填入示例：暑期 3 个月
          </button>
          <button className="study-btn alt" onClick={() => loadSample(SAMPLE_HIGH_TEXT, '已填入高报酬示例：7–8 月每月 50000 元。')}>
            填入示例：50000 × 2 个月
          </button>
          <button className="study-btn alt" onClick={clearAll}>
            清空
          </button>
        </div>
        {computed.monthlyError && <p role="alert">{computed.monthlyError}</p>}
      </section>

      {monthly && (
        <section className="study-card">
          <h2>2 逐月对比：累计预扣法 vs 一般按次法</h2>
          <p>
            共 {monthly.count} 个月；税前合计 {monthly.grossTotal.toFixed(2)} 元。累计法预扣合计{' '}
            <strong>{monthly.cumulativeTotal.toFixed(2)} 元</strong>，到手合计 {monthly.cumulativeNetTotal.toFixed(2)} 元；一般法预扣合计{' '}
            {monthly.generalTotal.toFixed(2)} 元，到手合计 {monthly.generalNetTotal.toFixed(2)} 元；累计法比一般法少扣{' '}
            <strong>{monthly.savedTotal.toFixed(2)} 元</strong>。
          </p>
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>税前（元）</th>
                <th>累计法预扣（元）</th>
                <th>累计法到手（元）</th>
                <th>一般法预扣（元）</th>
                <th>一般法到手（元）</th>
                <th>少扣（元）</th>
              </tr>
            </thead>
            <tbody>
              {monthly.rows.map((r, i) => (
                <tr key={`${r.label}-${i}`}>
                  <td>{r.label}</td>
                  <td>{r.gross.toFixed(2)}</td>
                  <td>{r.cumulativeTax.toFixed(2)}</td>
                  <td>{r.cumulativeNet.toFixed(2)}</td>
                  <td>{r.generalTax.toFixed(2)}</td>
                  <td>{r.generalNet.toFixed(2)}</td>
                  <td>{r.saved.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            口径说明：累计法按"累计收入 × 80% − 5000 元/月 × 实习月份数"算累计应纳税所得额，再按工资薪金七级预扣率表计税；一般法按"每次收入 ≤4000
            减 800、&gt;4000 减 20%"算收入额，再按 20%/30%/40% 三级预扣率计税（同一项目连续性收入以一个月内取得的收入为一次）。专项扣除与专项附加扣除在预扣环节暂不扣除。
          </p>
          <div className="study-actions">
            <button className="study-btn" onClick={copyMonthly}>
              复制对比结果
            </button>
            <button className="study-btn alt" onClick={downloadCsv}>
              下载对比 CSV
            </button>
            <button className="study-btn alt" onClick={downloadJson}>
              下载计算记录 JSON
            </button>
          </div>
        </section>
      )}

      <section className="study-card">
        <h2>3 年度汇算估算（可选填）</h2>
        <p>
          劳务报酬属于综合所得，次年 3 月 1 日–6 月 30 日汇算清缴，多退少补。下面按你填的扣除估算全年应纳税额与应退/应补；不填默认为 0。工资薪金收入额按收入全额填，劳务报酬已按
          80% 计入，不用重复填。
        </p>
        <label>
          其他综合所得收入额（元，可不填）
          <input value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} placeholder="例如：0" inputMode="decimal" />
        </label>
        <label>
          专项扣除（元，可不填）
          <input value={specialDeduction} onChange={(e) => setSpecialDeduction(e.target.value)} placeholder="例如：0" inputMode="decimal" />
        </label>
        <label>
          专项附加扣除（元，可不填）
          <input value={specialAdditional} onChange={(e) => setSpecialAdditional(e.target.value)} placeholder="例如：0" inputMode="decimal" />
        </label>
        <label>
          依法确定的其他扣除（元，可不填）
          <input value={otherDeduction} onChange={(e) => setOtherDeduction(e.target.value)} placeholder="例如：0" inputMode="decimal" />
        </label>
        {settlement && monthly && (
          <div>
            <p>
              全年收入额：{settlement.totalIncomeAmount.toFixed(2)} 元；全年应纳税所得额：
              {settlement.taxable.toFixed(2)} 元（已减 60000 元基本减除费用及所填扣除）；全年应纳税额：
              <strong>{settlement.annualTax.toFixed(2)} 元</strong>
            </p>
            <p>
              按累计法已预扣 {monthly.cumulativeTotal.toFixed(2)} 元，
              {settlement.refundCumulative >= 0 ? (
                <>
                  应退 <strong>{settlement.refundCumulative.toFixed(2)} 元</strong>
                </>
              ) : (
                <>
                  应补 <strong>{(-settlement.refundCumulative).toFixed(2)} 元</strong>
                </>
              )}
              ；按一般法已预扣 {monthly.generalTotal.toFixed(2)} 元，
              {settlement.refundGeneral >= 0 ? (
                <>
                  应退 <strong>{settlement.refundGeneral.toFixed(2)} 元</strong>
                </>
              ) : (
                <>
                  应补 <strong>{(-settlement.refundGeneral).toFixed(2)} 元</strong>
                </>
              )}
              。
            </p>
            <div className="study-actions">
              <button className="study-btn" onClick={copySettlement}>
                复制汇算估算
              </button>
            </div>
          </div>
        )}
        {computed.settlementError && <p role="alert">{computed.settlementError}</p>}
        {shownError && !computed.monthlyError && !computed.settlementError && <p role="alert">{shownError}</p>}
        {status && <p role="status">{status}</p>}
        <p>
          政策依据：国家税务总局公告 2018 年第 61 号《个人所得税扣缴申报管理办法》、2020 年第 13
          号《关于完善调整部分纳税人个人所得税预扣预缴方法的公告》、财税〔2018〕164
          号。预扣不等于最终税负；本页不含增值税及附加、社保、非居民、经营所得、稿酬与特许权使用费口径，最终以税务机关核定为准。2021
          年起符合条件者累计减除费用可自 1 月起按全年 60000 元扣除（须同时满足上年度同单位取酬且按累计法申报等条件），本工具不实现该分支。
        </p>
      </section>
    </ToolPage>
  );
}
