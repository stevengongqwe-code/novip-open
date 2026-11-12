/** NOVIP independent implementation. No ToolKnit source code is incorporated. */
// BMI / 体脂率（美国海军围度公式）/ BMR（Mifflin-St Jeor）/ TDEE 纯函数核心。
// 全部本地计算：无网络、无存储、无副作用；错误信息为中文，供 UI 直接展示。
// 公式来源与限制见各函数注释；所有结果仅供健康参考，不构成医疗诊断或处方。

export type Gender = 'male' | 'female';
export const GENDER_LABELS: Record<Gender, string> = { male: '男', female: '女' };

export interface RangeSpec {
  readonly min: number;
  readonly max: number;
  readonly unit: string;
}

/** 输入合理范围（超出即拒绝，避免误用公式）。 */
export const LIMITS = {
  age: { min: 10, max: 100, unit: '岁' },
  heightCm: { min: 100, max: 250, unit: 'cm' },
  weightKg: { min: 20, max: 300, unit: 'kg' },
  circumferenceCm: { min: 30, max: 250, unit: 'cm' },
} as const satisfies Record<string, RangeSpec>;

export const CM_PER_INCH = 2.54;

function readGender(gender: Gender): Gender {
  if (gender !== 'male' && gender !== 'female') throw new Error('请选择性别（男 / 女）。');
  return gender;
}

/** 把输入解析为有限数字；空值、非数字统一转成中文提示。 */
export function readNumber(value: number | string, label: string): number {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) throw new Error(`请填写${label}。`);
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) throw new Error(`${label}必须是数字。`);
    return parsed;
  }
  if (!Number.isFinite(value)) throw new Error(`${label}必须是有效数字。`);
  return value;
}

/** 解析并检查范围；NaN、负数、空值、超范围都会被拒绝。 */
export function readInRange(value: number | string, spec: RangeSpec, label: string): number {
  const parsed = readNumber(value, label);
  if (parsed < spec.min || parsed > spec.max) {
    // 中文单位（岁）与拉丁单位（cm / kg）的排版空格不同，避免出现“岁 之间”。
    const unitGap = spec.unit === '岁' ? '' : ' ';
    throw new Error(`${label}需在 ${spec.min}–${spec.max} ${spec.unit}${unitGap}之间。`);
  }
  return parsed;
}

/** 厘米换算英寸（美国海军围度公式以英寸计算，先统一换算避免单位混用）。 */
export function cmToInch(cm: number): number {
  if (!Number.isFinite(cm)) throw new Error('围度必须是有效数字。');
  return cm / CM_PER_INCH;
}

// ---------------------------------------------------------------------------
// 1. BMI：中国成人分类 + 对应身高的健康体重区间
// ---------------------------------------------------------------------------

export type BmiLevel = 'underweight' | 'normal' | 'overweight' | 'obese';

export interface BmiCategory {
  level: BmiLevel;
  label: string;
  rangeText: string;
  bmiMin: number;
  bmiMax: number | null;
}

/** 中国成人 BMI 分类（与 WHO 国际标准不同，界面必须提示）。 */
export const BMI_CATEGORIES: readonly BmiCategory[] = [
  { level: 'underweight', label: '偏瘦', rangeText: 'BMI < 18.5', bmiMin: 0, bmiMax: 18.5 },
  { level: 'normal', label: '正常', rangeText: '18.5 ≤ BMI < 24.0', bmiMin: 18.5, bmiMax: 24 },
  { level: 'overweight', label: '超重', rangeText: '24.0 ≤ BMI < 28.0', bmiMin: 24, bmiMax: 28 },
  { level: 'obese', label: '肥胖', rangeText: 'BMI ≥ 28.0', bmiMin: 28, bmiMax: null },
];

/** 健康体重区间按中国成人正常 BMI 18.5–23.9 反推。 */
export const HEALTHY_BMI = { min: 18.5, max: 23.9 } as const;

