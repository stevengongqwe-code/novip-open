/**
 * NOVIP 大学成绩反推与 GPA 核心计算引擎
 * 纯端侧本地运行，零上传，严谨计算保研/留学/期末算分
 */

export type GpaScaleKey =
  | 'standard-4'
  | 'standard-4.5'
  | 'tsinghua-4'
  | 'pku-4'
  | 'standard-5'
  | 'custom';

export interface GpaScalePreset {
  key: GpaScaleKey;
  name: string;
  maxPoint: number;
  description: string;
  bands?: { min: number; point: number }[];
  calculatePoint?: (score: number) => number;
}

export const GPA_SCALES: Record<GpaScaleKey, GpaScalePreset> = {
  'standard-4': {
    key: 'standard-4',
    name: '标准 4.0 分制（主流高校四分制）',
    maxPoint: 4.0,
    description: '90-100 分 = 4.0，80-89 分 = 3.0，70-79 分 = 2.0，60-69 分 = 1.0，<60 分 = 0',
    bands: [
      { min: 90, point: 4.0 },
      { min: 80, point: 3.0 },
      { min: 70, point: 2.0 },
      { min: 60, point: 1.0 },
      { min: 0, point: 0.0 },
    ],
  },
  'standard-4.5': {
    key: 'standard-4.5',
    name: '标准 4.5 分制',
    maxPoint: 4.5,
    description: '90-100 分 = 4.5，80-89 分 = 3.5，70-79 分 = 2.5，60-69 分 = 1.5，<60 分 = 0',
    bands: [
      { min: 90, point: 4.5 },
      { min: 80, point: 3.5 },
      { min: 70, point: 2.5 },
      { min: 60, point: 1.5 },
      { min: 0, point: 0.0 },
    ],
  },
  'tsinghua-4': {
    key: 'tsinghua-4',
    name: '清华 / 阶梯 4.0 分制',
    maxPoint: 4.0,
    description: '95+=4.0, 90+=4.0, 85+=3.7, 80+=3.3, 77+=3.0, 73+=2.7, 70+=2.3, 67+=2.0, 63+=1.7, 60+=1.3, <60=0',
    bands: [
      { min: 90, point: 4.0 },
      { min: 85, point: 3.7 },
      { min: 80, point: 3.3 },
      { min: 77, point: 3.0 },
      { min: 73, point: 2.7 },
      { min: 70, point: 2.3 },
      { min: 67, point: 2.0 },
      { min: 63, point: 1.7 },
      { min: 60, point: 1.3 },
      { min: 0, point: 0.0 },
    ],
  },
  'pku-4': {
    key: 'pku-4',
    name: '北京大学 4.0 连续算法',
    maxPoint: 4.0,
    description: '60分及以上按连续公式: 4 - 3*(100-X)^2/1600 计算；60分以下为0',
    calculatePoint: (score: number) => {
      if (score < 60) return 0;
      const pt = 4.0 - (3 * Math.pow(100 - score, 2)) / 1600;
      return Math.max(0, Math.min(4.0, Math.round(pt * 100) / 100));
    },
  },
  'standard-5': {
    key: 'standard-5',
    name: '标准五分制 (5.0 满分)',
    maxPoint: 5.0,
    description: '60分及以上绩点 = (成绩 - 50) / 10；60分以下为0',
    calculatePoint: (score: number) => {
      if (score < 60) return 0;
      const pt = (score - 50) / 10;
      return Math.max(0, Math.min(5.0, Math.round(pt * 100) / 100));
    },
  },
  custom: {
    key: 'custom',
    name: '自定义最低分与绩点分段',
    maxPoint: 4.0,
    description: '每行格式：最低分=绩点，如 90=4.0、80=3.0、0=0',
  },
};

export interface CourseEntry {
  id: string;
  name: string;
  score: number;
  credits: number;
  point?: number;
}

