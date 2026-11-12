/**
 * 考研初试与复试成绩折算器 · 核心计算与逆袭推算引擎
 * 支持 500/300 初试分制，5:5 / 6:4 / 7:3 等院校权重，计算最终综合成绩与复试最低逆袭分
 */

export interface PostgradWeightOption {
  id: string;
  label: string;
  initialWeight: number; // e.g. 0.5, 0.6, 0.7
  reExamWeight: number;  // e.g. 0.5, 0.4, 0.3
}

export const WEIGHT_PRESETS: PostgradWeightOption[] = [
  {id: '50_50', label: '初试 50% + 复试 50% (初复试等重)', initialWeight: 0.5, reExamWeight: 0.5},
  {id: '60_40', label: '初试 60% + 复试 40% (多数综合性大学)', initialWeight: 0.6, reExamWeight: 0.4},
  {id: '70_30', label: '初试 70% + 复试 30% (重初试基础)', initialWeight: 0.7, reExamWeight: 0.3},
  {id: '40_60', label: '初试 40% + 复试 60% (重复试能力/艺术工科)', initialWeight: 0.4, reExamWeight: 0.6},
];

export interface ScoreInput {
  initialScore: number;       // 学生初试得分 (e.g. 360)
  initialMaxScore: number;    // 初试满分 (通常 500，管综 300)
  reExamScore?: number;       // 学生复试得分 (可选)
  reExamMaxScore: number;     // 复试满分 (通常 100 或 500)
  weightPresetId: string;     // 权重方案
  targetCompositeScore?: number; // 目标录取综合分 (用于逆袭反推)
}

export interface ScoreResult {
  initialConvertedPercent: number; // 初试百分制得分
  initialContribution: number;    // 初试折算贡献分
  reExamConvertedPercent: number;  // 复试百分制得分
  reExamContribution: number;     // 复试折算贡献分
  finalCompositeScore: number;    // 最终百分制综合分 (满分100)
  reExamNeededForTarget?: number; // 达到目标综合分所需的最低复试原始分
  isTargetReachable: boolean;
  statusAdvice: string;
}

export function calculatePostgradScore(input: ScoreInput): ScoreResult {
  const initialMax = Math.max(1, input.initialMaxScore || 500);
  const reExamMax = Math.max(1, input.reExamMaxScore || 100);
  const initialScore = Math.max(0, Math.min(input.initialScore, initialMax));
  
  const preset = WEIGHT_PRESETS.find((w) => w.id === input.weightPresetId) || WEIGHT_PRESETS[0];

  // 百分制折算
  const initialPercent = (initialScore / initialMax) * 100;
  const initialContrib = initialPercent * preset.initialWeight;

  let reExamPercent = 0;
  let reExamContrib = 0;
  let finalScore = initialContrib;

  if (typeof input.reExamScore === 'number' && !isNaN(input.reExamScore)) {
    const rawReExam = Math.max(0, Math.min(input.reExamScore, reExamMax));
    reExamPercent = (rawReExam / reExamMax) * 100;
    reExamContrib = reExamPercent * preset.reExamWeight;
    finalScore = initialContrib + reExamContrib;
  }

  // 逆袭反推
  let reExamNeeded: number | undefined;
  let isTargetReachable = true;
  let statusAdvice = '初试折算完成，请输入复试成绩或目标分以测算逆袭线。';

  if (typeof input.targetCompositeScore === 'number' && !isNaN(input.targetCompositeScore)) {
    const neededContrib = input.targetCompositeScore - initialContrib;
    if (neededContrib <= 0) {
      reExamNeeded = 0;
      statusAdvice = '初试优势极大！复试正常及格即可稳稳上岸。';
    } else {
      const neededPercent = neededContrib / preset.reExamWeight;
      const rawNeeded = (neededPercent / 100) * reExamMax;
      reExamNeeded = Math.round(rawNeeded * 100) / 100;

      if (rawNeeded > reExamMax) {
        isTargetReachable = false;
        statusAdvice = `目标分需要复试 ${reExamNeeded} 分（超出满分 ${reExamMax}），建议适当调整冲刺目标。`;
      } else if (rawNeeded >= reExamMax * 0.85) {
        statusAdvice = `需要复试考到 ${reExamNeeded} 分以上（难度较高），务必强化专业课面试与英语口语！`;
      } else {
        statusAdvice = `复试需考到 ${reExamNeeded} 分（约合百分制 ${Math.round(neededPercent)} 分），完全在可控逆袭区间内！`;
      }
    }
  }

  return {
    initialConvertedPercent: Math.round(initialPercent * 100) / 100,
    initialContribution: Math.round(initialContrib * 100) / 100,
    reExamConvertedPercent: Math.round(reExamPercent * 100) / 100,
    reExamContribution: Math.round(reExamContrib * 100) / 100,
    finalCompositeScore: Math.round(finalScore * 100) / 100,
    reExamNeededForTarget: reExamNeeded,
    isTargetReachable,
    statusAdvice,
  };
}