export function classifyBmi(bmi: number): BmiCategory {
  if (!Number.isFinite(bmi) || bmi <= 0) throw new Error('BMI 必须是大于 0 的有效数字。');
  const category = BMI_CATEGORIES.find((item) => bmi < (item.bmiMax ?? Infinity));
  // 最后一档 bmiMax 为 null（≥ 28），find 一定能命中。
  return category ?? BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

export interface BmiResult {
  heightCm: number;
  weightKg: number;
  bmi: number;
  category: BmiCategory;
  healthyWeightKg: { min: number; max: number };
  healthyBmi: { min: number; max: number };
}

export function computeBmi(heightCm: number | string, weightKg: number | string): BmiResult {
  const height = readInRange(heightCm, LIMITS.heightCm, '身高');
  const weight = readInRange(weightKg, LIMITS.weightKg, '体重');
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (!Number.isFinite(bmi) || bmi <= 0) throw new Error('无法计算 BMI，请核对身高和体重。');
  return {
    heightCm: height,
    weightKg: weight,
    bmi,
    category: classifyBmi(bmi),
    healthyWeightKg: {
      min: HEALTHY_BMI.min * heightM * heightM,
      max: HEALTHY_BMI.max * heightM * heightM,
    },
    healthyBmi: { min: HEALTHY_BMI.min, max: HEALTHY_BMI.max },
  };
}

// ---------------------------------------------------------------------------
// 2. 体脂率估算：美国海军围度公式（Hodgdon & Beckett, 1984；输入先 cm → inch）
//    男：%BF = 86.010×log10(腰围−颈围) − 70.041×log10(身高) + 36.76
//    女：%BF = 163.205×log10(腰围+臀围−颈围) − 97.684×log10(身高) − 78.387
//    分级参考：美国运动医学会（ACE）公开体脂参考区间。
// ---------------------------------------------------------------------------

export type BodyFatLevel = 'low' | 'essential' | 'athlete' | 'fitness' | 'average' | 'high';

export interface BodyFatReferenceRow {
  level: Exclude<BodyFatLevel, 'low'>;
  label: string;
  min: number;
  max: number | null;
  text: string;
}

/** ACE 公开体脂参考区间（按整数百分比分段，分类时按上界归入相邻区间）。 */
export const BODY_FAT_REFERENCE: Record<Gender, readonly BodyFatReferenceRow[]> = {
  male: [
    { level: 'essential', label: '必需脂肪参考', min: 2, max: 5, text: '2–5%' },
    { level: 'athlete', label: '运动员参考', min: 6, max: 13, text: '6–13%' },
    { level: 'fitness', label: '健身参考', min: 14, max: 17, text: '14–17%' },
    { level: 'average', label: '平均参考', min: 18, max: 24, text: '18–24%' },
    { level: 'high', label: '偏高参考', min: 25, max: null, text: '≥25%' },
  ],
  female: [
    { level: 'essential', label: '必需脂肪参考', min: 10, max: 13, text: '10–13%' },
    { level: 'athlete', label: '运动员参考', min: 14, max: 20, text: '14–20%' },
    { level: 'fitness', label: '健身参考', min: 21, max: 24, text: '21–24%' },
    { level: 'average', label: '平均参考', min: 25, max: 31, text: '25–31%' },
    { level: 'high', label: '偏高参考', min: 32, max: null, text: '≥32%' },
  ],
};

export interface BodyFatCategory {
  level: BodyFatLevel;
  label: string;
  text: string;
}

export function classifyBodyFat(percent: number, gender: Gender): BodyFatCategory {
  const normalized = readGender(gender);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new Error('体脂率必须是 0–100 之间的有效数字。');
  }
  const rows = BODY_FAT_REFERENCE[normalized];
  if (percent < rows[0].min) {
    return { level: 'low', label: '低于公开参考下限', text: normalized === 'male' ? '< 2%' : '< 10%' };
  }
  // 公开区间按整数百分比分段；连续百分比按下限归入相应档（5.9% 仍归必需脂肪档，6.0% 起归运动员档）。
  let matched = rows[0];
  for (const row of rows) {
    if (percent >= row.min) matched = row;
    else break;
  }
  return { level: matched.level, label: matched.label, text: matched.text };
}

export interface BodyFatInput {
  gender: Gender;
  heightCm: number | string;
  waistCm: number | string;
  neckCm: number | string;
  /** 仅女性需要。 */
  hipCm?: number | string;
}

export interface BodyFatResult {
  gender: Gender;
  percent: number;
  category: BodyFatCategory;
  method: string;
  measurements: { heightCm: number; waistCm: number; neckCm: number; hipCm: number | null };
  reference: readonly BodyFatReferenceRow[];
}

export const BODY_FAT_METHOD = '美国海军围度公式（Hodgdon & Beckett, 1984）';

