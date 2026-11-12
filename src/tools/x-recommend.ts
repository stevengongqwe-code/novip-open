/**
 * x-recommend.ts
 * NOVIP 智能推荐与候选排序引擎（灵感源自 X / Twitter 开源推荐算法 twitter/the-algorithm）
 *
 * 核心设计：
 * 1. 100% 浏览器本地隐私保护：行为数据存储于本地 localStorage，不传输任何字节到外部服务器；
 * 2. RealGraph 交互图谱：追踪用户本地行为加权（浏览 1.0, 复制 2.5, 保存 4.0, 收藏 5.0）与时间衰减（Exponential Decay）；
 * 3. TwHIN / 任务协同图（Co-occurrence Affinity Graph）：根据大学生真实学业流转关系计算工具转移亲和力；
 * 4. 时序与校历先验（Temporal Heuristics）：自动识别工作日/周末、上课时段、开学/期末高频场景；
 * 5. 重排打分与多样性过滤（Heavy Ranker & Diversity Filter）：确保推荐流丰富可解释，每项附带专属“推荐理由”。
 */

import { tools, type ToolID } from './registry';

export interface UserToolStat {
  opens: number;
  copies: number;
  saves: number;
  lastUsed: number;
}

export type RealGraphStore = Record<string, UserToolStat>;

export const REALGRAPH_STORAGE_KEY = 'novip_realgraph_v1';

// 权重体系（参考 X Algorithm Engagement Weights）
const WEIGHT_OPEN = 1.0;
const WEIGHT_COPY = 2.5;
const WEIGHT_SAVE = 4.0;
const HALF_LIFE_DAYS = 5; // 5天半衰期

/**
 * 记录用户本地工具交互（仅存本地，绝不联网）
 */
export function recordRealGraphAction(
  toolId: string,
  action: 'open' | 'copy' | 'save',
  now = Date.now(),
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = localStorage.getItem(REALGRAPH_STORAGE_KEY);
    const store: RealGraphStore = raw ? JSON.parse(raw) : {};
    const curr = store[toolId] || { opens: 0, copies: 0, saves: 0, lastUsed: 0 };

    if (action === 'open') curr.opens += 1;
    if (action === 'copy') curr.copies += 1;
    if (action === 'save') curr.saves += 1;
    curr.lastUsed = now;

    store[toolId] = curr;
    localStorage.setItem(REALGRAPH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* 本地存储受限时静默跳过 */
  }
}