export const SAMPLE_COURSES: CourseEntry[] = [
  { id: 'c1', name: '高等数学（下）', score: 89, credits: 4.0 },
  { id: 'c2', name: '大学英语（四级强化）', score: 92, credits: 2.0 },
  { id: 'c3', name: '大学物理（工科）', score: 78, credits: 3.0 },
  { id: 'c4', name: '思想道德与法治', score: 86, credits: 3.0 },
  { id: 'c5', name: '程序设计基础与算法', score: 84, credits: 3.5 },
];

/**
 * 转换单门课程的绩点
 */
export function calculateCoursePoint(
  score: number,
  scaleKey: GpaScaleKey,
  customBands?: { min: number; point: number }[]
): number {
  if (score < 0 || score > 100 || !Number.isFinite(score)) return 0;
  const preset = GPA_SCALES[scaleKey] || GPA_SCALES['standard-4'];

  if (preset.calculatePoint) {
    return preset.calculatePoint(score);
  }

  const bands = customBands && customBands.length > 0 ? customBands : preset.bands || [];
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  const matched = sorted.find((b) => score >= b.min);
  return matched ? matched.point : 0;
}

export interface GpaCalculationResult {
  courses: (CourseEntry & { point: number })[];
  totalCredits: number;
  passedCredits: number;
  weightedGpa: number;
  weightedAverageScore: number;
  arithmeticMeanScore: number;
  scaleMaxPoint: number;
  standing: string;
}

/**
 * 计算多门课程的综合学分绩点与均分
 */
export function calculateGpaSummary(
  courses: CourseEntry[],
  scaleKey: GpaScaleKey,
  customBands?: { min: number; point: number }[]
): GpaCalculationResult {
  const valid = courses.filter(
    (c) => Number.isFinite(c.score) && c.score >= 0 && c.score <= 100 && Number.isFinite(c.credits) && c.credits > 0
  );

  if (valid.length === 0) {
    return {
      courses: [],
      totalCredits: 0,
      passedCredits: 0,
      weightedGpa: 0,
      weightedAverageScore: 0,
      arithmeticMeanScore: 0,
      scaleMaxPoint: GPA_SCALES[scaleKey]?.maxPoint || 4.0,
      standing: '暂无有效课程',
    };
  }

  const calculatedCourses = valid.map((c) => ({
    ...c,
    point: calculateCoursePoint(c.score, scaleKey, customBands),
  }));

  const totalCredits = calculatedCourses.reduce((sum, c) => sum + c.credits, 0);
  const passedCredits = calculatedCourses
    .filter((c) => c.score >= 60)
    .reduce((sum, c) => sum + c.credits, 0);

  const weightedGpa =
    totalCredits > 0
      ? calculatedCourses.reduce((sum, c) => sum + c.point * c.credits, 0) / totalCredits
      : 0;

  const weightedAverageScore =
    totalCredits > 0
      ? calculatedCourses.reduce((sum, c) => sum + c.score * c.credits, 0) / totalCredits
      : 0;

  const arithmeticMeanScore =
    calculatedCourses.reduce((sum, c) => sum + c.score, 0) / calculatedCourses.length;

  const maxPoint = GPA_SCALES[scaleKey]?.maxPoint || 4.0;
  const ratio = maxPoint > 0 ? weightedGpa / maxPoint : 0;

  let standing = '及格通过';
  if (ratio >= 0.9) {
    standing = '卓越拔尖（保研/一等奖学金优势梯队）';
  } else if (ratio >= 0.8) {
    standing = '优秀良好（综合测评与评优领先）';
  } else if (ratio >= 0.7) {
    standing = '良好稳妥（无挂科，成绩中上）';
  } else if (ratio >= 0.6) {
    standing = '基础通过（建议查漏补缺期末考）';
  } else {
    standing = '预警阶段（有科目未及格，须核对重修政策）';
  }

  return {
    courses: calculatedCourses,
    totalCredits: Math.round(totalCredits * 100) / 100,
    passedCredits: Math.round(passedCredits * 100) / 100,
    weightedGpa: Math.round(weightedGpa * 100) / 100,
    weightedAverageScore: Math.round(weightedAverageScore * 100) / 100,
    arithmeticMeanScore: Math.round(arithmeticMeanScore * 100) / 100,
    scaleMaxPoint: maxPoint,
    standing,
  };
}

