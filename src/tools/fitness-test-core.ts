/**
 * 体测成绩计算 · 纯函数核心（Factory Day 9，2026-11-04）。
 * 本模块不碰 DOM、不联网、不存 localStorage：档位查表、加权、附加分、
 * 等级、短板与提分缺口、结果文本与 CSV 导出均可单测。
 *
 * 依据（页面与单测共同承诺）：《国家学生体质健康标准（2014年修订）》
 * 大学组。分组 = 性别（男/女）× 年级组（大一/大二、大三/大四）。
 * 7 项与权重：BMI 15、肺活量 15、50 米 20、坐位体前屈 10、立定跳远 10、
 * 引体向上（男）/1 分钟仰卧起坐（女）10、1000 米（男）/800 米（女）20。
 * 查表规则：档位表查表，取“达到的最高档”（成绩介于两档之间取低档，
 * 不插值）；低于 10 分档按 0 分计。男生引体向上在 78/74/70/66/62 分档
 * 无整数可填（表中无值），查表时跳过这些空档，例：15 次→80 分、14 次→76 分。
 * BMI：正常 100、低体重 80、超重 80、肥胖 60（男正常 17.9–23.9、
 * 女正常 17.2–23.9；23.9 与 24.0 之间的边界值按正常计）。
 * 附加分（满分 20）：男生引体超出 100 分档的次数即加分（封顶 10）；
 * 女生仰卧起坐超出次数按 13/12/11/10/9/8/7/6/4/2 对应加分 10–1；
 * 男生 1000 米快于 100 分档的秒数按 35/32/29/26/23/20/16/12/8/4 对应
 * 加分 10–1；女生 800 米快于 100 分档的秒数按 50/45/40/35/30/25/20/
 * 15/10/5 对应加分 10–1（介于两档取低档）。
 * 总分 = Σ（单项分 × 权重）+ 附加分，保留 1 位小数；等级：≥90 优秀、
 * 80–89.9 良好、60–79.9 及格、<60 不及格（按含附加分的学年总分判定，
 * 总分最高 120）。与 health（BMI/体脂率参考）与 grades（期末反推）
 * 的区别：本模块只做体测 7 项档位查表 + 加权 + 附加分 + 等级分析。
 * 各校执行细则可能有差异，最终以学校/体育部公布结果为准。
 */

export type Gender = 'male' | 'female';
export type GradeGroup = 'lower' | 'upper'; // lower = 大一/大二，upper = 大三/大四

export const GRADE_GROUP_LABEL: Record<GradeGroup, string> = {
  lower: '大一 / 大二',
  upper: '大三 / 大四',
};

/** 20 个单项档位分（由高到低）。 */
export const SCORES = [100, 95, 90, 85, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60, 50, 40, 30, 20, 10] as const;

type ThresholdRow = readonly (number | null)[];

/** 每项两列：[大一/大二档位表，大三/大四档位表]，顺序与 SCORES 一致。 */
interface ItemTables {
  lung: [ThresholdRow, ThresholdRow];
  sprint50: [ThresholdRow, ThresholdRow];
  sitReach: [ThresholdRow, ThresholdRow];
  jump: [ThresholdRow, ThresholdRow];
  strength: [ThresholdRow, ThresholdRow]; // 男：引体向上；女：1 分钟仰卧起坐
  run: [ThresholdRow, ThresholdRow]; // 男：1000 米（秒）；女：800 米（秒）
}