export function readRealGraphStore(): RealGraphStore {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(REALGRAPH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 工具协同亲和矩阵（TwHIN / Task Graph Affinity）
 * 映射真实大学生的学业任务递进关系
 */
export const TASK_AFFINITY_GRAPH: Record<string, Partial<Record<ToolID, number>>> = {
  // 证件照与材料
  photo: { background: 0.95, materials: 0.85, 'pdf-page-number': 0.6, images: 0.7 },
  background: { photo: 0.95, materials: 0.7, images: 0.75 },
  materials: { photo: 0.85, 'docx-check': 0.8, 'file-organizer': 0.75 },

  // 课件与排版
  'ppt-extract': { handwrite: 0.85, images: 0.9, ppt: 0.8, 'docx-check': 0.75, stitch: 0.7 },
  ppt: { 'ppt-extract': 0.85, files: 0.75, images: 0.8 },
  handwrite: { 'ppt-extract': 0.8, references: 0.75, text: 0.7 },

  // 论文与学术
  references: { 'docx-check': 0.95, compare: 0.85, text: 0.8, course: 0.75 },
  'docx-check': { references: 0.95, compare: 0.9, text: 0.85 },
  compare: { 'docx-check': 0.9, references: 0.8, text: 0.75 },
  course: { references: 0.8, 'docx-check': 0.8, lab: 0.7 },

  // PDF 与打印
  files: { 'pdf-watermark': 0.9, 'pdf-crop': 0.85, 'batch-pdf': 0.8, 'pdf-page-number': 0.85 },
  'pdf-crop': { files: 0.85, 'pdf-page-number': 0.9, 'pdf-watermark': 0.8 },
  'pdf-page-number': { 'pdf-crop': 0.9, files: 0.85, 'pdf-watermark': 0.8 },
  'pdf-watermark': { 'image-watermark': 0.9, files: 0.85, privacy: 0.75 },
  'image-watermark': { 'pdf-watermark': 0.9, privacy: 0.8, photo: 0.75 },

  // 班委与教务
  timetable: { 'leave-helper': 0.9, 'material-collector': 0.85, 'college-nav': 0.8, grades: 0.75 },
  'leave-helper': { timetable: 0.9, 'college-nav': 0.75 },
  'material-collector': { 'file-organizer': 0.95, sheets: 0.85, 'table-clean': 0.8 },
  'file-organizer': { 'material-collector': 0.95, sheets: 0.8, 'table-clean': 0.75 },
  sheets: { 'table-clean': 0.9, 'material-collector': 0.85, 'file-organizer': 0.8 },
  'table-clean': { sheets: 0.9, 'material-collector': 0.8 },

  // 实用与计算
  finance: { cost: 0.85, health: 0.8, timestamp: 0.7 },
  health: { finance: 0.8, 'color-picker': 0.7 },
  'color-picker': { stitch: 0.85, background: 0.8, images: 0.75 },
  stitch: { 'color-picker': 0.85, images: 0.9, 'image-watermark': 0.75 },
  timestamp: { developer: 0.9, text: 0.75 },
  developer: { timestamp: 0.9, text: 0.8 },
  ocr: { text: 0.9, 'docx-check': 0.8, scan: 0.85 },
  scan: { ocr: 0.85, files: 0.8, 'pdf-crop': 0.75 },
};

export interface ForYouItem {
  id: ToolID;
  score: number;
  reason: string;
  badge: string;
}

/**
 * 依据时间与星期计算校园时序先验偏置（Temporal Prior）
 */
export function getTemporalBiases(date = new Date()): Record<string, { boost: number; reason: string }> {
  const day = date.getDay(); // 0 is Sunday, 1 is Monday...
  const hour = date.getHours();
  const biases: Record<string, { boost: number; reason: string }> = {};

  // 周日晚间或周一清晨：重点关注新一周排课、请假与材料收集
  if (day === 0 || (day === 1 && hour < 12)) {
    biases.timetable = { boost: 2.2, reason: '新一周课表查阅高峰' };
    biases['leave-helper'] = { boost: 1.8, reason: '周初请假申请准备' };
    biases['material-collector'] = { boost: 1.7, reason: '班委周初收发作业' };
  }

  // 工作日白天（周一至周五 9:00 - 18:00）：课件提取、文献、PDF、文件转换
  if (day >= 1 && day <= 5 && hour >= 8 && hour <= 19) {
    biases['ppt-extract'] = { boost: 2.0, reason: '课后复习课件提图' };
    biases.references = { boost: 1.8, reason: '大作业文献格式排版' };
    biases['docx-check'] = { boost: 1.6, reason: '作业论文格式核验' };
    biases.files = { boost: 1.5, reason: '学业文档格式互转' };
  }

  // 晚间与周末：证件照、长图拼接、取色、健康、理财规划
  if (day === 6 || day === 0 || hour >= 20 || hour < 6) {
    biases.photo = { boost: 1.9, reason: '课余报名照快速剪裁' };
    biases.background = { boost: 1.7, reason: '证件照智能换底' };
    biases.stitch = { boost: 1.8, reason: '长截图与活动海报拼接' };
    biases['color-picker'] = { boost: 1.6, reason: '社团海报与设计取色' };
    biases.health = { boost: 1.5, reason: '生活与运动参考计算' };
    biases.finance = { boost: 1.4, reason: '生活费记账与利息测算' };
  }

  return biases;
}

/**
 * X 算法重排器：生成智能“为你推荐 (For You)”流
 */
export function generateForYouFeed(
  store: RealGraphStore = readRealGraphStore(),
  now = Date.now(),
  limit = 8,
): ForYouItem[] {
  const temporal = getTemporalBiases(new Date(now));
  const scores = new Map<ToolID, { score: number; reason: string; badge: string }>();

  // 1. 基底热度与全站高频种子
  const defaultSeeds: ToolID[] = [
    'ppt-extract',
    'photo',
    'timetable',
    'files',
    'references',
    'pdf-watermark',
    'material-collector',
    'stitch',
  ];

  for (const id of defaultSeeds) {
    scores.set(id, {
      score: 1.2,
      reason: '大学高频必备工具',
      badge: '精选',
    });
  }

  // 2. 时序先验加权
  for (const [id, info] of Object.entries(temporal)) {
    const toolId = id as ToolID;
    const existing = scores.get(toolId) || { score: 1.0, reason: '', badge: '推荐' };
    scores.set(toolId, {
      score: existing.score + info.boost,
      reason: info.reason,
      badge: '时效',
    });
  }

  // 3. 用户历史 RealGraph 加权与时间衰减
  const userInteractedEntries = Object.entries(store).filter(
    ([, stat]) => stat.opens > 0 || stat.copies > 0 || stat.saves > 0,
  );

  for (const [id, stat] of userInteractedEntries) {
    const toolId = id as ToolID;
    const daysSince = Math.max(0, (now - stat.lastUsed) / (1000 * 60 * 60 * 24));
    const decay = Math.pow(0.5, daysSince / HALF_LIFE_DAYS);

    const engagementVal =
      stat.opens * WEIGHT_OPEN +
      stat.copies * WEIGHT_COPY +
      stat.saves * WEIGHT_SAVE;

    const userSelfBoost = Math.min(engagementVal * decay * 0.4, 5.0);

    // 给自己加分
    const existing = scores.get(toolId) || { score: 1.0, reason: '', badge: '常备' };
    scores.set(toolId, {
      score: existing.score + userSelfBoost,
      reason: '你最近经常使用',
      badge: '常备',
    });

    // 4. 亲和图谱外溢扩散（Graph Affinity Diffusion）
    const affinities = TASK_AFFINITY_GRAPH[id] || {};
    for (const [affId, affWeight] of Object.entries(affinities)) {
      const targetId = affId as ToolID;
      if (affWeight === undefined) continue;
      const spreadBoost = userSelfBoost * affWeight * 0.85;
      const targetExisting = scores.get(targetId) || { score: 1.0, reason: '', badge: '搭配' };

      const sourceTool = tools.find((t) => t.id === toolId);
      const affReason = sourceTool ? `搭配你用过的【${sourceTool.name}】` : '相关搭配推荐';

      if (spreadBoost > 0.5) {
        scores.set(targetId, {
          score: targetExisting.score + spreadBoost,
          reason: affReason,
          badge: '搭配',
        });
      }
    }
  }

  // 5. 排序与多样性重排（Diversity Reranking，同一分组最多展示 2 款）
  const allRanked: ForYouItem[] = Array.from(scores.entries())
    .map(([id, info]) => ({
      id,
      score: info.score,
      reason: info.reason || '校园推荐',
      badge: info.badge || '精选',
    }))
    .sort((a, b) => b.score - a.score);

  const selected: ForYouItem[] = [];
  const groupCount: Record<string, number> = {};

  for (const item of allRanked) {
    const toolObj = tools.find((t) => t.id === item.id);
    if (!toolObj) continue;
    const g = toolObj.group;
    if ((groupCount[g] || 0) >= 2 && selected.length < limit - 1) {
      continue; // 降权同一类别，保持推荐多样性
    }
    selected.push(item);
    groupCount[g] = (groupCount[g] || 0) + 1;
    if (selected.length >= limit) break;
  }

  // 兜底补足
  if (selected.length < limit) {
    for (const t of tools) {
      if (!selected.some((s) => s.id === t.id)) {
        selected.push({
          id: t.id,
          score: 1.0,
          reason: '发现更多实用工具',
          badge: '探索',
        });
        if (selected.length >= limit) break;
      }
    }
  }

  return selected;
}
