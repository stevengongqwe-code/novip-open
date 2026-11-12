/**
 * 宿舍电费分摊与阶梯均摊计算器 · 核心结算引擎
 * 支持天数加权、垫付冲抵与最小转账结算算法
 */

export interface DormMember {
  id: string;
  name: string;
  stayDays: number;     // 周期内在寝天数 (用于加权)
  prepaidAmount: number; // 垫付金额 (元)
}

export interface DormPowerInput {
  totalBill: number;    // 电费总额 (元)
  billingDays: number;  // 账单涵盖周期天数 (默认 30)
  members: DormMember[];
}

export interface MemberSettlement {
  id: string;
  name: string;
  stayDays: number;
  weightRatio: number;      // 权重占比
  shouldPay: number;        // 应付金额 (元)
  prepaidAmount: number;    // 已付金额 (元)
  balance: number;          // 结余 (正代表应收，负代表应付)
}

export interface TransferInstruction {
  from: string; // 付款人
  to: string;   // 收款人
  amount: number; // 金额 (元)
}

export interface DormPowerResult {
  settlements: MemberSettlement[];
  transfers: TransferInstruction[];
  totalBill: number;
  perDiemRate: number; // 平均每天电费
  dormGroupText: string;
}

export function calculateDormPower(input: DormPowerInput): DormPowerResult {
  const totalBill = Math.max(0, input.totalBill);
  const billingDays = Math.max(1, input.billingDays || 30);
  const members = input.members.length > 0 ? input.members : [
    {id: '1', name: '室友A', stayDays: 30, prepaidAmount: totalBill},
    {id: '2', name: '室友B', stayDays: 30, prepaidAmount: 0},
    {id: '3', name: '室友C', stayDays: 30, prepaidAmount: 0},
    {id: '4', name: '室友D', stayDays: 30, prepaidAmount: 0},
  ];

  const totalStayDays = members.reduce((sum, m) => sum + Math.max(0, m.stayDays), 0);
  const perDiemRate = totalBill / billingDays;

  // 1. 计算每个人的应付金额
  const settlements: MemberSettlement[] = members.map((m) => {
    const days = Math.max(0, m.stayDays);
    const ratio = totalStayDays > 0 ? days / totalStayDays : 1 / members.length;
    const shouldPay = Math.round(totalBill * ratio * 100) / 100;
    const prepaid = Math.max(0, m.prepaidAmount || 0);
    const balance = Math.round((prepaid - shouldPay) * 100) / 100;

    return {
      id: m.id,
      name: m.name || '室友',
      stayDays: days,
      weightRatio: Math.round(ratio * 1000) / 10,
      shouldPay,
      prepaidAmount: prepaid,
      balance,
    };
  });

  // 2. 最小转账清单贪心算法
  const debtors: {name: string; amount: number}[] = [];
  const creditors: {name: string; amount: number}[] = [];

  settlements.forEach((s) => {
    if (s.balance < -0.01) {
      debtors.push({name: s.name, amount: -s.balance});
    } else if (s.balance > 0.01) {
      creditors.push({name: s.name, amount: s.balance});
    }
  });

  const transfers: TransferInstruction[] = [];
  let dIdx = 0, cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleAmt = Math.min(debtor.amount, creditor.amount);

    if (settleAmt > 0.01) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(settleAmt * 100) / 100,
      });
    }

    debtor.amount -= settleAmt;
    creditor.amount -= settleAmt;

    if (debtor.amount <= 0.01) dIdx++;
    if (creditor.amount <= 0.01) cIdx++;
  }

  // 3. 生成可直接发群的公示文本
  const summaryLines = [
    `⚡【宿舍电费结算公示单】`,
    `• 本期总电费：${totalBill} 元（周期 ${billingDays} 天，日均约 ${(Math.round(perDiemRate * 100) / 100)} 元）`,
    `• 分摊明细：`,
    ...settlements.map(
      (s) =>
        `  - ${s.name}：在寝 ${s.stayDays} 天（占比 ${s.weightRatio}%），应付 ${s.shouldPay} 元，已垫付 ${s.prepaidAmount} 元，结余 ${s.balance >= 0 ? '+' : ''}${s.balance} 元`
    ),
  ];

  if (transfers.length > 0) {
    summaryLines.push(`• 转账清单：`);
    transfers.forEach((t) => {
      summaryLines.push(`  👉 ${t.from} 应转给 ${t.to}：${t.amount} 元`);
    });
  } else {
    summaryLines.push(`• 各自垫付恰好结清，无需互相转账！`);
  }

  summaryLines.push(`（免充值、0广告，寝室公约好帮手 NOVIP：https://novip.site/tools/dorm-power）`);

  return {
    settlements,
    transfers,
    totalBill,
    perDiemRate: Math.round(perDiemRate * 100) / 100,
    dormGroupText: summaryLines.join('\n'),
  };
}