export type ExamDifficulty = 'already_enough' | 'easy' | 'moderate' | 'challenging' | 'extreme' | 'impossible';

export interface FinalExamCalcResult {
  usualScore: number;
  usualWeightPercent: number;
  targetScore: number;
  usualContribution: number;
  examWeightPercent: number;
  neededExamScore: number;
  neededForPass60: number;
  neededForExcellent85: number;
  possible: boolean;
  alreadyEnough: boolean;
  difficulty: ExamDifficulty;
  tip: string;
}

/**
 * 平时分反推期末卷面需要考多少分
 */
export function calculateFinalExamNeeded(
  usual: number,
  usualWeightPercent: number,
  target: number
): FinalExamCalcResult {
  if (usual < 0 || usual > 100 || !Number.isFinite(usual)) {
    throw new Error('平时成绩须在 0 至 100 之间');
  }
  if (usualWeightPercent < 0 || usualWeightPercent >= 100 || !Number.isFinite(usualWeightPercent)) {
    throw new Error('平时成绩权重须在 0% 至 99% 之间');
  }
  if (target < 0 || target > 100 || !Number.isFinite(target)) {
    throw new Error('目标总评成绩须在 0 至 100 之间');
  }

  const wUsual = usualWeightPercent / 100;
  const wExam = 1 - wUsual;
  const usualContribution = usual * wUsual;

  const rawNeeded = (target - usualContribution) / wExam;
  const neededExamScore = Math.round(rawNeeded * 10) / 10;

  const rawPass = (60 - usualContribution) / wExam;
  const neededForPass60 = Math.max(0, Math.round(rawPass * 10) / 10);

  const rawExc = (85 - usualContribution) / wExam;
  const neededForExcellent85 = Math.round(rawExc * 10) / 10;

  const alreadyEnough = rawNeeded <= 0;
  const possible = rawNeeded <= 100;

  let difficulty: ExamDifficulty = 'moderate';
  let tip = '';

  if (alreadyEnough) {
    difficulty = 'already_enough';
    tip = '🎉 太稳了！你的平时成绩贡献已经直接超过目标总评！期末卷面只要按时交卷不交白卷即达成。';
  } else if (!possible) {
    difficulty = 'impossible';
    tip = `⚠️ 目标卷面分需要达到 ${neededExamScore} 分（超过满分100分），当前平时分占比下无法达标，建议适当调整目标总评。`;
  } else if (neededExamScore <= 60) {
    difficulty = 'easy';
    tip = `✅ 期末卷面只需考 ${neededExamScore} 分即可达成目标！压力较小，认真复习必过。`;
  } else if (neededExamScore <= 80) {
    difficulty = 'moderate';
    tip = `🎯 期末卷面需要考 ${neededExamScore} 分。正常过一遍重点教材与课后习题，完全可以达成！`;
  } else if (neededExamScore <= 90) {
    difficulty = 'challenging';
    tip = `⚡ 期末卷面需要考 ${neededExamScore} 分！属于较高要求，建议结合历年卷和老师划重点全力突击。`;
  } else {
    difficulty = 'extreme';
    tip = `🔥 期末卷面需要考 ${neededExamScore} 分（接近满分）！建议重点攻克大题拉分点，稳住平时分。`;
  }

  return {
    usualScore: usual,
    usualWeightPercent,
    targetScore: target,
    usualContribution: Math.round(usualContribution * 10) / 10,
    examWeightPercent: Math.round(wExam * 100),
    neededExamScore: Math.max(0, neededExamScore),
    neededForPass60,
    neededForExcellent85: Math.max(0, neededForExcellent85),
    possible,
    alreadyEnough,
    difficulty,
    tip,
  };
}

