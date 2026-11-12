/**
 * 班费账本 · 收支分类表契约（EVERGREEN Round 93，2026-11-08）。
 * 锁定 INCOME_CATEGORIES / EXPENSE_CATEGORIES 两张下拉选项表：
 * 它们是 ClassFund.tsx 记账表单分类下拉的唯一选项来源（按收支 kind 切换），
 * 且分类字符串会原样流入汇总（分类支出）、公示文本与 CSV 分类列。
 * 只新增测试文件，不改生产代码。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  computeDues,
  computeFundSummary,
  fundStatementToText,
  fundToCsv,
  validateEntry,
  type FundEntry,
} from '../src/tools/class-fund-core';

const entry = (kind: 'income' | 'expense', category: string, cents: number): FundEntry => ({
  date: '2026-10-20',
  kind,
  category,
  title: `${category}测试`,
  amountCents: cents,
});

describe('INCOME_CATEGORIES / EXPENSE_CATEGORIES 字面值', () => {
  it('收入分类恰好 4 项且逐字锁定', () => {
    assert.deepEqual([...INCOME_CATEGORIES], ['班费', '赞助', '退款', '其他']);
  });

  it('支出分类恰好 6 项且逐字锁定', () => {
    assert.deepEqual([...EXPENSE_CATEGORIES], ['打印资料', '团建活动', '奖品', '场地', '交通', '其他']);
  });

  it('两表各项均为非空字符串、表内无重复', () => {
    for (const list of [INCOME_CATEGORIES, EXPENSE_CATEGORIES]) {
      assert.ok(list.length > 0);
      for (const c of list) assert.equal(typeof c, 'string');
      assert.ok(list.every((c) => c.trim().length > 0));
      assert.equal(new Set(list).size, list.length);
    }
  });

  it('两表末项均为“其他”（兜底分类）', () => {
    assert.equal(INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1], '其他');
    assert.equal(EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1], '其他');
  });

  it('两表唯一公共项是“其他”', () => {
    const shared = INCOME_CATEGORIES.filter((c) => (EXPENSE_CATEGORIES as readonly string[]).includes(c));
    assert.deepEqual(shared, ['其他']);
  });
});

describe('分类表与汇总/公示/CSV 的交叉契约', () => {
  // 支出每类一笔、金额递减；收入每类一笔等额——金额顺序即分类顺序。
  const entries: FundEntry[] = [
    ...EXPENSE_CATEGORIES.map((c, i) => entry('expense', c, 6000 - i * 1000)),
    ...INCOME_CATEGORIES.map((c) => entry('income', c, 10000)),
  ];

  it('支出六类全进 expenseByCategory，按金额降序且合计正确', () => {
    const s = computeFundSummary(entries, 0);
    assert.deepEqual(s.expenseByCategory, [
      { category: '打印资料', cents: 6000 },
      { category: '团建活动', cents: 5000 },
      { category: '奖品', cents: 4000 },
      { category: '场地', cents: 3000 },
      { category: '交通', cents: 2000 },
      { category: '其他', cents: 1000 },
    ]);
    assert.equal(s.expenseCents, 21000);
  });

  it('收入四类只计 incomeCents，不进 expenseByCategory', () => {
    const s = computeFundSummary(entries, 0);
    assert.equal(s.incomeCents, 40000);
    assert.equal(s.balanceCents, 19000);
    const expenseCats = s.expenseByCategory.map((c) => c.category);
    for (const c of ['班费', '赞助', '退款']) assert.ok(!expenseCats.includes(c));
  });

  it('同名“其他”收支分开计：收入进总收入、支出进分类支出', () => {
    const s = computeFundSummary([entry('income', '其他', 5000), entry('expense', '其他', 3000)], 0);
    assert.equal(s.incomeCents, 5000);
    assert.deepEqual(s.expenseByCategory, [{ category: '其他', cents: 3000 }]);
  });

  it('同一支出分类多笔累加', () => {
    const s = computeFundSummary(
      [entry('expense', '打印资料', 3000), entry('expense', '打印资料', 2000)],
      0,
    );
    assert.deepEqual(s.expenseByCategory, [{ category: '打印资料', cents: 5000 }]);
  });

  it('公示文本分类支出行按金额降序列出六类', () => {
    const s = computeFundSummary(entries, 0);
    const text = fundStatementToText({
      className: '计科1班',
      asOfDate: '2026-11-07',
      openingCents: 0,
      summary: s,
      dues: computeDues(['张三', '李四'], 0, []),
      standardCents: 0,
      membersCount: 2,
      entries,
    });
    assert.ok(
      text.includes('分类支出：打印资料 ¥60.00；团建活动 ¥50.00；奖品 ¥40.00；场地 ¥30.00；交通 ¥20.00；其他 ¥10.00'),
    );
  });

  it('公示明细每行都带出所属分类', () => {
    const s = computeFundSummary(entries, 0);
    const text = fundStatementToText({
      className: '计科1班',
      asOfDate: '2026-11-07',
      openingCents: 0,
      summary: s,
      dues: computeDues(['张三', '李四'], 0, []),
      standardCents: 0,
      membersCount: 2,
      entries,
    });
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      assert.ok(text.includes(c), `公示明细应含分类「${c}」`);
    }
    assert.ok(text.includes('2026-10-20 支出 打印资料 打印资料测试 ¥60.00'));
    assert.ok(text.includes('2026-10-20 收入 班费 班费测试 ¥100.00'));
  });

  it('CSV 分类列原样写出每一笔的分类', () => {
    const csv = fundToCsv(entries, computeDues(['张三', '李四'], 0, []), 0);
    const lines = csv.split('\n');
    assert.equal(lines[0], '"日期","收支","分类","标题","金额（元）","经手人","备注"');
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      assert.ok(lines.some((l) => l.includes(`"${c}"`)), `CSV 应含分类「${c}」`);
    }
    assert.ok(lines.some((l) => l === '"2026-10-20","支出","打印资料","打印资料测试","60.00","",""'));
  });

  it('下拉任一选项都能通过 validateEntry 入账', () => {
    for (const c of INCOME_CATEGORIES) validateEntry(entry('income', c, 1000));
    for (const c of EXPENSE_CATEGORIES) validateEntry(entry('expense', c, 1000));
  });
});
