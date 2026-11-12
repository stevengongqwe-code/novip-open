/**
 * PinnedTools Core — 大学生个性化常备工具箱本地持久化引擎
 * 纯本地 localStorage，0 服务器上传，0 隐私跟踪
 */

export const PINNED_STORAGE_KEY = 'novip_pinned_tools_v1';
export const DEFAULT_PINNED: string[] = ['photo', 'pdf-merge-split', 'files', 'ai'];

export function getStoredPinnedTools(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_PINNED];
  }
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [...DEFAULT_PINNED];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_PINNED];
  } catch {
    return [...DEFAULT_PINNED];
  }
}

export function togglePinnedTool(toolId: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_PINNED];
  }
  const current = getStoredPinnedTools();
  let updated: string[];
  if (current.includes(toolId)) {
    updated = current.filter((id) => id !== toolId);
  } else {
    updated = [...current, toolId];
  }
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('novip:pinned-tools-change', {detail: updated}));
  } catch {}
  return updated;
}

export function isToolPinned(toolId: string): boolean {
  return getStoredPinnedTools().includes(toolId);
}
