// 本机使用统计：只写入当前浏览器 localStorage，不发往任何服务器。
// 仅保存工具编号、次数与时间，不保存文件名、正文、图片或身份信息。
const KEY = 'novip_local_usage_v1';
const MAX_TOOLS = 60;

export interface LocalUsage {
  since: string;
  pageviews: number;
  tools: Record<string, number>;
  lastAt: string;
}

const empty = (): LocalUsage => ({since: new Date().toISOString(), pageviews: 0, tools: {}, lastAt: ''});

export function readLocalUsage(): LocalUsage {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<LocalUsage>;
    if (!data || typeof data !== 'object') return empty();
    const tools: Record<string, number> = {};
    if (data.tools && typeof data.tools === 'object') {
      for (const [id, count] of Object.entries(data.tools)) {
        if (/^[a-z0-9-]{1,40}$/.test(id) && typeof count === 'number' && Number.isFinite(count) && count >= 0) {
          tools[id] = Math.min(count, 999999);
        }
      }
    }
    return {
      since: typeof data.since === 'string' && Number.isFinite(Date.parse(data.since)) ? data.since : new Date().toISOString(),
      pageviews: typeof data.pageviews === 'number' && Number.isFinite(data.pageviews) ? Math.min(Math.max(0, data.pageviews), 9999999) : 0,
      tools,
      lastAt: typeof data.lastAt === 'string' && Number.isFinite(Date.parse(data.lastAt)) ? data.lastAt : '',
    };
  } catch {
    return empty();
  }
}

/** 记录一次页面访问；page 为工具编号或 home / stats。存储不可用时静默跳过。 */
export function recordLocalUsage(page: string): void {
  try {
    const usage = readLocalUsage();
    usage.pageviews = Math.min(usage.pageviews + 1, 9999999);
    usage.lastAt = new Date().toISOString();
    if (page && page !== 'home' && page !== 'stats') {
      const keys = Object.keys(usage.tools);
      if (keys.length >= MAX_TOOLS && !(page in usage.tools)) return;
      usage.tools[page] = Math.min((usage.tools[page] ?? 0) + 1, 999999);
    }
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    /* 隐私模式或存储已满：不影响工具本身。 */
  }
}

export function clearLocalUsage(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
