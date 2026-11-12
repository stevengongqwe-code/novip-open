/**
 * 宿舍限电功率计算器 · 核心校验引擎
 * 双限校验：单台限功率 + 宿舍总功率上限（中国市电 220V）。
 * 限值口径：超过才断电（等于限值不算超限），与高校《学生公寓用电管理办法》
 * "超过 700 瓦自动断电"等文件口径一致；功率以电器铭牌为准，预设值为常见范围。
 */

export const VOLTAGE_V = 220;

/** 常见宿舍限值预设（W）：各校标准不统一，200W–2000W 均有实例。 */
export const COMMON_LIMITS_W = [200, 300, 500, 700, 800, 1000, 1500, 2000];

/** 占用率达到该比例即判"接近上限"。 */
export const NEAR_RATIO = 0.8;

export interface AppliancePreset {
  name: string;
  watts: number;
  category: '发热大功率' | '常用小功率';
}

/** 常用电器预设库：功率为常见额定功率范围的中位值，使用时以铭牌为准。 */
export const APPLIANCE_PRESETS: AppliancePreset[] = [
  {name: '吹风机（小功率档）', watts: 300, category: '发热大功率'},
  {name: '吹风机（常见）', watts: 800, category: '发热大功率'},
  {name: '吹风机（大功率）', watts: 1200, category: '发热大功率'},
  {name: '电热水壶', watts: 1500, category: '发热大功率'},
  {name: '电磁炉', watts: 1800, category: '发热大功率'},
  {name: '电暖器', watts: 1500, category: '发热大功率'},
  {name: '电饭煲', watts: 600, category: '发热大功率'},
  {name: '饮水机', watts: 500, category: '发热大功率'},
  {name: '电热毯', watts: 80, category: '常用小功率'},
  {name: '笔记本电脑', watts: 65, category: '常用小功率'},
  {name: '台式电脑', watts: 300, category: '常用小功率'},
  {name: '手机充电器', watts: 20, category: '常用小功率'},
  {name: '平板充电器', watts: 30, category: '常用小功率'},
  {name: 'LED 台灯', watts: 10, category: '常用小功率'},
  {name: '小风扇', watts: 40, category: '常用小功率'},
  {name: '迷你冰箱', watts: 100, category: '常用小功率'},
  {name: '路由器', watts: 10, category: '常用小功率'},
  {name: '电蚊香', watts: 5, category: '常用小功率'},
];

export interface DormAppliance {
  id: string;
  name: string;
  watts: number;
  quantity: number;
  on: boolean;
}

export interface PowerLimitInput {
  /** 单台限功率（W）；0 或负数视为"不限/不知道"，只校验总功率。 */
  singleLimitW: number;
  /** 宿舍总功率上限（W）；必须 > 0 否则不计算。 */
  totalLimitW: number;
  voltageV: number;
  appliances: DormAppliance[];
}

export type PowerStatus = 'safe' | 'near' | 'over';

export interface ApplianceCheck {
  id: string;
  name: string;
  watts: number;
  quantity: number;
  totalWatts: number;
  overSingleLimit: boolean;
}

export interface RemovalSuggestion {
  id: string;
  name: string;
  removedWatts: number;
  afterTotalW: number;
}

export interface PowerLimitResult {
  valid: boolean;
  totalWatts: number;
  totalCurrentA: number;
  usageRatio: number;
  status: PowerStatus;
  overSingle: ApplianceCheck[];
  overTotalWatts: number;
  removals: RemovalSuggestion[];
  summaryText: string;
}

export function sanitizeAppliance(a: DormAppliance): DormAppliance {
  return {
    id: a.id,
    name: (a.name || '电器').trim() || '电器',
    watts: Math.max(0, Math.floor(a.watts) || 0),
    quantity: Math.min(9, Math.max(1, Math.floor(a.quantity) || 1)),
    on: a.on !== false,
  };
}

export function describeStatus(status: PowerStatus): string {
  return status === 'over' ? '会跳闸' : status === 'near' ? '接近上限' : '安全';
}

