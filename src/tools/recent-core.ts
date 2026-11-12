import {tools, type ToolID} from './registry.ts';

export const RECENT_KEY = 'zhijian-recent-tools-v1';
export const MAX_RECENT_TOOLS = 3;

/**
 * 判断是否为有效的工具 ID
 */
export function isValidToolId(id: unknown): id is ToolID {
  if (typeof id !== 'string') return false;
  if (id === 'home' || id === 'stats' || id === 'not-found') return false;
  return tools.some((t) => t.id === id);
}

/**
 * 记录最近使用过的工具
 * 记住最近使用的 3 个工具，后访问的置于首位，自动去重
 */
export function recordRecentTool(
  toolId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): ToolID[] {
  if (!isValidToolId(toolId)) {
    return getRecentTools(storage);
  }

  const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  const current = getRecentTools(s, 10);
  const next = [toolId, ...current.filter((id) => id !== toolId)].slice(0, MAX_RECENT_TOOLS);

  try {
    s?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 浏览器无痕模式或禁用本地存储时静默降级 */
  }

  return next;
}

/**
 * 获取最近使用过的工具列表（默认最多 3 个）
 */
export function getRecentTools(
  storage?: Pick<Storage, 'getItem'>,
  limit: number = MAX_RECENT_TOOLS
): ToolID[] {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return [];
    const raw = s.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidToolId).slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

/**
 * 获取最新一次使用的工具（供首页一键「继续上次」快捷入口使用）
 */
export function getLastUsedTool(
  storage?: Pick<Storage, 'getItem'>
): ToolID | undefined {
  const list = getRecentTools(storage, 1);
  return list[0];
}

/**
 * 清除最近使用记录
 */
export function clearRecentTools(
  storage?: Pick<Storage, 'removeItem'>
): boolean {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return false;
    s.removeItem(RECENT_KEY);
    return true;
  } catch {
    return false;
  }
}