const TABLES: Record<Gender, ItemTables> = {
  male: {
    lung: [
      [5040, 4920, 4800, 4550, 4300, 4180, 4060, 3940, 3820, 3700, 3580, 3460, 3340, 3220, 3100, 2940, 2780, 2620, 2460, 2300],
      [5140, 5020, 4900, 4650, 4400, 4280, 4160, 4040, 3920, 3800, 3680, 3560, 3440, 3320, 3200, 3030, 2860, 2690, 2520, 2350],
    ],
    sprint50: [
      [6.7, 6.8, 6.9, 7.0, 7.1, 7.3, 7.5, 7.7, 7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1],
      [6.6, 6.7, 6.8, 6.9, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0],
    ],
    sitReach: [
      [24.9, 23.1, 21.3, 19.5, 17.7, 16.3, 14.9, 13.5, 12.1, 10.7, 9.3, 7.9, 6.5, 5.1, 3.7, 2.7, 1.7, 0.7, -0.3, -1.3],
      [25.1, 23.3, 21.5, 19.9, 18.2, 16.8, 15.4, 14.0, 12.6, 11.2, 9.8, 8.4, 7.0, 5.6, 4.2, 3.2, 2.2, 1.2, 0.2, -0.8],
    ],
    jump: [
      [273, 268, 263, 256, 248, 244, 240, 236, 232, 228, 224, 220, 216, 212, 208, 203, 198, 193, 188, 183],
      [275, 270, 265, 258, 250, 246, 242, 238, 234, 230, 226, 222, 218, 214, 210, 205, 200, 195, 190, 185],
    ],
    strength: [
      [19, 18, 17, 16, 15, null, 14, null, 13, null, 12, null, 11, null, 10, 9, 8, 7, 6, 5],
      [20, 19, 18, 17, 16, null, 15, null, 14, null, 13, null, 12, null, 11, 10, 9, 8, 7, 6],
    ],
    run: [
      [197, 202, 207, 214, 222, 227, 232, 237, 242, 247, 252, 257, 262, 267, 272, 292, 312, 332, 352, 372],
      [195, 200, 205, 212, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 290, 310, 330, 350, 370],
    ],
  },
  female: {
    lung: [
      [3400, 3350, 3300, 3150, 3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300, 2200, 2100, 2000, 1960, 1920, 1880, 1840, 1800],
      [3450, 3400, 3350, 3200, 3050, 2950, 2850, 2750, 2650, 2550, 2450, 2350, 2250, 2150, 2050, 2010, 1970, 1930, 1890, 1850],
    ],
    sprint50: [
      [7.5, 7.6, 7.7, 8.0, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3],
      [7.4, 7.5, 7.6, 7.9, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.4, 10.6, 10.8, 11.0, 11.2],
    ],
    sitReach: [
      [25.8, 24.0, 22.2, 20.6, 19.0, 17.7, 16.4, 15.1, 13.8, 12.5, 11.2, 9.9, 8.6, 7.3, 6.0, 5.2, 4.4, 3.6, 2.8, 2.0],
      [26.3, 24.4, 22.4, 21.0, 19.5, 18.2, 16.9, 15.6, 14.3, 13.0, 11.7, 10.4, 9.1, 7.8, 6.5, 5.7, 4.9, 4.1, 3.3, 2.5],
    ],
    jump: [
      [207, 201, 195, 188, 181, 178, 175, 172, 169, 166, 163, 160, 157, 154, 151, 146, 141, 136, 131, 126],
      [208, 202, 196, 189, 182, 179, 176, 173, 170, 167, 164, 161, 158, 155, 152, 147, 142, 137, 132, 127],
    ],
    strength: [
      [56, 54, 52, 49, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16],
      [57, 55, 53, 50, 47, 45, 43, 41, 39, 37, 35, 33, 31, 29, 27, 25, 23, 21, 19, 17],
    ],
    run: [
      [198, 204, 210, 217, 224, 229, 234, 239, 244, 249, 254, 259, 264, 269, 274, 284, 294, 304, 314, 324],
      [196, 202, 208, 215, 222, 227, 232, 237, 242, 247, 252, 257, 262, 267, 272, 282, 292, 302, 312, 322],
    ],
  },
};

export const WEIGHTS = { bmi: 15, lung: 15, sprint50: 20, sitReach: 10, jump: 10, strength: 10, run: 20 } as const;
export type ItemKey = keyof typeof WEIGHTS;

export const ITEM_LABEL: Record<ItemKey, string> = {
  bmi: '体重指数（BMI）',
  lung: '肺活量',
  sprint50: '50 米跑',
  sitReach: '坐位体前屈',
  jump: '立定跳远',
  strength: '引体向上 / 仰卧起坐',
  run: '1000 米跑 / 800 米跑',
};