export function checkPowerLimits(input: PowerLimitInput): PowerLimitResult {
  const voltageV = input.voltageV > 0 ? input.voltageV : VOLTAGE_V;
  const totalLimitW = Math.max(0, Math.floor(input.totalLimitW) || 0);
  const singleLimitW = Math.max(0, Math.floor(input.singleLimitW) || 0);
  const valid = totalLimitW > 0;
  const appliances = input.appliances.map(sanitizeAppliance);
  const onList = appliances.filter((a) => a.on);

  const totalWatts = onList.reduce((sum, a) => sum + a.watts * a.quantity, 0);
  const totalCurrentA = Math.round((totalWatts / voltageV) * 100) / 100;
  const usageRatio = valid ? totalWatts / totalLimitW : 0;

  const checks: ApplianceCheck[] = onList.map((a) => ({
    id: a.id,
    name: a.name,
    watts: a.watts,
    quantity: a.quantity,
    totalWatts: a.watts * a.quantity,
    overSingleLimit: singleLimitW > 0 && a.watts > singleLimitW,
  }));
  const overSingle = checks.filter((c) => c.overSingleLimit);
  const overTotalWatts = Math.max(0, totalWatts - totalLimitW);

  let status: PowerStatus = 'safe';
  if (valid && (totalWatts > totalLimitW || overSingle.length > 0)) {
    status = 'over';
  } else if (valid && totalWatts >= NEAR_RATIO * totalLimitW) {
    status = 'near';
  }

  // 移除建议：只列出"去掉该电器后总功率回到限值内、且不再有单台超限"的项，
  // 按去掉的瓦数从小到大排（改动最小的方案在前）。
  const removals: RemovalSuggestion[] = [];
  if (valid && status === 'over') {
    for (const a of onList) {
      const removedWatts = a.watts * a.quantity;
      const afterTotalW = totalWatts - removedWatts;
      const remainingOverSingle = overSingle.some((c) => c.id !== a.id);
      if (afterTotalW <= totalLimitW && !remainingOverSingle) {
        removals.push({id: a.id, name: a.name, removedWatts, afterTotalW});
      }
    }
    removals.sort((x, y) => x.removedWatts - y.removedWatts);
  }

  const partial = {valid, totalWatts, totalCurrentA, usageRatio, status, overSingle, overTotalWatts, removals};
  const summaryText = formatPowerSummary(
    {singleLimitW, totalLimitW, voltageV, appliances},
    partial,
  );

  return {...partial, summaryText};
}

export function formatPowerSummary(
  input: PowerLimitInput,
  result: Omit<PowerLimitResult, 'summaryText'>,
): string {
  const lines: string[] = [];
  lines.push('【宿舍限电功率校验】');
  lines.push(
    `限值：单台${input.singleLimitW > 0 ? `${input.singleLimitW}W` : '不限'} / 宿舍总功率${input.totalLimitW}W（220V）`,
  );
  const onList = input.appliances.map(sanitizeAppliance).filter((a) => a.on);
  if (onList.length === 0) {
    lines.push('在用电器：无');
  } else {
    lines.push('在用电器：');
    for (const a of onList) {
      lines.push(`- ${a.name} ${a.watts}W × ${a.quantity}台 = ${a.watts * a.quantity}W`);
    }
  }
  lines.push(
    `总功率 ${result.totalWatts}W / 总电流 ${result.totalCurrentA}A / 占用率 ${Math.round(result.usageRatio * 100)}%`,
  );
  lines.push(`结论：${describeStatus(result.status)}`);
  if (result.status === 'over') {
    if (result.overTotalWatts > 0) lines.push(`总功率超出限值 ${result.overTotalWatts}W`);
    for (const c of result.overSingle) {
      lines.push(`${c.name}单台 ${c.watts}W，超过单台限值 ${input.singleLimitW}W`);
    }
    if (result.removals.length > 0) {
      lines.push('建议：分开使用，或先关掉以下任一件——');
      for (const r of result.removals) {
        lines.push(`- 关掉${r.name}（减少 ${r.removedWatts}W），总功率降至 ${r.afterTotalW}W`);
      }
    } else {
      lines.push('建议：去掉一件仍超限，请分开使用或减少在用电器。');
    }
  } else if (result.status === 'near') {
    lines.push('建议：已接近上限，再开一件大功率电器可能跳闸，请分开使用。');
  }
  lines.push('说明：本结果为估算，功率以电器铭牌为准，限值以本校《学生公寓管理规定》为准。');
  return lines.join('\n');
}

/** 示例：限电 800W 宿舍，笔记本+台灯+手机充电+吹风机 800W，共 895W，超限。 */
export function sampleAppliances(): DormAppliance[] {
  return [
    {id: 'sample-laptop', name: '笔记本电脑', watts: 65, quantity: 1, on: true},
    {id: 'sample-lamp', name: 'LED 台灯', watts: 10, quantity: 1, on: true},
    {id: 'sample-phone', name: '手机充电器', watts: 20, quantity: 1, on: true},
    {id: 'sample-dryer', name: '吹风机（常见）', watts: 800, quantity: 1, on: true},
  ];
}