/**
 * 从多行文本智能解析课程数据
 * 兼容格式：
 * 高等数学 88 4
 * 大学英语, 92, 2
 * 88, 4
 */
export function parseCoursesText(text: string): CourseEntry[] {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const results: CourseEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 切割逗号、制表符、分号或多个空格
    const parts = line.split(/[,，;；\t]+/).map((s) => s.trim()).filter(Boolean);

    if (parts.length >= 3) {
      // 课程名 成绩 学分 或 课程名 学分 成绩
      const name = parts[0];
      const p1 = parseFloat(parts[1]);
      const p2 = parseFloat(parts[2]);
      if (!isNaN(p1) && !isNaN(p2)) {
        // 通常成绩 > 10，学分 <= 10
        let score = p1;
        let credits = p2;
        if (p1 <= 15 && p2 > 15) {
          credits = p1;
          score = p2;
        }
        results.push({ id: `c-${i + 1}`, name, score, credits });
      }
    } else if (parts.length === 2) {
      // 可能是 成绩, 学分 或 课程名, 成绩 (默认3学分)
      const n1 = parseFloat(parts[0]);
      const n2 = parseFloat(parts[1]);
      if (!isNaN(n1) && !isNaN(n2)) {
        results.push({ id: `c-${i + 1}`, name: `课程 ${i + 1}`, score: n1, credits: n2 });
      } else if (isNaN(n1) && !isNaN(n2)) {
        results.push({ id: `c-${i + 1}`, name: parts[0], score: n2, credits: 3.0 });
      }
    } else {
      // 单行可能用空格分割: 高等数学 88 4
      const spaceParts = line.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      if (spaceParts.length >= 3) {
        const name = spaceParts[0];
        const s = parseFloat(spaceParts[1]);
        const c = parseFloat(spaceParts[2]);
        if (!isNaN(s) && !isNaN(c)) {
          results.push({ id: `c-${i + 1}`, name, score: s, credits: c });
        }
      } else if (spaceParts.length === 2) {
        const s = parseFloat(spaceParts[0]);
        const c = parseFloat(spaceParts[1]);
        if (!isNaN(s) && !isNaN(c)) {
          results.push({ id: `c-${i + 1}`, name: `课程 ${i + 1}`, score: s, credits: c });
        }
      }
    }
  }

  return results;
}

/**
 * 格式化为方便复制给辅导员或申请表填写的结构化成绩单摘要
 */
export function formatGpaReport(summary: GpaCalculationResult, scaleName: string): string {
  const lines: string[] = [
    `🎓 【大学 GPA 与成绩单测算报告】`,
    `----------------------------------------`,
    `• 平均学分绩点 (GPA): ${summary.weightedGpa.toFixed(2)} / ${summary.scaleMaxPoint.toFixed(1)}`,
    `• 加权平均分: ${summary.weightedAverageScore.toFixed(2)} 分`,
    `• 算术平均分: ${summary.arithmeticMeanScore.toFixed(2)} 分`,
    `• 修读总学分: ${summary.totalCredits.toFixed(1)} 学分（已获 ${summary.passedCredits.toFixed(1)} 学分）`,
    `• 计算规则: ${scaleName}`,
    `• 综合学业评定: ${summary.standing}`,
    `----------------------------------------`,
    `【课程明细 (${summary.courses.length} 门)】:`,
  ];

  summary.courses.forEach((c, idx) => {
    lines.push(
      `${idx + 1}. ${c.name} | ${c.score}分 | ${c.credits}学分 | 绩点 ${c.point.toFixed(2)}`
    );
  });

  lines.push(`----------------------------------------`);
  lines.push(`* 本报告由 NOVIP (novip.site) 纯本地计算生成，数据未上传服务器，请以本校教务处官方系统最终出分为准。`);

  return lines.join('\n');
}