export function strengthLabel(gender: Gender): string {
  return gender === 'male' ? '引体向上' : '1 分钟仰卧起坐';
}
export function runLabel(gender: Gender): string {
  return gender === 'male' ? '1000 米跑' : '800 米跑';
}

/** 高优项查表：取达到的最高档；低于 10 分档按 0 分计；空档跳过。 */
export function scoreHighBetter(value: number, thresholds: ThresholdRow): number {
  for (let i = 0; i < SCORES.length; i++) {
    const t = thresholds[i];
    if (t !== null && value >= t) return SCORES[i];
  }
  return 0;
}

/** 低优项（用时越短越好）查表：取达到的最高档；慢于 10 分档按 0 分计。 */
export function scoreLowBetter(value: number, thresholds: ThresholdRow): number {
  for (let i = 0; i < SCORES.length; i++) {
    const t = thresholds[i];
    if (t !== null && value <= t) return SCORES[i];
  }
  return 0;
}

/** BMI 单项分：正常 100、低体重 80、超重 80、肥胖 60。 */
export function bmiScore(bmi: number, gender: Gender): number {
  const normalLow = gender === 'male' ? 17.9 : 17.2;
  if (bmi < normalLow) return 80;
  if (bmi < 24.0) return 100;
  if (bmi < 28.0) return 80;
  return 60;
}

