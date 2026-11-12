/**
 * AA 分账与聚餐结算 · 核心单测（Factory Day 6，2026-11-01）。
 * 覆盖金额解析、名单校验、均分/权重/指定金额余数规则、多笔余额、
 * 转账清单与导出；全部断言整数分总和恒等，不做浮点分布断言。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tools, currentPage } from '../src/tools/registry';
import { pageSeo, toolNotes } from '../src/seo';
import {
  allocateByShares,
  allocateEqual,
  allocateExact,
  computeBalances,
  expenseShares,
  formatCents,
  parseAmountToCents,
  parseMembers,
  settlementToCsv,
  settlementToText,
  settle,
  type SplitExpense,
} from '../src/tools/split-bill-core';

describe('金额解析', () => {
  it('整数与 2 位小数转分', () => {
    assert.equal(parseAmountToCents('480'), 48000);
    assert.equal(parseAmountToCents('60.50'), 6050);
    assert.equal(parseAmountToCents('¥1,234.56'), 123456);
    assert.equal(parseAmountToCents('0.01'), 1);
  });
  it('非法金额一律报错', () => {
    for (const bad of ['', 'abc', '-5', '12.345', '0', '0.00', '12..5']) {
      assert.throws(() => parseAmountToCents(bad), /金额/);
    }
  });
});

describe('名单解析', () => {
  it('按换行/逗号/分号/顿号切分', () => {
    assert.deepEqual(parseMembers('陈晨\n林晓,王磊；赵雨、刘洋'), ['陈晨', '林晓', '王磊', '赵雨', '刘洋']);
  });
  it('少于 2 人或重名报错', () => {
    assert.throws(() => parseMembers('陈晨'), /至少需要 2 人/);
    assert.throws(() => parseMembers('陈晨\n林晓\n陈晨'), /人名重复/);
  });
});

describe('分摊余数规则', () => {
  it('均分：100 元 3 人 = 33.34/33.33/33.33，总和恒等', () => {
    const out = allocateEqual(10000, 3);
    assert.deepEqual(out, [3334, 3333, 3333]);
    assert.equal(out.reduce((a, b) => a + b, 0), 10000);
  });
  it('权重：101 元按 2:1 = 67.33/33.67，总和恒等', () => {
    const out = allocateByShares(10100, [2, 1]);
    assert.deepEqual(out, [6733, 3367]);
    assert.equal(out.reduce((a, b) => a + b, 0), 10100);
  });
  it('权重余数按精确余数从大到小补位', () => {
    // 100 分按 1:1:1：取整 33/33/33，余 1 分补给第 1 人
    assert.deepEqual(allocateByShares(100, [1, 1, 1]), [34, 33, 33]);
  });
  it('指定金额之和不等报错，相等通过', () => {
    assert.throws(() => allocateExact(10000, [6000, 3000]), /不等于/);
    assert.deepEqual(allocateExact(10000, [6000, 4000]), [6000, 4000]);
  });
  it('权重非法值报错', () => {
    assert.throws(() => allocateByShares(10000, [0, 1]), /权重/);
    assert.throws(() => allocateByShares(10000, [1.5, 1]), /权重/);
  });
});

describe('多笔余额与转账清单（示例账单）', () => {
  const members = ['陈晨', '林晓', '王磊', '赵雨'];
  const expenses: SplitExpense[] = [
    { title: '聚餐', payer: '王磊', amountCents: 48000, participants: members, mode: 'equal' },
    { title: '打车', payer: '陈晨', amountCents: 6000, participants: ['陈晨', '林晓'], mode: 'equal' },
  ];
  it('余额：陈晨 -90、林晓 -150、王磊 +360、赵雨 -120（元），和为 0', () => {
    const balances = computeBalances(members, expenses);
    assert.deepEqual(balances.map((b) => b.balanceCents), [-9000, -15000, 36000, -12000]);
    assert.equal(balances.reduce((a, b) => a + b.balanceCents, 0), 0);
    assert.deepEqual(balances.map((b) => b.paidCents), [6000, 0, 48000, 0]);
    assert.deepEqual(balances.map((b) => b.shareCents), [15000, 15000, 12000, 12000]);
  });
  it('转账：3 笔全部付给王磊，结清后余额为 0', () => {
    const balances = computeBalances(members, expenses);
    const transfers = settle(balances);
    assert.deepEqual(transfers, [
      { from: '林晓', to: '王磊', amountCents: 15000 },
      { from: '赵雨', to: '王磊', amountCents: 12000 },
      { from: '陈晨', to: '王磊', amountCents: 9000 },
    ]);
    const after = balances.map((b) => ({ ...b }));
    for (const t of transfers) {
      after.find((b) => b.name === t.from)!.balanceCents += t.amountCents;
      after.find((b) => b.name === t.to)!.balanceCents -= t.amountCents;
    }
    assert.ok(after.every((b) => b.balanceCents === 0));
  });
  it('付款人不在分摊人之列时仍可结算（代付场景）', () => {
    const balances = computeBalances(['甲', '乙', '丙'], [
      { title: '代付', payer: '甲', amountCents: 9000, participants: ['乙', '丙'], mode: 'equal' },
    ]);
    assert.deepEqual(balances.map((b) => b.balanceCents), [9000, -4500, -4500]);
  });
  it('费用引用名单外成员报错', () => {
    assert.throws(
      () => computeBalances(members, [{ title: '错账', payer: '陌生人', amountCents: 1000, participants: members, mode: 'equal' }]),
      /不在成员名单中/,
    );
  });
  it('单笔份额函数与导出文本/CSV', () => {
    const e = expenses[0];
    assert.deepEqual(expenseShares(e), [12000, 12000, 12000, 12000]);
    const balances = computeBalances(members, expenses);
    const text = settlementToText(balances, settle(balances), expenses);
    assert.ok(text.includes('林晓 → 王磊 ¥150.00'));
    assert.ok(text.includes('只算账、不经手资金'));
    const csv = settlementToCsv(members, expenses, balances, settle(balances));
    assert.ok(csv.includes('费用清单') && csv.includes('转账清单') && csv.includes('林晓'));
    assert.equal(formatCents(-15000), '-¥150.00');
  });
});

describe('注册与 SEO 接线', () => {
  it('split-bill 在注册表与路由中', () => {
    assert.ok(tools.some((t) => t.id === 'split-bill' && t.path === '/tools/split-bill'));
    assert.equal(currentPage('/tools/split-bill', ''), 'split-bill');
    assert.equal(currentPage('/tools/split-bill/', ''), 'split-bill');
  });
  it('split-bill 有独立 SEO 标题与任务描述', () => {
    const meta = pageSeo('split-bill' as never);
    assert.ok(meta.title.includes('AA 分账'));
    assert.ok(meta.description.includes('转账清单'));
    assert.ok((toolNotes as Record<string, string>)['split-bill'].includes('转账清单'));
  });
});
