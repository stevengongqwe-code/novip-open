/**
 * NOVIP 首次访问欢迎提示状态管理
 * 使用 localStorage 持久化记录用户关闭状态；兼容私有模式与无 storage 环境。
 */

export const WELCOME_KEY = 'novip-welcome-v1';

export function isWelcomeDismissed(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return false;
    return s.getItem(WELCOME_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissWelcome(storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return false;
    s.setItem(WELCOME_KEY, 'dismissed');
    return true;
  } catch {
    return false;
  }
}

export function resetWelcome(storage?: Pick<Storage, 'removeItem'>): boolean {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return false;
    s.removeItem(WELCOME_KEY);
    return true;
  } catch {
    return false;
  }
}