export function bmiFrom(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

/** 附加分：按“超出 100 分档多少”查表，介于两档取低档，封顶 10。 */
export function bonusFor(gender: Gender, group: GradeGroup, strengthValue: number, runSeconds: number): number {
  const idx = group === 'lower' ? 0 : 1;
  const t = TABLES[gender];
  let bonus = 0;
  const strength100 = t.strength[idx][0];
  if (strength100 !== null && strengthValue > strength100) {
    const excess = strengthValue - strength100;
    if (gender === 'male') {
      bonus += Math.min(excess, 10);
    } else {
      const thresholds = [13, 12, 11, 10, 9, 8, 7, 6, 4, 2];
      for (let i = 0; i < thresholds.length; i++) {
        if (excess >= thresholds[i]) {
          bonus += 10 - i;
          break;
        }
      }
    }
  }
  const run100 = t.run[idx][0];
  if (run100 !== null && runSeconds < run100) {
    const faster = run100 - runSeconds;
    const thresholds = gender === 'male'
      ? [35, 32, 29, 26, 23, 20, 16, 12, 8, 4]
      : [50, 45, 40, 35, 30, 25, 20, 15, 10, 5];
    for (let i = 0; i < thresholds.length; i++) {
      if (faster >= thresholds[i]) {
        bonus += 10 - i;
        break;
      }
    }
  }
  return Math.min(bonus, 20);
}

export interface FitnessInput {
  gender: Gender;
  group: GradeGroup;
  /** 直接填 BMI（二选一，与身高体重互斥，优先直接值）。 */
  bmi?: number;
  heightCm?: number;
  weightKg?: number;
  lung?: number;
  sprint50?: number;
  sitReach?: number;
  jump?: number;
  strength?: number;
  runSeconds?: number;
}

export interface ItemResult {
  key: ItemKey;
  label: string;
  display: string;
  score: number;
  weight: number;
  contribution: number;
}

export interface FitnessResult {
  items: ItemResult[];
  filledCount: number;
  partial: boolean;
  bmiValue: number | null;
  standardScore: number;
  bonus: number;
  total: number;
  grade: string;
  weakest: ItemResult | null;
  nextGradeGap: number | null;
  nextGradeLabel: string | null;
}

function gradeFor(total: number): string {
  if (total >= 90) return '优秀';
  if (total >= 80) return '良好';
  if (total >= 60) return '及格';
  return '不及格';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 全部计算：未填项不计入；只有 7 项填完才给正式总分与等级。 */
export function calcFitness(input: FitnessInput): FitnessResult {
  const tables = TABLES[input.gender];
  const idx = input.group === 'lower' ? 0 : 1;
  const items: ItemResult[] = [];
  let bmiValue: number | null = null;
  if (input.bmi !== undefined) {
    bmiValue = input.bmi;
    const s = bmiScore(input.bmi, input.gender);
    items.push({ key: 'bmi', label: '体重指数（BMI）', display: `${input.bmi.toFixed(1)}`, score: s, weight: WEIGHTS.bmi, contribution: round1((s * WEIGHTS.bmi) / 100) });
  } else if (input.heightCm !== undefined && input.weightKg !== undefined) {
    bmiValue = round1(bmiFrom(input.heightCm, input.weightKg));
    const s = bmiScore(bmiValue, input.gender);
    items.push({ key: 'bmi', label: '体重指数（BMI）', display: `${input.heightCm}cm / ${input.weightKg}kg → ${bmiValue.toFixed(1)}`, score: s, weight: WEIGHTS.bmi, contribution: round1((s * WEIGHTS.bmi) / 100) });
  }
  const push = (key: ItemKey, label: string, display: string, score: number) => {
    items.push({ key, label, display, score, weight: WEIGHTS[key], contribution: round1((score * WEIGHTS[key]) / 100) });
  };
  if (input.lung !== undefined) push('lung', '肺活量', `${input.lung} 毫升`, scoreHighBetter(input.lung, tables.lung[idx]));
  if (input.sprint50 !== undefined) push('sprint50', '50 米跑', `${input.sprint50} 秒`, scoreLowBetter(input.sprint50, tables.sprint50[idx]));
  if (input.sitReach !== undefined) push('sitReach', '坐位体前屈', `${input.sitReach} 厘米`, scoreHighBetter(input.sitReach, tables.sitReach[idx]));
  if (input.jump !== undefined) push('jump', '立定跳远', `${input.jump} 厘米`, scoreHighBetter(input.jump, tables.jump[idx]));
  if (input.strength !== undefined) push('strength', strengthLabel(input.gender), `${input.strength} 次`, scoreHighBetter(input.strength, tables.strength[idx]));
  if (input.runSeconds !== undefined) push('run', runLabel(input.gender), formatRunTime(input.runSeconds), scoreLowBetter(input.runSeconds, tables.run[idx]));
  const filledCount = items.length;
  const partial = filledCount < 7;
  const standardScore = round1(items.reduce((sum, it) => sum + it.contribution, 0));
  let bonus = 0;
  if (input.strength !== undefined || input.runSeconds !== undefined) {
    bonus = bonusFor(input.gender, input.group, input.strength ?? 0, input.runSeconds ?? Number.POSITIVE_INFINITY);
  }
  const total = round1(standardScore + bonus);
  const weakest = items.length ? items.reduce((a, b) => (b.contribution < a.contribution ? b : a)) : null;
  let nextGradeGap: number | null = null;
  let nextGradeLabel: string | null = null;
  if (!partial) {
    if (total < 60) {
      nextGradeGap = round1(60 - total);
      nextGradeLabel = '及格';
    } else if (total < 80) {
      nextGradeGap = round1(80 - total);
      nextGradeLabel = '良好';
    } else if (total < 90) {
      nextGradeGap = round1(90 - total);
      nextGradeLabel = '优秀';
    }
  }
  return {
    items,
    filledCount,
    partial,
    bmiValue,
    standardScore,
    bonus,
    total,
    grade: partial ? '待补全' : gradeFor(total),
    weakest,
    nextGradeGap,
    nextGradeLabel,
  };
}

/** 秒 → 3'42" 写法（分'秒"）。 */
export function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round((seconds - m * 60) * 10) / 10;
  const sText = Number.isInteger(s) ? String(s) : s.toFixed(1);
  return `${m}'${sText}"`;
}

/** 解析时间：支持 3'45"、3:45、3分45秒、纯秒（225 / 225.5）。 */
export function parseTimeSeconds(text: string, label: string): number {
  const t = text.trim();
  if (!t) throw new Error(`请填写${label}。`);
  const m1 = /^(\d+)\s*[':：]\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|″|秒)?$/.exec(t);
  if (m1) {
    const sec = Number(m1[2]);
    if (sec >= 60) throw new Error(`${label}的秒数不能 ≥60，请写成“分'秒\"”，例如 3'45"。`);
    const total = Number(m1[1]) * 60 + sec;
    if (total <= 0) throw new Error(`${label}请填大于 0 的时间。`);
    return total;
  }
  const m2 = /^(\d+)\s*分\s*(\d{1,2}(?:\.\d+)?)\s*秒$/.exec(t);
  if (m2) {
    const sec = Number(m2[2]);
    if (sec >= 60) throw new Error(`${label}的秒数不能 ≥60。`);
    const total = Number(m2[1]) * 60 + sec;
    if (total <= 0) throw new Error(`${label}请填大于 0 的时间。`);
    return total;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}格式不对：请填秒数（如 225）或“分'秒\"”（如 3'45"）。`);
  return n;
}

/** 解析正数（肺活量/立定跳远/身高/体重/BMI）。 */
export function parsePositive(text: string, label: string): number {
  const t = text.trim();
  if (!t) throw new Error(`请填写${label}。`);
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}请填大于 0 的数字。`);
  return n;
}

/** 解析次数（引体/仰卧起坐，非负整数）。 */
export function parseCount(text: string, label: string): number {
  const t = text.trim();
  if (!t) throw new Error(`请填写${label}。`);
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label}请填非负整数（次）。`);
  return n;
}

