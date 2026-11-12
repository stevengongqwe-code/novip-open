import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {calculateDormPower} from '../src/tools/dorm-power-core';

describe('DormPowerCore — 宿舍电费分摊引擎', () => {
  it('correctly splits equal share when all members stay full duration and one prepaid', () => {
    const result = calculateDormPower({
      totalBill: 200,
      billingDays: 30,
      members: [
        {id: '1', name: '小王', stayDays: 30, prepaidAmount: 200},
        {id: '2', name: '小张', stayDays: 30, prepaidAmount: 0},
        {id: '3', name: '小李', stayDays: 30, prepaidAmount: 0},
        {id: '4', name: '小刘', stayDays: 30, prepaidAmount: 0},
      ],
    });

    assert.equal(result.totalBill, 200);
    assert.equal(result.settlements.length, 4);
    assert.equal(result.settlements[0].shouldPay, 50);
    assert.equal(result.settlements[0].balance, 150);
    assert.equal(result.transfers.length, 3);
    for (const t of result.transfers) {
      assert.equal(t.to, '小王');
      assert.equal(t.amount, 50);
    }
  });

  it('correctly weights stay days when members have different vacation schedules', () => {
    const result = calculateDormPower({
      totalBill: 100,
      billingDays: 30,
      members: [
        {id: '1', name: '留校生A', stayDays: 30, prepaidAmount: 100},
        {id: '2', name: '回家生B', stayDays: 0, prepaidAmount: 0},
      ],
    });

    assert.equal(result.settlements[0].shouldPay, 100);
    assert.equal(result.settlements[1].shouldPay, 0);
    assert.equal(result.transfers.length, 0);
  });

  it('generates WeChat group notification text cleanly', () => {
    const result = calculateDormPower({
      totalBill: 120,
      billingDays: 30,
      members: [
        {id: '1', name: '甲', stayDays: 30, prepaidAmount: 120},
        {id: '2', name: '乙', stayDays: 30, prepaidAmount: 0},
      ],
    });

    assert.ok(result.dormGroupText.includes('宿舍电费结算公示单'));
    assert.ok(result.dormGroupText.includes('甲'));
    assert.ok(result.dormGroupText.includes('乙'));
    assert.ok(result.dormGroupText.includes('乙 应转给 甲：60 元'));
  });
});
