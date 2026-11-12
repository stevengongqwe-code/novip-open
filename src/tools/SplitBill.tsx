/**
 * AA 分账与聚餐结算（Factory Day 6，2026-11-01）。
 * 聚餐、宿舍拼单、社团活动多笔垫付算不清？记下谁付了多少钱、
 * 谁参与每笔，就能算出每人结余与转账清单。
 * 纯浏览器本地处理：名单与账单不上传、不存 localStorage，刷新即失；
 * 本页只算账、不经手资金，转账请自行用微信/支付宝完成。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  computeBalances,
  dateSuffix,
  expenseShares,
  formatCents,
  parseAmountToCents,
  parseMembers,
  settlementToCsv,
  settlementToText,
  settle,
  type SplitExpense,
  type SplitMode,
} from './split-bill-core';

const SAMPLE_MEMBERS = '陈晨\n林晓\n王磊\n赵雨';
const SAMPLE_EXPENSES: SplitExpense[] = [
  { title: '聚餐', payer: '王磊', amountCents: 48000, participants: ['陈晨', '林晓', '王磊', '赵雨'], mode: 'equal' },
  { title: '打车', payer: '陈晨', amountCents: 6000, participants: ['陈晨', '林晓'], mode: 'equal' },
];

const MODE_LABELS: Record<SplitMode, string> = {
  equal: '均分',
  shares: '按权重（出几份）',
  exact: '按指定金额',
};

export default function SplitBill() {
  const [membersText, setMembersText] = useState('');
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);
  const [title, setTitle] = useState('');
  const [payer, setPayer] = useState('');
  const [amountText, setAmountText] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [exact, setExact] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const parsed = useMemo(() => {
    try {
      return { members: parseMembers(membersText), error: '' };
    } catch (e) {
      return { members: [] as string[], error: e instanceof Error ? e.message : '名单解析失败。' };
    }
  }, [membersText]);

  const result = useMemo(() => {
    if (parsed.members.length === 0) return null;
    try {
      const balances = computeBalances(parsed.members, expenses);
      return { balances, transfers: settle(balances), error: '' };
    } catch (e) {
      return { balances: null, transfers: null, error: e instanceof Error ? e.message : '结算失败。' };
    }
  }, [parsed.members, expenses]);

  const toggleParticipant = (name: string) => {
    // participants 为空表示“全部成员”：此时点掉一人 = 选中除他之外的全部；
    // 已有显式选择时按常规勾选/取消勾选切换。
    if (participants.length === 0) {
      setParticipants(parsed.members.filter((n) => n !== name));
      return;
    }
    setParticipants((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  };

  const addExpense = () => {
    try {
      setError('');
      if (parsed.members.length === 0) throw new Error(parsed.error || '请先填写成员名单（至少 2 人）。');
      const amountCents = parseAmountToCents(amountText);
      const who = participants.length > 0 ? participants : parsed.members;
      const stale = who.filter((n) => !parsed.members.includes(n));
      if (stale.length > 0) throw new Error(`分摊人 ${stale.join('、')} 已不在成员名单中（名单改动后旧勾选失效），请重新勾选分摊人。`);
      if (!parsed.members.includes(payer)) throw new Error('请先在“付款人”里选一位名单中的成员。');
      const expense: SplitExpense = {
        title,
        payer,
        amountCents,
        participants: who,
        mode,
        weights: mode === 'shares' ? who.map((n) => {
          const w = parseInt(weights[n] ?? '1', 10);
          if (!Number.isInteger(w) || w <= 0) throw new Error(`「${n}」的权重必须为正整数。`);
          return w;
        }) : undefined,
        exactCents: mode === 'exact' ? who.map((n) => parseAmountToCents(exact[n] ?? '')) : undefined,
      };
      expenseShares(expense); // 校验：指定金额之和、权重合法性等，不通过不入账
      setExpenses((cur) => [...cur, expense]);
      setTitle('');
      setAmountText('');
      setStatus(`已记一笔「${expense.title}」${formatCents(amountCents)}，付款人 ${payer}。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败，请检查输入。');
    }
  };

  const loadSample = () => {
    setMembersText(SAMPLE_MEMBERS);
    setExpenses(SAMPLE_EXPENSES);
    setPayer('王磊');
    setParticipants(['陈晨', '林晓', '王磊', '赵雨']);
    setStatus('已填入示例：4 人、聚餐 ¥480.00（王磊付、4 人均分）+ 打车 ¥60.00（陈晨付、陈晨与林晓均分）。');
    setError('');
  };

  const totalCents = expenses.reduce((a, e) => a + e.amountCents, 0);

  return (
    <ToolPage
      id="split-bill"
      title="AA 分账与聚餐结算"
      description="聚餐、宿舍拼单、社团活动多笔垫付算不清？记下谁付了多少钱、谁参与每笔，就能算出每人结余与转账清单，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 成员名单</h2>
        <p>每行一人，也支持逗号、分号、顿号分隔。人名不得重复（分账按人名区分）；名单与账单只在当前浏览器里处理，不上传、不保存，刷新页面即清空。</p>
        <textarea
          aria-label="成员名单输入"
          rows={5}
          value={membersText}
          onChange={(e) => setMembersText(e.target.value)}
          placeholder={'例如：\n陈晨\n林晓\n王磊'}
        />
        <div className="study-actions">
          <button className="study-btn alt" onClick={loadSample}>填入示例账单</button>
          <button className="study-btn alt" onClick={() => { setMembersText(''); setExpenses([]); setParticipants([]); setStatus(''); setError(''); }}>清空全部</button>
        </div>
        {parsed.members.length > 0
          ? <p>成员：{parsed.members.length} 人（{parsed.members.join('、')}）</p>
          : <p role="alert">{parsed.error || '请先填写成员名单。'}</p>}
      </section>

      <section className="study-card">
        <h2>2 记一笔费用</h2>
        <label>
          费用标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：聚餐、打车、买水果" maxLength={40} />
        </label>
        <label>
          付款人
          <select value={payer} onChange={(e) => setPayer(e.target.value)}>
            <option value="">请选择付款人</option>
            {parsed.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          金额（元）
          <input value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="例如：480 或 60.50" inputMode="decimal" />
        </label>
        <p>分摊人（不勾选 = 全部成员参与；没参与这笔的人不要勾，例如没坐车的人不分打车费）：</p>
        <div className="study-actions">
          {parsed.members.map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={participants.length === 0 || participants.includes(m)}
                onChange={() => toggleParticipant(m)}
              />
              {m}
            </label>
          ))}
          {parsed.members.length === 0 && <span>先在上方填写成员名单。</span>}
        </div>
        <div className="study-actions" role="radiogroup" aria-label="分摊方式">
          {(Object.keys(MODE_LABELS) as SplitMode[]).map((m) => (
            <button key={m} className={`study-btn${mode === m ? '' : ' alt'}`} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {mode === 'shares' && (
          <p>权重为正整数：出 2 份的人填 2，出 1 份的人填 1；没填的按 1 份算。</p>
        )}
        {mode === 'exact' && (
          <p>指定金额：每人填自己应付的金额，全部加起来必须等于本笔金额，否则无法入账。</p>
        )}
        {(mode === 'shares' || mode === 'exact') && (participants.length > 0 ? participants : parsed.members).map((m) => (
          <label key={m}>
            {m}{mode === 'shares' ? '的权重' : '应付金额（元）'}
            <input
              value={mode === 'shares' ? (weights[m] ?? '1') : (exact[m] ?? '')}
              onChange={(e) => (mode === 'shares' ? setWeights((w) => ({ ...w, [m]: e.target.value })) : setExact((w) => ({ ...w, [m]: e.target.value })))}
              placeholder={mode === 'shares' ? '1' : '例如：120'}
              inputMode={mode === 'shares' ? 'numeric' : 'decimal'}
            />
          </label>
        ))}
        <div className="study-actions">
          <button className="study-btn" onClick={addExpense}>记入这笔</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
      </section>

      {expenses.length > 0 && (
        <section className="study-card">
          <h2>3 已记费用（{expenses.length} 笔，总额 {formatCents(totalCents)}）</h2>
          <ul>
            {expenses.map((e, i) => (
              <li key={i}>
                {e.title}：{e.payer} 付 {formatCents(e.amountCents)}，{MODE_LABELS[e.mode]}，分摊人 {e.participants.join('、')}
                （每人份额：{e.participants.map((p, k) => `${p} ${formatCents(expenseShares(e)[k])}`).join('；')}）
                <button className="study-btn alt" onClick={() => setExpenses((cur) => cur.filter((_, j) => j !== i))}>删除这笔</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && result.balances && (
        <section className="study-card">
          <h2>4 结算结果</h2>
          <ul>
            {result.balances.map((b) => (
              <li key={b.name}>
                {b.name}：已付 {formatCents(b.paidCents)}，应付 {formatCents(b.shareCents)}，
                {b.balanceCents > 0 ? `应收 ${formatCents(b.balanceCents)}` : b.balanceCents < 0 ? `应付 ${formatCents(-b.balanceCents)}` : '已结清'}
              </li>
            ))}
          </ul>
          <h3>转账清单（按清单转账后即结清）</h3>
          {result.transfers.length === 0
            ? <p>无需转账：每人已付与应付相等。</p>
            : (
              <ol>
                {result.transfers.map((t, i) => (
                  <li key={i}>{t.from} → {t.to} {formatCents(t.amountCents)}</li>
                ))}
              </ol>
            )}
          <div className="study-actions">
            <button className="study-btn alt" onClick={() => copyLocal(settlementToText(result.balances!, result.transfers!, expenses))}>复制结算单</button>
            <button className="study-btn alt" onClick={() => saveLocal(new Blob([`\ufeff${settlementToCsv(parsed.members, expenses, result.balances!, result.transfers!)}`], { type: 'text/csv;charset=utf-8' }), `novip-split-bill-${dateSuffix()}.csv`)}>下载 CSV</button>
          </div>
        </section>
      )}
      {result && result.error && <p role="alert">{result.error}</p>}
      <p>算账口径：全部金额按“分”整数计算，均分余数按分摊人顺序补 1 分，权重余数按精确余数从大到小补；转账清单用贪心配对，每笔至少结清一方。本页只算账、不经手资金，转账后请自行核对；多人共用一台设备记账时，名单改动会使旧费用失效，请先删改旧费用再结算。</p>
    </ToolPage>
  );
}
