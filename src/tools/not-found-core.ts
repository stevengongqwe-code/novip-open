import {tools, type ToolID} from './registry';
import {getToolPitch} from './share-core';

export const NOT_FOUND_TITLE = '这里没有 VIP，也没有这个页面';
export const NOT_FOUND_SUBTITLE = '你可能访问了失效的链接，或者这个页面已经调整了地址。';
export const NOT_FOUND_ATTITUDE =
  '在 NOVIP，你找不到充值 VIP 的弹窗，也找不到这个页面。不过既然来了，别空手而归——下面这些完全免费、无需登录、不加水印的高频工具，也许正好能解你的燃眉之急：';

/**
 * 404 与错误页面推荐的高频急救工具清单（反 VIP 核心痛点）
 */
export const POPULAR_RECOMMENDED_IDS: ToolID[] = [
  'pdf-compress',
  'pdf-merge-split',
  'photo-check',
  'files',
  'references',
  'handwrite',
];

export interface RecommendedTool {
  id: ToolID;
  name: string;
  path: string;
  pitch: string;
  group: string;
}

/**
 * 获取 404 页面推荐的热门急救工具列表
 */
export function getPopularTools(limit: number = 6): RecommendedTool[] {
  const result: RecommendedTool[] = [];

  for (const id of POPULAR_RECOMMENDED_IDS) {
    const t = tools.find((item) => item.id === id);
    if (t) {
      result.push({
        id: t.id,
        name: t.name,
        path: t.path,
        pitch: getToolPitch(t.id),
        group: t.group,
      });
    }
  }

  // 兜底补齐：若有未配置项，按 tools 原始顺序填充高频工具
  if (result.length < limit) {
    for (const t of tools) {
      if (!result.some((r) => r.id === t.id)) {
        result.push({
          id: t.id,
          name: t.name,
          path: t.path,
          pitch: getToolPitch(t.id),
          group: t.group,
        });
        if (result.length >= limit) break;
      }
    }
  }

  return result.slice(0, Math.max(1, limit));
}