/** 解析坐位体前屈（可为负数，如 -1.3）。 */
export function parseSigned(text: string, label: string): number {
  const t = text.trim();
  if (!t) throw new Error(`请填写${label}。`);
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${label}请填数字（可为负数，如 -1.3）。`);
  return n;
}

/** 结果文本（复制用）。 */
export function resultToText(result: FitnessResult, gender: Gender, group: GradeGroup): string {
  const lines = [
    'NOVIP 体测成绩计算结果',
    `性别：${gender === 'male' ? '男' : '女'}；年级组：${GRADE_GROUP_LABEL[group]}`,
    ...result.items.map((it) => `${it.label}：${it.display} → ${it.score} 分（权重 ${it.weight}%），贡献 ${it.contribution.toFixed(1)} 分`),
    `标准分：${result.standardScore.toFixed(1)} 分；附加分：${result.bonus} 分；学年总分：${result.total.toFixed(1)} 分；等级：${result.grade}`,
  ];
  if (result.partial) lines.push(`注意：只填了 ${result.filledCount}/7 项，总分为部分成绩、仅供参考，填完 7 项才给正式总分与等级。`);
  if (result.weakest) lines.push(`最弱项：${result.weakest.label}（贡献 ${result.weakest.contribution.toFixed(1)} 分）。`);
  if (result.nextGradeGap !== null) lines.push(`到${result.nextGradeLabel}还差 ${result.nextGradeGap.toFixed(1)} 分（按当前附加分不变）。`);
  lines.push('依据：《国家学生体质健康标准（2014年修订）》大学组；各校执行细则可能有差异，最终以学校/体育部公布结果为准。');
  return lines.join('\n');
}

/** 结果 CSV（下载用，含 BOM 由组件加）。 */
export function resultToCsv(result: FitnessResult, gender: Gender, group: GradeGroup): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ['项目', '实测值', '单项分', '权重%', '加权贡献'],
    ...result.items.map((it) => [it.label, it.display, String(it.score), String(it.weight), it.contribution.toFixed(1)]),
    ['标准分', '', '', '', result.standardScore.toFixed(1)],
    ['附加分', '', '', '', String(result.bonus)],
    ['学年总分', '', '', '', result.total.toFixed(1)],
    ['等级', result.grade, '', '', ''],
    ['性别/年级组', `${gender === 'male' ? '男' : '女'} / ${GRADE_GROUP_LABEL[group]}`, '', '', ''],
  ];
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

/** PRD 锁定示例：男生大一/大二，BMI 100 分档、其余 6 项 80 分档 → 标准分 83.0、附加 0、总分 83.0、良好。 */
export const SAMPLE_INPUT: FitnessInput = {
  gender: 'male',
  group: 'lower',
  heightCm: 175,
  weightKg: 68,
  lung: 4300,
  sprint50: 7.1,
  sitReach: 17.7,
  jump: 248,
  strength: 15,
  runSeconds: 222,
};

export function csvDateSuffix(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}
