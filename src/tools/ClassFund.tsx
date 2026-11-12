/**
 * 班费账本与公示（Factory Day 7，2026-11-02）。
 * 班委收班费、记开支、月末公示总对不上账？记下每笔收支与谁交了班费，
 * 就能算出结余、欠费名单与可直接发群的公示文本。
 * 纯浏览器本地处理：名单与账本不上传、不存 localStorage，刷新即清空；
 * 本页只记账、不经手资金，收钱请自行用微信/支付宝完成并核对实际收款。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  computeDues,
  computeFundSummary,
  csvDateSuffix,
  fundStatementToText,
  fundToCsv,
  formatCents,
  parseAmountToCents,
  parseMembers,
  parseZeroOrPositiveCents,
  todayLocal,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type FundEntry,
  type FundKind,
} from './class-fund-core';

const SAMPLE_CLASS = '高数 2 班';
const SAMPLE_MEMBERS = '陈晨\n林晓\n王磊\n赵雨\n刘洋\n孙悦';
const SAMPLE_PAID = ['陈晨', '林晓', '王磊', '赵雨', '刘洋'];
const SAMPLE_ENTRIES: FundEntry[] = [
  { date: '2026-10-10', kind: 'income', category: '班费', title: '本学期班费', amountCents: 25000 },
  { date: '2026-10-15', kind: 'expense', category: '打印资料', title: '打印复习资料', amountCents: 6850 },
  { date: '2026-10-20', kind: 'expense', category: '团建活动', title: '团建零食', amountCents: 13200 },
];

export default function ClassFund() {
  const [className, setClassName] = useState('');
  const [membersText, setMembersText] = useState('');
  const [standardText, setStandardText] = useState('');
  const [paid, setPaid] = useState<string[]>([]);
  const [openingText, setOpeningText] = useState('');
  const [entries, setEntries] = useState<FundEntry[]>([]);
  const [dateText, setDateText] = useState(todayLocal());
  const [kind, setKind] = useState<FundKind>('expense');
  const [category, setCategory] = useState<string>('打印资料');
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [handler, setHandler] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const parsed = useMemo(() => {
    try {
      return { members: parseMembers(membersText), error: '' };
    } catch (e) {
      return { members: [] as string[], error: e instanceof Error ? e.message : '名单解析失败。' };
    }
  }, [membersText]);

  const paidValid = useMemo(
    () => paid.filter((n) => parsed.members.includes(n)),
    [paid, parsed.members],
  );

  const standard = useMemo(() => {
    try {
      return { cents: parseZeroOrPositiveCents(standardText), error: '' };
    } catch (e) {
      return { cents: 0, error: e instanceof Error ? e.message : '应交标准解析失败。' };
    }
  }, [standardText]);

  const opening = useMemo(() => {
    try {
      return { cents: parseZeroOrPositiveCents(openingText), error: '' };
    } catch (e) {
      return { cents: 0, error: e instanceof Error ? e.message : '期初结余解析失败。' };
    }
  }, [openingText]);

  const result = useMemo(() => {
    if (parsed.members.length === 0) return null;
    try {
      const summary = computeFundSummary(entries, opening.cents);
      const dues = computeDues(parsed.members, standard.cents, paidValid);
      return { summary, dues, error: '' };
    } catch (e) {
      return { summary: null, dues: null, error: e instanceof Error ? e.message : '汇总失败。' };
    }
  }, [parsed.members, entries, opening.cents, standard.cents, paidValid]);

  const togglePaid = (name: string) => {
    setPaid((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  };

  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const addEntry = () => {
    try {
      setError('');
      if (parsed.members.length === 0) throw new Error(parsed.error || '请先填写成员名单（至少 2 人）。');
      const amountCents = parseAmountToCents(amountText);
      const entry: FundEntry = {
        date: dateText,
        kind,
        category,
        title,
        amountCents,
        handler: handler.trim() || undefined,
        note: note.trim() || undefined,
      };
      // 校验：日期、标题、分类、金额，不通过不入账
      computeFundSummary([...entries, entry], opening.cents);
      setEntries((cur) => [...cur, entry]);
      setTitle('');
      setAmountText('');
      setHandler('');
      setNote('');
      setStatus(`已记一笔${kind === 'income' ? '收入' : '支出'}「${entry.title}」${formatCents(amountCents)}。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败，请检查输入。');
    }
  };

  const loadSample = () => {
    setClassName(SAMPLE_CLASS);
    setMembersText(SAMPLE_MEMBERS);
    setStandardText('50');
    setPaid(SAMPLE_PAID);
    setOpeningText('120');
    setEntries(SAMPLE_ENTRIES);
    setDateText(todayLocal());
    setKind('expense');
    setCategory('打印资料');
    setStatus('已填入示例账本：6 人、每人应交 ¥50.00（孙悦未交），期初 ¥120.00，收入 ¥250.00，支出 ¥200.50，结余 ¥169.50。');
    setError('');
  };

  const clearAll = () => {
    setClassName('');
    setMembersText('');
    setStandardText('');
    setPaid([]);
    setOpeningText('');
    setEntries([]);
    setTitle('');
    setAmountText('');
    setHandler('');
    setNote('');
    setStatus('');
    setError('');
  };

  const asOfDate = entries.length > 0
    ? entries.map((e) => e.date).sort().slice(-1)[0]
    : todayLocal();

  const statement = () => {
    if (!result || !result.summary || !result.dues) return '';
    return fundStatementToText({
      className: className.trim() || '我们班',
      asOfDate,
      openingCents: opening.cents,
      summary: result.summary,
      dues: result.dues,
      standardCents: standard.cents,
      membersCount: parsed.members.length,
      entries,
    });
  };

  return (
    <ToolPage
      id="class-fund"
      title="班费账本与公示"
      description="班委收班费、记开支、月末公示总对不上账？记下每笔收支与谁交了班费，就能算出结余、欠费名单与可直接发群的公示文本，全在浏览器本地算完。"
    >
      <section className="study-card">
        <h2>1 班级与成员</h2>
        <p>每行一人，也支持逗号、分号、顿号分隔。人名不得重复（班费按人名区分）；名单与账本只在当前浏览器里处理，不上传、不保存，刷新页面即清空。</p>
        <label>
          班级名
          <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="例如：高数 2 班" maxLength={30} />
        </label>
        <textarea
          aria-label="成员名单输入"
          rows={5}
          value={membersText}
          onChange={(e) => setMembersText(e.target.value)}
          placeholder={'例如：\n陈晨\n林晓\n王磊'}
        />
        <label>
          每人应交班费标准（元，不设标准请留空）
          <input value={standardText} onChange={(e) => setStandardText(e.target.value)} placeholder="例如：50" inputMode="decimal" />
        </label>
        <label>
          期初结余（元，上期剩下多少钱，不填按 0 算）
          <input value={openingText} onChange={(e) => setOpeningText(e.target.value)} placeholder="例如：120" inputMode="decimal" />
        </label>
        <div className="study-actions">
          <button className="study-btn alt" onClick={loadSample}>填入示例账本</button>
          <button className="study-btn alt" onClick={clearAll}>清空全部</button>
        </div>
        {parsed.members.length > 0
          ? <p>成员：{parsed.members.length} 人（{parsed.members.join('、')}）</p>
          : <p role="alert">{parsed.error || '请先填写成员名单。'}</p>}
        {standard.error && <p role="alert">{standard.error}</p>}
        {opening.error && <p role="alert">{opening.error}</p>}
      </section>

      {parsed.members.length > 0 && (
        <section className="study-card">
          <h2>2 谁交了班费</h2>
          <p>勾选已交的成员；没勾选的就是欠费名单。欠费只按“应交标准 × 人数”算，不把下面流水里的收入行重复计入已交，避免一笔钱算两次。</p>
          <div className="study-actions">
            {parsed.members.map((m) => (
              <label key={m}>
                <input type="checkbox" checked={paidValid.includes(m)} onChange={() => togglePaid(m)} />
                {m}
              </label>
            ))}
          </div>
          {standard.cents === 0 && !standard.error && <p>未设每人应交标准：先在上方填写标准，才能算出谁欠费。</p>}
        </section>
      )}

      <section className="study-card">
        <h2>3 记一笔流水</h2>
        <label>
          日期
          <input type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </label>
        <div className="study-actions" role="radiogroup" aria-label="收支">
          <button className={`study-btn${kind === 'income' ? '' : ' alt'}`} onClick={() => { setKind('income'); setCategory('班费'); }}>收入</button>
          <button className={`study-btn${kind === 'expense' ? '' : ' alt'}`} onClick={() => { setKind('expense'); setCategory('打印资料'); }}>支出</button>
        </div>
        <label>
          分类
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：打印复习资料、团建零食" maxLength={40} />
        </label>
        <label>
          金额（元）
          <input value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="例如：68.50" inputMode="decimal" />
        </label>
        <label>
          经手人（可选）
          <input value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="例如：王磊" maxLength={20} />
        </label>
        <label>
          备注（可选）
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：有发票" maxLength={60} />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={addEntry}>记入这笔</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
      </section>

      {entries.length > 0 && (
        <section className="study-card">
          <h2>4 已记流水（{entries.length} 笔，序时排列）</h2>
          <ul>
            {[...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((e, i) => (
              <li key={`${e.date}-${e.title}-${i}`}>
                {e.date} {e.kind === 'income' ? '收入' : '支出'} {e.category} {e.title} {formatCents(e.amountCents)}
                {e.handler ? `（经手人：${e.handler}）` : ''}
                <button className="study-btn alt" onClick={() => setEntries((cur) => cur.filter((x) => x !== e))}>删除这笔</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && result.summary && result.dues && (
        <section className="study-card">
          <h2>5 汇总与公示</h2>
          <p>期初结余 {formatCents(opening.cents)}；本期收入 {formatCents(result.summary.incomeCents)}；本期支出 {formatCents(result.summary.expenseCents)}；结余 {formatCents(result.summary.balanceCents)}</p>
          {standard.cents > 0 && (
            <p>
              应收班费 {formatCents(result.dues.expectedCents)}（{parsed.members.length} 人 × {formatCents(standard.cents)}）；
              已交 {formatCents(result.dues.collectedCents)}（{result.dues.paidCount} 人）；
              未交：{result.dues.unpaid.length === 0 ? '无' : `${result.dues.unpaid.join('、')} ${formatCents(result.dues.unpaidCents)}`}
            </p>
          )}
          {result.summary.expenseByCategory.length > 0 && (
            <p>分类支出：{result.summary.expenseByCategory.map((c) => `${c.category} ${formatCents(c.cents)}`).join('；')}</p>
          )}
          <div className="study-actions">
            <button className="study-btn alt" onClick={() => copyLocal(statement())}>复制公示文本</button>
            <button className="study-btn alt" onClick={() => saveLocal(new Blob([`\ufeff${fundToCsv(entries, result.dues!, standard.cents)}`], { type: 'text/csv;charset=utf-8' }), `novip-class-fund-${csvDateSuffix()}.csv`)}>下载 CSV</button>
          </div>
        </section>
      )}
      {result && result.error && <p role="alert">{result.error}</p>}
      <p>算账口径：全部金额按“分”整数计算，结余 = 期初结余 + 总收入 − 总支出；欠费只按应交标准算，不重复计入流水收入。本页只记账、不经手资金：已交是班委手工勾选，不是支付凭证，收钱请自行核对实际收款；公示发群前请先核对数字。</p>
    </ToolPage>
  );
}
