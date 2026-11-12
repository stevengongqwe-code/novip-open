/**
 * 生源地信用助学贷款还款计算（Factory Day 12，2026-11-07）。
 * 贷了助学贷款，毕业后每年 12 月 20 日到底要还多少钱？按国开行生源
 * 地口径算出逐年还款计划：毕业当年 111 天利息、5 年宽限期只还息、
 * 之后每年还本加利息、最后一年 9 月 20 日结清。
 * 纯浏览器本地处理：不上传、不登录、不存 localStorage，刷新即清空；
 * 本计算为估算，利率每年重定价、每年应还本金以合同约定为准，最终
 * 以学生在线系统/国家助学贷款 APP 查询的当期额度为准。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  calcPlan,
  csvDateSuffix,
  DEFAULT_ANNUAL_RATE_PERCENT,
  GRADUATION_YEAR_DAYS,
  MAX_LOANS,
  planToCsv,
  planToText,
  SAMPLE_SINGLE_20000,
  SAMPLE_SINGLE_8000,
  type LoanPlan,
  type PlanInput,
} from './student-loan-core';

interface LoanRowState {
  amount: string;
  term: string;
}

function parseIntField(s: string, label: string): number {
  const v = Number(s.trim());
  if (s.trim() === '' || !Number.isFinite(v)) throw new Error(`${label}须为数字`);
  return v;
}

function parseRate(s: string): number {
  const v = Number(s.trim());
  if (s.trim() === '' || !Number.isFinite(v)) throw new Error('年利率须为数字');
  return v;
}

export default function StudentLoan() {
  const [enrollYear, setEnrollYear] = useState('2025');
  const [studyYears, setStudyYears] = useState('4');
  const [rate, setRate] = useState(String(DEFAULT_ANNUAL_RATE_PERCENT));
  const [loans, setLoans] = useState<LoanRowState[]>([{ amount: '8000', term: '17' }]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const computed = useMemo((): { plan: LoanPlan | null; input: PlanInput | null; error: string } => {
    try {
      const input: PlanInput = {
        enrollYear: parseIntField(enrollYear, '入学年份'),
        studyYears: parseIntField(studyYears, '学制'),
        annualRatePercent: parseRate(rate),
        loans: loans.map((l) => ({
          amountYuan: parseIntField(l.amount, '贷款本金'),
          termYears: parseIntField(l.term, '贷款期限'),
        })),
      };
      return { plan: calcPlan(input), input, error: '' };
    } catch (e) {
      return { plan: null, input: null, error: e instanceof Error ? e.message : '计算失败。' };
    }
  }, [enrollYear, studyYears, rate, loans]);

  const loadSample = (sample: PlanInput, note: string) => {
    setEnrollYear(String(sample.enrollYear));
    setStudyYears(String(sample.studyYears));
    setRate(String(sample.annualRatePercent));
    setLoans(sample.loans.map((l) => ({ amount: String(l.amountYuan), term: String(l.termYears) })));
    setError('');
    setStatus(note);
  };

  const updateLoan = (idx: number, patch: Partial<LoanRowState>) => {
    setLoans((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLoan = () => {
    if (loans.length >= MAX_LOANS) {
      setError(`一次最多算 ${MAX_LOANS} 笔贷款。`);
      return;
    }
    setLoans((prev) => [...prev, { amount: '8000', term: '17' }]);
    setError('');
  };

  const removeLoan = (idx: number) => {
    if (loans.length <= 1) {
      setError('请至少保留一笔贷款。');
      return;
    }
    setLoans((prev) => prev.filter((_, i) => i !== idx));
    setError('');
  };

  const clearAll = () => {
    setEnrollYear('2025');
    setStudyYears('4');
    setRate(String(DEFAULT_ANNUAL_RATE_PERCENT));
    setLoans([{ amount: '8000', term: '17' }]);
    setError('');
    setStatus('');
  };

  const copyResult = async () => {
    if (!computed.plan || !computed.input) {
      setError('请先在第 1 节填好贷款信息，再复制结果。');
      return;
    }
    try {
      await copyLocal(planToText(computed.plan, computed.input));
      setError('');
      setStatus('还款计划文本已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const downloadCsv = () => {
    if (!computed.plan) {
      setError('请先在第 1 节填好贷款信息，再下载 CSV。');
      return;
    }
    try {
      saveLocal(
        new Blob([`\ufeff${planToCsv(computed.plan)}`], { type: 'text/csv;charset=utf-8' }),
        `novip-student-loan-${csvDateSuffix()}.csv`,
      );
      setError('');
      setStatus('已开始下载还款计划 CSV。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const downloadJson = () => {
    if (!computed.plan || !computed.input) {
      setError('请先在第 1 节填好贷款信息，再下载计算记录。');
      return;
    }
    try {
      saveLocal(
        new Blob(
          [
            JSON.stringify(
              {
                plan: computed.plan,
                input: computed.input,
                policy: '国开行生源地信用助学贷款 2025 版申请还款指南；LPR5Y 3.50%（2026-10-20 期）− 70bp；银发[2005]129 号（日利率 = 年利率 ÷ 360）',
              },
              null,
              2,
            ),
          ],
          { type: 'application/json;charset=utf-8' },
        ),
        `novip-student-loan-${csvDateSuffix()}.json`,
      );
      setError('');
      setStatus('已开始下载完整计算记录 JSON。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const plan = computed.plan;
  const shownError = error || computed.error;

  return (
    <ToolPage
      id="student-loan"
      title="生源地助学贷款还款计算"
      description="贷了助学贷款，毕业后每年 12 月 20 日到底要还多少钱？按国开行生源地口径算出逐年还款计划：毕业当年 111 天利息、5 年宽限期只还息、之后每年还本加利息、最后一年 9 月 20 日结清，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 贷款信息</h2>
        <p>
          一笔贷款就是一份《借款合同》。每年都贷的同学请用「再加一笔」分笔填写（每笔只需金额和期限），本页会按还款日合并逐年合计。每笔每年最高
          20000 元（本科）/ 25000 元（研究生）、不低于 1000 元；贷款期限最长为剩余学制加 15 年、最长不超过 22 年。
        </p>
        <label>
          入学年份
          <input value={enrollYear} onChange={(e) => setEnrollYear(e.target.value)} placeholder="例如：2025" inputMode="numeric" />
        </label>
        <label>
          学制（年）
          <input value={studyYears} onChange={(e) => setStudyYears(e.target.value)} placeholder="例如：4" inputMode="numeric" />
        </label>
        <label>
          年利率（%，默认 2.80 = LPR5Y 3.50% − 70 个基点）
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="例如：2.8" inputMode="decimal" />
        </label>
        {loans.map((loan, i) => (
          <div key={i}>
            <label>
              第 {i + 1} 笔贷款本金（元）
              <input
                value={loan.amount}
                onChange={(e) => updateLoan(i, { amount: e.target.value })}
                placeholder="例如：8000"
                inputMode="decimal"
              />
            </label>
            <label>
              第 {i + 1} 笔贷款期限（年）
              <input
                value={loan.term}
                onChange={(e) => updateLoan(i, { term: e.target.value })}
                placeholder="例如：17"
                inputMode="numeric"
              />
            </label>
            {loans.length > 1 && (
              <div className="study-actions">
                <button className="study-btn alt" onClick={() => removeLoan(i)}>
                  删除第 {i + 1} 笔
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="study-actions">
          <button
            className="study-btn"
            onClick={() => loadSample(SAMPLE_SINGLE_8000, '已填入官方示例结构：2025 年入学、4 年制、贷款 8000 元、期限 17 年，毕业当年只还 69.07 元利息。')}
          >
            填入示例：2025 年入学、贷款 8000 元、17 年期
          </button>
          <button
            className="study-btn alt"
            onClick={() => loadSample(SAMPLE_SINGLE_20000, '已填入示例：2025 年入学、4 年制、贷款 20000 元（本科年上限）、期限 17 年。')}
          >
            填入示例：2025 年入学、贷款 20000 元、17 年期
          </button>
          <button className="study-btn alt" onClick={addLoan}>
            再加一笔贷款
          </button>
          <button className="study-btn alt" onClick={clearAll}>
            清空
          </button>
        </div>
        {computed.error && <p role="alert">{computed.error}</p>}
      </section>

      {plan && computed.input && (
        <section className="study-card">
          <h2>2 逐年还款计划</h2>
          <p>
            共 {plan.loanCount} 笔贷款；本金合计 <strong>{plan.totalPrincipal.toFixed(2)} 元</strong>；入学 {computed.input.enrollYear} 年、学制{' '}
            {computed.input.studyYears} 年、毕业 {plan.gradYear} 年；年利率 {computed.input.annualRatePercent.toFixed(2)}%。
            在校期间（{computed.input.enrollYear}–{plan.gradYear} 年）利息由财政全额补贴，你无需偿还本金与利息。第一笔还款日{' '}
            {plan.firstPayDate}，{plan.maturityYear} 年 9 月 20 日还清。
          </p>
          <p>
            总利息 <strong>{plan.totalInterest.toFixed(2)} 元</strong>；总还款{' '}
            <strong>{plan.totalDue.toFixed(2)} 元</strong>。
          </p>
          <table>
            <thead>
              <tr>
                <th>还款日</th>
                <th>阶段</th>
                <th>计息天数</th>
                <th>本金（元）</th>
                <th>利息（元）</th>
                <th>应还（元）</th>
                <th>剩余本金（元）</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.payDate}>
                  <td>{r.payDate}</td>
                  <td>{r.stageLabel}</td>
                  <td>{r.days === null ? '整年' : `${r.days} 天`}</td>
                  <td>{r.principal.toFixed(2)}</td>
                  <td>{r.interest.toFixed(2)}</td>
                  <td>{r.due.toFixed(2)}</td>
                  <td>{r.remaining.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            口径说明：毕业当年只还 9 月 1 日–12 月 20 日 {GRADUATION_YEAR_DAYS}{' '}
            天的利息；宽限期每年 12 月 20 日只还利息；还本期每年 12 月 20 日还一年本金 + 利息（本金按等额本金分摊，最后一次为余数）；到期年 9 月 20
            日还剩余本金 + 零头天数利息。完整年度利息 = 剩余本金 × 年利率；零头天数利息 = 剩余本金 × 年利率 × 天数 ÷ 360（银发[2005]129
            号：日利率 = 年利率 ÷ 360）。
          </p>
          <div className="study-actions">
            <button className="study-btn" onClick={copyResult}>
              复制还款计划
            </button>
            <button className="study-btn alt" onClick={downloadCsv}>
              下载计划 CSV
            </button>
            <button className="study-btn alt" onClick={downloadJson}>
              下载计算记录 JSON
            </button>
          </div>
        </section>
      )}

      <section className="study-card">
        <h2>3 关键提醒</h2>
        <p>
          还款日前 5 个自然日内，把应还金额足额存入合同约定的代理结算机构指定账户（或通过学生在线系统、国家助学贷款 APP、云闪付、代理结算机构
          APP 主动还款）。每年 12 月 20 日是固定还款日，最后一年是 9 月 20 日。
        </p>
        <p>
          提前还款：每年 1 月 15 日、7 月 15 日为固定提前还款日，提前偿还的本金须是 500 元的整数倍或一次性还清（2025
          年国开行上线随时还款功能，具体以学生在线系统显示为准）；提前还款后剩余还款计划会变化，请以系统重算的当期额度为准，本页不重算提前还款后的计划。
        </p>
        <p>
          逾期：未按合同约定期限足额归还本息即视为逾期，逾期本金按合同借款利率的 130% 计收罚息，且不良记录将保留至不良行为或事件终止之日起 5
          年。毕业后继续攻读学位的，应在毕业当年 7 月 31 日前向县级学生资助管理部门提出申请并提供书面证明，审核通过后可继续享受贴息。
        </p>
        <p>
          校园地国家助学贷款还款规则与生源地相同（同为 5 年宽限期、LPR−70bp、最长 22 年），可同样参考。2025
          年国家助学贷款免息及本金延期偿还为阶段性政策，2026 年是否延续以当年通知为准，本页不代入计算。
        </p>
        {shownError && !computed.error && <p role="alert">{shownError}</p>}
        {status && <p role="status">{status}</p>}
        <p>
          政策依据：国家开发银行生源地信用助学贷款 2025 版申请还款指南折页；财政部、教育部、人民银行、银保监会《关于进一步完善国家助学贷款政策的通知》；2024
          年 11 月四部门调整通知（额度 20000/25000 元、利率 LPR−70bp）；《中国人民银行关于人民币存贷款计结息问题的通知》（银发[2005]129
          号）。本页计算为估算：年利率每年 12 月 21 日随 LPR5Y 重定价，每年应还本金以合同约定为准，最终以学生在线系统（sls.cdb.com.cn）或国家助学贷款
          APP 查询的当期额度为准。
        </p>
      </section>
    </ToolPage>
  );
}