export function estimateBodyFat(input: BodyFatInput): BodyFatResult {
  const gender = readGender(input.gender);
  const heightCm = readInRange(input.heightCm, LIMITS.heightCm, '身高');
  const waistCm = readInRange(input.waistCm, LIMITS.circumferenceCm, '腰围');
  const neckCm = readInRange(input.neckCm, LIMITS.circumferenceCm, '颈围');
  const heightIn = cmToInch(heightCm);
  let hipCm: number | null = null;
  let percent: number;

  if (gender === 'male') {
    if (waistCm <= neckCm) throw new Error('腰围需大于颈围，请核对测量数值（单位 cm）。');
    percent =
      86.01 * Math.log10(cmToInch(waistCm) - cmToInch(neckCm)) - 70.041 * Math.log10(heightIn) + 36.76;
  } else {
    if (input.hipCm === undefined || (typeof input.hipCm === 'string' && !input.hipCm.trim())) {
      throw new Error('女性体脂估算需要填写臀围，请补充测量数值（单位 cm）。');
    }
    hipCm = readInRange(input.hipCm, LIMITS.circumferenceCm, '臀围');
    if (waistCm + hipCm <= neckCm) {
      throw new Error('腰围与臀围之和需大于颈围，请核对测量数值（单位 cm）。');
    }
    percent =
      163.205 * Math.log10(cmToInch(waistCm) + cmToInch(hipCm) - cmToInch(neckCm)) -
      97.684 * Math.log10(heightIn) -
      78.387;
  }

  if (!Number.isFinite(percent)) throw new Error('围度组合无法计算体脂率，请核对测量数值。');
  if (percent <= 0 || percent > 75) {
    throw new Error('按当前围度估算的值超出公式常见范围（0–75%），请核对是否填反腰围/颈围/臀围或单位错误。');
  }

  return {
    gender,
    percent,
    category: classifyBodyFat(percent, gender),
    method: BODY_FAT_METHOD,
    measurements: { heightCm, waistCm, neckCm, hipCm },
    reference: BODY_FAT_REFERENCE[gender],
  };
}

// ---------------------------------------------------------------------------
// 3. BMR（Mifflin-St Jeor）+ TDEE（5 档活动系数）
//    BMR = 10×体重(kg) + 6.25×身高(cm) − 5×年龄 + s（男 s=+5，女 s=−161）
//    TDEE = BMR × 活动系数
// ---------------------------------------------------------------------------

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: '久坐少动', factor: 1.2, detail: '几乎不运动，日常以坐着上课 / 办公为主' },
  { id: 'light', label: '轻度活动', factor: 1.375, detail: '每周 1–3 次轻量运动或规律散步' },
  { id: 'moderate', label: '中度活动', factor: 1.55, detail: '每周 3–5 次中等强度运动' },
  { id: 'active', label: '高度活动', factor: 1.725, detail: '每周 6–7 次高强度运动' },
  { id: 'veryActive', label: '极高活动', factor: 1.9, detail: '体力劳动或每天高强度训练' },
] as const;

export type ActivityLevelId = (typeof ACTIVITY_LEVELS)[number]['id'];

export interface TdeeRow {
  id: ActivityLevelId;
  label: string;
  factor: number;
  detail: string;
  tdee: number;
}

export interface BmrInput {
  gender: Gender;
  heightCm: number | string;
  weightKg: number | string;
  age: number | string;
}

export const BMR_FORMULA =
  'BMR = 10 × 体重(kg) + 6.25 × 身高(cm) − 5 × 年龄 + s（男 s = +5，女 s = −161）';

export function computeBmr(input: BmrInput): number {
  const gender = readGender(input.gender);
  const heightCm = readInRange(input.heightCm, LIMITS.heightCm, '身高');
  const weightKg = readInRange(input.weightKg, LIMITS.weightKg, '体重');
  const age = readInRange(input.age, LIMITS.age, '年龄');
  if (!Number.isInteger(age)) {
    throw new Error(`年龄需为 ${LIMITS.age.min}–${LIMITS.age.max} 的整数岁。`);
  }
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161);
  if (!Number.isFinite(bmr) || bmr <= 0) {
    throw new Error('按当前输入无法得到有效的基础代谢率，请核对身高、体重和年龄。');
  }
  return bmr;
}

function readBmr(value: number | string): number {
  const bmr = readNumber(value, 'BMR');
  if (bmr <= 0) throw new Error('BMR 必须是大于 0 的数值。');
  return bmr;
}

/** 由 BMR 生成 5 档活动水平的 TDEE 表（不传活动水平时用于全表展示）。 */
export function tdeeTable(bmr: number | string): TdeeRow[] {
  const base = readBmr(bmr);
  return ACTIVITY_LEVELS.map((level) => ({
    id: level.id,
    label: level.label,
    factor: level.factor,
    detail: level.detail,
    tdee: base * level.factor,
  }));
}

export function computeTdee(bmr: number | string, level: ActivityLevelId): TdeeRow {
  const base = readBmr(bmr);
  const activity = ACTIVITY_LEVELS.find((item) => item.id === level);
  if (!activity) throw new Error('请选择有效的活动水平。');
  return {
    id: activity.id,
    label: activity.label,
    factor: activity.factor,
    detail: activity.detail,
    tdee: base * activity.factor,
  };
}

export interface EnergyResult {
  bmr: number;
  rows: TdeeRow[];
}

export function computeEnergy(input: BmrInput): EnergyResult {
  const bmr = computeBmr(input);
  return { bmr, rows: tdeeTable(bmr) };
}
