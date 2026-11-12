/**
 * NOVIP 验证门户 —— 核心自检逻辑（纯逻辑，无 React）
 *
 * 背景（站主 2026-10-31 二次澄清）：「验证门户」针对的是 **Mac 上的 Claude 桌面应用**
 * （/Applications/Claude.app，com.anthropic.claudefordesktop），不是 NOVIP 线上站点自检。
 * 站主拿到的手工验证流程要开终端、跑脚本、看日志，自己跑不动；所以收敛成页面上「点一下就能看」的纯函数。
 *
 * 页面主线只有两组：
 *  - local      「Claude 本机体检」：读取站主拖进来的 claude-check.json（由本地脚本生成）；
 *  - capability 「浏览器本地能力」：这组是浏览器**真正能自检**的部分（NOVIP 网页能不能干活）。
 *
 * 设计约束：
 * 1. 不 import React、不碰 DOM 全局（只在能力探针内部做防御式检测），可被 `node --test` 直接 import；
 * 2. 所有失败路径都必须「返回结果」而不是抛错——自检本身出错不能白屏；
 * 3. 只做同源 GET，不写任何数据、不上传任何文件内容；
 * 4. 注释与面向用户的文案全部为中文；
 * 5. 浏览器出于安全限制永远读不到本机进程信息（安装路径、签名、登录态），
 *    这类检查只能由本地脚本完成，页面只负责解析并展示其结果——绝不假装检测过。
 */

// ─────────────────────────── 基础类型 ───────────────────────────

/** 单项自检状态：通过 / 需要留意 / 不通 / 跳过（本浏览器不支持或未执行） */
export type VerifyStatus = 'pass' | 'warn' | 'fail' | 'skip';

/**
 * 自检分类。
 * 页面主线只有 local + capability 两组；
 * version / assets / seo 是 NOVIP 线上站点自检的遗留分类，**保留导出但页面不展示**
 * （Lead 已明确：线上站点自检不是站主这次要的，相关函数保留以免破坏既有调用方）。
 */
export type VerifyCategory = 'local' | 'capability' | 'version' | 'assets' | 'seo';

/** 分类的中文标题（UI 分组直接复用，避免两处写死不一致） */
export const CATEGORY_LABELS: Record<VerifyCategory, string> = {
  local: 'Claude 本机体检',
  capability: '浏览器本地能力',
  version: '构建与版本',
  assets: '静态资源可达性',
  seo: 'SEO 产物',
};

/** 页面主线的展示顺序（只含两组；其它分类不进 UI） */
export const CATEGORY_ORDER: VerifyCategory[] = ['local', 'capability'];

/** 全部分类的顺序（导出报告用；包含保留分类，顺序稳定便于前后对比） */
export const ALL_CATEGORY_ORDER: VerifyCategory[] = ['local', 'capability', 'version', 'assets', 'seo'];

/** 单项自检结果 */
export interface VerifyItem {
  /** 稳定标识，形如 `asset:/robots.txt`、`seo:h1`、`cap:wasm` */
  id: string;
  category: VerifyCategory;
  /** 中文标题，直接展示给站主 */
  title: string;
  status: VerifyStatus;
  /** 中文详情：通过了什么 / 哪一项不对 */
  detail: string;
  /** 失败或留意时的「下一步」建议（中文，人话） */
  suggestion?: string;
  /** 本项耗时（毫秒） */
  ms?: number;
  /** 响应体字节数（仅资源类有） */
  bytes?: number;
  /** HTTP 状态码（仅资源类有；0 表示网络层失败、未拿到响应） */
  httpStatus?: number;
}

/** 整体结论：ready 全部通过 / attention 有注意项但无失败 / blocked 有失败项 */
export type VerifyVerdict = 'ready' | 'attention' | 'blocked';

/** 汇总计数 */
export interface VerifySummary {
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  total: number;
}

/** 部署信息：只有走正式部署流程才会生成 /deploy-info.json */
export interface DeployInfo {
  commit?: string;
  runId?: string;
  deployedAt?: string;
  /** production = 读到部署信息；local = 本地预览/开发或文件缺失 */
  source?: 'production' | 'local';
  raw?: unknown;
}

/** 完整自检报告（UI 渲染与导出 Markdown 的唯一数据源） */
export interface VerifyReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  origin: string;
  userAgent: string;
  deployInfo: DeployInfo | null;
  items: VerifyItem[];
  summary: VerifySummary;
  verdict: VerifyVerdict;
}

// ─────────────────────────── 本机体检报告（Claude 桌面应用） ───────────────────────────

/**
 * 本地脚本产出的单条体检项。
 * 注意 status 不含 'skip'：本地脚本要么检查了、要么没检查，没检查的项干脆不输出。
 */
export interface LocalCheckItem {
  id: string;
  title: string;
  status: VerifyStatus;
  detail: string;
  suggestion?: string;
}

/** 本机体检报告的 schema 标识，用于校验拖入的文件是不是我们约定的那份 */
export const LOCAL_REPORT_SCHEMA = 'novip-claude-check/v1';

/** 本地脚本生成的体检报告格式（claude-check.json） */
export interface LocalCheckReport {
  schema: 'novip-claude-check/v1';
  generatedAt: string;
  app: {
    path: string;
    bundleId: string;
    version: string;
    electron?: string;
    arch?: string;
  };
  signature?: {
    valid: boolean;
    authority?: string;
    notarized?: boolean;
    hardenedRuntime?: boolean;
  };
  items: LocalCheckItem[];
}

/** parseLocalCheckReport 的结果：成功带 report，失败带中文原因，永不抛错 */
export type ParseLocalReportResult =
  | {ok: true; report: LocalCheckReport}
  | {ok: false; error: string};

/** 安全取字符串字段：非字符串或空串返回 undefined */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** 安全取布尔字段：非布尔返回 undefined */
function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * 解析站主从本地脚本拖进来的 claude-check.json。
 * 非法 JSON、schema 不匹配、items 不是数组、必填字段缺失 → 返回 {ok:false, error: 中文原因}。
 * **任何情况都不抛错**：站主随手拖错一个文件，页面也必须给出人话提示而不是白屏。
 */
export function parseLocalCheckReport(text: string): ParseLocalReportResult {
  if (typeof text !== 'string' || !text.trim()) {
    return {ok: false, error: '内容是空的：请确认拖进来的是 claude-check.json 这个文件本身。'};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {ok: false, error: '这不是有效的 JSON 文件，可能是拖错了文件，或者文件在被复制时被改坏了。'};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {ok: false, error: '文件内容不是一份体检报告（顶层应是 JSON 对象）。'};
  }
  const record = parsed as Record<string, unknown>;

  const schema = optionalString(record.schema);
  if (schema !== LOCAL_REPORT_SCHEMA) {
    return {
      ok: false,
      error: `版本对不上：需要 ${LOCAL_REPORT_SCHEMA} 格式的报告${schema ? `，但这份是 ${schema}` : '，但这份没有版本标识'}。请用最新版「Claude 体检.command」重新生成。`,
    };
  }

  const generatedAt = optionalString(record.generatedAt);
  if (!generatedAt) {
    return {ok: false, error: '报告缺少生成时间（generatedAt），无法判断是不是最新一次体检的结果。'};
  }

  const appRaw = record.app;
  if (!appRaw || typeof appRaw !== 'object' || Array.isArray(appRaw)) {
    return {ok: false, error: '报告缺少应用信息（app 字段），请重新运行一次「Claude 体检.command」。'};
  }
  const appRecord = appRaw as Record<string, unknown>;
  const appPath = optionalString(appRecord.path);
  const bundleId = optionalString(appRecord.bundleId);
  const version = optionalString(appRecord.version);
  const missingApp = [
    appPath ? null : '应用路径（app.path）',
    bundleId ? null : '应用标识（app.bundleId）',
    version ? null : '版本号（app.version）',
  ].filter(Boolean);
  if (missingApp.length > 0) {
    return {ok: false, error: `报告的应用信息不完整，缺少：${missingApp.join('、')}。`};
  }

  const itemsRaw = record.items;
  if (!Array.isArray(itemsRaw)) {
    return {ok: false, error: '报告缺少检查项列表（items 应为数组），请重新运行一次「Claude 体检.command」。'};
  }

  const items: LocalCheckItem[] = [];
  for (let index = 0; index < itemsRaw.length; index += 1) {
    const entry = itemsRaw[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {ok: false, error: `第 ${index + 1} 条检查项格式不对（应为对象）。`};
    }
    const itemRecord = entry as Record<string, unknown>;
    const id = optionalString(itemRecord.id);
    const title = optionalString(itemRecord.title);
    const detail = optionalString(itemRecord.detail);
    const status = optionalString(itemRecord.status);
    if (!id || !title || !detail) {
      return {ok: false, error: `第 ${index + 1} 条检查项缺少必填字段（id / title / detail）。`};
    }
    if (status !== 'pass' && status !== 'warn' && status !== 'fail' && status !== 'skip') {
      return {ok: false, error: `第 ${index + 1} 条检查项的状态「${status ?? '空'}」不合法，只能是 pass / warn / fail / skip。`};
    }
    items.push({id, title, status, detail, suggestion: optionalString(itemRecord.suggestion)});
  }

  let signature: LocalCheckReport['signature'];
  const signatureRaw = record.signature;
  if (signatureRaw && typeof signatureRaw === 'object' && !Array.isArray(signatureRaw)) {
    const signatureRecord = signatureRaw as Record<string, unknown>;
    const valid = optionalBoolean(signatureRecord.valid);
    if (typeof valid === 'boolean') {
      signature = {
        valid,
        authority: optionalString(signatureRecord.authority),
        notarized: optionalBoolean(signatureRecord.notarized),
        hardenedRuntime: optionalBoolean(signatureRecord.hardenedRuntime),
      };
    }
  }

  return {
    ok: true,
    report: {
      schema: LOCAL_REPORT_SCHEMA,
      generatedAt,
      app: {
        path: appPath as string,
        bundleId: bundleId as string,
        version: version as string,
        electron: optionalString(appRecord.electron),
        arch: optionalString(appRecord.arch),
      },
      signature,
      items,
    },
  };
}

/** 没有本地报告时的固定文案（测试与 UI 都依赖它，避免两处写死不一致） */
export const LOCAL_REPORT_MISSING_DETAIL = '还没运行『Claude 体检.command』，Claude 桌面应用的安装、签名、登录与更新状态无法从浏览器读取';
export const LOCAL_REPORT_MISSING_SUGGESTION = '先下载并双击运行 Claude 体检.command，把桌面生成的 claude-check.json 拖回本页';

/**
 * 把本机体检报告转成页面展示用的检查项。
 * report 为 null（或 items 为空）时返回**恰好一条** skip 项：
 * 这不是错误，只是「还没做」，所以是 skip 而不是 fail，不能因此把整页判红。
 */
export function localCheckItems(report: LocalCheckReport | null): VerifyItem[] {
  if (!report) {
    return [{
      id: 'local:missing',
      category: 'local',
      title: '本机体检报告',
      status: 'skip',
      detail: LOCAL_REPORT_MISSING_DETAIL,
      suggestion: LOCAL_REPORT_MISSING_SUGGESTION,
    }];
  }
  if (report.items.length === 0) {
    return [{
      id: 'local:empty',
      category: 'local',
      title: '本机体检报告',
      status: 'skip',
      detail: '体检报告已读取，但里面没有任何检查项，可能是脚本这次没有生成有效结果。',
      suggestion: '重新双击运行一次 Claude 体检.command，再把新的 claude-check.json 拖回来。',
    }];
  }
  return report.items.map((entry) => ({
    id: entry.id.startsWith('local:') ? entry.id : `local:${entry.id}`,
    category: 'local',
    title: entry.title,
    status: entry.status,
    detail: entry.detail,
    suggestion: entry.suggestion,
  }));
}

/** 把本机报告里的应用/签名信息汇总成一条「概览」项（供 UI 顶部与报告使用） */
export function localOverviewItem(report: LocalCheckReport | null): VerifyItem {
  if (!report) {
    return {
      id: 'local:overview',
      category: 'local',
      title: '应用概览',
      status: 'skip',
      detail: '尚未读取本机体检报告，应用路径、版本与签名信息暂不可知。',
      suggestion: LOCAL_REPORT_MISSING_SUGGESTION,
    };
  }
  const parts = [`应用：${report.app.path}`, `版本 ${report.app.version}`, `标识 ${report.app.bundleId}`];
  if (report.app.arch) parts.push(`架构 ${report.app.arch}`);
  if (report.app.electron) parts.push(`Electron ${report.app.electron}`);
  if (report.signature) {
    parts.push(`签名${report.signature.valid ? '有效' : '无效'}${report.signature.authority ? `（${report.signature.authority}）` : ''}`);
    if (typeof report.signature.notarized === 'boolean') parts.push(`公证${report.signature.notarized ? '通过' : '未通过'}`);
  }
  const appFail = report.items.find((entry) => entry.status === 'fail');
  return {
    id: 'local:overview',
    category: 'local',
    title: '应用概览',
    status: report.signature && report.signature.valid === false ? 'fail' : appFail ? 'warn' : 'pass',
    detail: `${parts.join('，')}；体检时间 ${report.generatedAt}`,
  };
}

// ─────────────────────────── 可注入的 fetch ───────────────────────────

/** 资源响应：只声明我们实际用到的字段，便于测试用假对象替换 */
export interface VerifyResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers?: {get(name: string): string | null};
  arrayBuffer?(): Promise<ArrayBuffer>;
}

/** 可注入的请求函数；默认用 globalThis.fetch */
export type VerifyFetcher = (path: string) => Promise<VerifyResponse>;

/** 创建默认 fetcher：同源 GET，禁用缓存与凭据，避免读到 CDN 旧副本 */
export function createDefaultFetcher(): VerifyFetcher {
  return async (path: string): Promise<VerifyResponse> => {
    const response = await globalThis.fetch(path, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      headers: {accept: '*/*'},
    });
    return response;
  };
}

/** 安全取用 fetcher：调用方没传时退回默认实现 */
function resolveFetcher(fetcher?: VerifyFetcher): VerifyFetcher {
  return fetcher ?? createDefaultFetcher();
}

// ─────────────────────────── 计数与结论 ───────────────────────────

/**
 * 汇总各项状态计数。
 * 边界语义（测试会固化）：空数组 → 全部为 0、total 为 0，
 * 交给 verdictOf 得到的结论是 'ready'（「没有可检查的项目」不等于「出错」）。
 */
export function summarize(items: VerifyItem[]): VerifySummary {
  const summary: VerifySummary = {pass: 0, warn: 0, fail: 0, skip: 0, total: 0};
  for (const item of items) {
    if (item.status === 'pass') summary.pass += 1;
    else if (item.status === 'warn') summary.warn += 1;
    else if (item.status === 'fail') summary.fail += 1;
    else if (item.status === 'skip') summary.skip += 1;
  }
  summary.total = items.length;
  return summary;
}

/**
 * 由汇总计数得出结论。
 * 规则：任一 fail → 'blocked'；否则任一 warn → 'attention'；否则 → 'ready'。
 * skip 不参与投票（浏览器不支持某项能力，不代表站点不能用）。
 */
export function verdictOf(summary: VerifySummary): VerifyVerdict {
  if (summary.fail > 0) return 'blocked';
  if (summary.warn > 0) return 'attention';
  return 'ready';
}

/** 结论的中文一句话说明（UI 横幅与 Markdown 报告共用） */
export const VERDICT_TEXT: Record<VerifyVerdict, string> = {
  ready: '全部通过，可以放心交给同学使用。',
  attention: '基本可用，有几项需要留意，但不影响正常使用。',
  blocked: '有项目不通，先按下面的「下一步」处理，暂时先别推广给同学。',
};

// ─────────────────────────── 状态展示用中文文案 ───────────────────────────

/** 状态的中文名与图标（状态不能只靠颜色区分） */
export const STATUS_TEXT: Record<VerifyStatus, {label: string; icon: string}> = {
  pass: {label: '通过', icon: '✅'},
  warn: {label: '注意', icon: '⚠️'},
  fail: {label: '不通', icon: '❌'},
  skip: {label: '跳过', icon: '⏭️'},
};

// ─────────────────────────── 部署信息 ───────────────────────────

/** /deploy-info.json 的路径（运行时端点，构建产物里没有，部署流程写入） */
export const DEPLOY_INFO_PATH = '/deploy-info.json';

/** 把任意值收敛成「安全的短字符串」，避免把对象塞进报告 */
function pickString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * 读取部署信息。
 * - 200 且能解析成 JSON 对象 → source: 'production'，并尽力解析 commit / runId / deployedAt；
 * - 404、非 JSON、网络错误 → source: 'local'；
 * 永不抛错：没有 /deploy-info.json 是正常情况（本地预览、或部署流程未写入），不是站点故障。
 */
export async function collectDeployInfo(fetcher?: VerifyFetcher): Promise<DeployInfo> {
  try {
    const response = await resolveFetcher(fetcher)(DEPLOY_INFO_PATH);
    if (!response.ok || response.status < 200 || response.status >= 300) {
      return {source: 'local'};
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {source: 'local'};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {source: 'local'};
    const record = parsed as Record<string, unknown>;
    // 兼容常见写法：commit / sha / gitCommit，runId / run_id，deployedAt / deployed_at
    const commit = pickString(record.commit) ?? pickString(record.sha) ?? pickString(record.gitCommit);
    const runId = pickString(record.runId) ?? pickString(record.run_id);
    const deployedAt = pickString(record.deployedAt) ?? pickString(record.deployed_at);
    return {commit, runId, deployedAt, source: 'production', raw: parsed};
  } catch {
    return {source: 'local'};
  }
}

// ─────────────────────────── 静态资源可达性 ───────────────────────────

/** 期望的响应类型（仅用于文案与详情，不做严格 content-type 校验，避免误报） */
export type AssetExpect = 'html' | 'text' | 'xml' | 'binary';

/** 单个静态资源目标 */
export interface AssetTarget {
  path: string;
  title: string;
  expect: AssetExpect;
}

/**
 * 静态资源白名单。
 * 路径已与仓库现状核对：/robots.txt 与 /sitemap.xml 由 scripts/generate-seo.mjs 在构建时写入 dist；
 * /nav 与 /tools/* 是预渲染目录（dist/<path>/index.html）；/fonts/fonts-v4.css 与 /novip-logo.jpg 来自 public/。
 * 入门体检只检查「HTTP 是否可达」，不下载大文件：二进制资源只读响应头后立即丢弃响应体。
 */
export const ASSET_TARGETS: AssetTarget[] = [
  {path: '/', title: '首页', expect: 'html'},
  {path: '/robots.txt', title: '搜索引擎抓取规则 robots.txt', expect: 'text'},
  {path: '/sitemap.xml', title: '站点地图 sitemap.xml', expect: 'xml'},
  {path: '/healthz.html', title: '健康检查页 healthz.html', expect: 'html'},
  {path: '/nav', title: '大学生导航页', expect: 'html'},
  {path: '/tools/pdf-merge-split', title: '工具页：PDF 合并与拆分', expect: 'html'},
  {path: '/tools/pdf-compress', title: '工具页：PDF 压缩', expect: 'html'},
  {path: '/tools/photo-check', title: '工具页：证件照体检诊断', expect: 'html'},
  {path: '/tools/files', title: '工具页：文件格式转换', expect: 'html'},
  {path: '/fonts/fonts-v4.css', title: '手写字体样式表', expect: 'text'},
  {path: '/novip-logo.jpg', title: '站点 Logo 图片', expect: 'binary'},
];

/** 宽松地判断响应体是否符合期望类型；只在明显不对时提示，避免误报 */
function looksLike(expect: AssetExpect, text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 600);
  if (expect === 'xml') return head.includes('<?xml') || head.includes('<urlset');
  if (expect === 'html') return /<(?:!doctype|html)[\s>]/i.test(head) || /<div|<h1|<main|<body/i.test(head);
  if (expect === 'text') return !head.startsWith('\u0000\u0000');
  return true;
}

/** 按 HTTP 状态码给出中文「下一步」建议 */
export function suggestionForStatus(status: number): string {
  if (status === 404 || status === 410) return '部署包里没有这个文件，检查构建产物是否完整（本地可跑 node scripts/verify-build.mjs dist 复查）。';
  if (status >= 500) return 'CDN 或源站临时异常，等 1–2 分钟后点「重新自检」再试一次。';
  if (status === 401 || status === 403) return '访问被拦截（可能是防盗链或访问权限），请把这份报告发给站点维护者。';
  if (status === 0) return '网络不可用或请求被拦截，检查网络后点「重新自检」重试；若一直失败，把这份报告发给我。';
  if (status >= 400) return '服务器返回了非预期状态，请把这份报告发给站点维护者。';
  return '状态异常，请把这份报告发给站点维护者。';
}

/** 格式化字节数为中文可读文本 */
export function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '未知';
  if (bytes < 1024) return `${bytes} 字节`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 检查单个资源，永不抛错。
 * 二进制资源只读响应头（Content-Length）后断开；文本资源读正文并做类型粗校验。
 */
async function checkOneAsset(fetcher: VerifyFetcher, target: AssetTarget): Promise<VerifyItem> {
  const id = `asset:${target.path}`;
  const startedAt = Date.now();
  let status = 0;
  let bytes: number | undefined;
  try {
    const response = await fetcher(target.path);
    status = typeof response.status === 'number' ? response.status : 0;
    const ms = Date.now() - startedAt;
    if (!response.ok || status < 200 || status >= 300) {
      return {
        id,
        category: 'assets',
        title: target.title,
        status: 'fail',
        detail: `请求 ${target.path} 返回 HTTP ${status || '无响应'}`,
        suggestion: suggestionForStatus(status),
        ms,
        httpStatus: status,
      };
    }
    const lengthHeader = response.headers?.get?.('content-length');
    const declaredLength = lengthHeader ? Number(lengthHeader) : Number.NaN;

    if (target.expect === 'binary') {
      bytes = Number.isFinite(declaredLength) && declaredLength >= 0 ? declaredLength : undefined;
      return {
        id,
        category: 'assets',
        title: target.title,
        status: 'pass',
        detail: bytes === undefined ? `HTTP 200，${target.path} 可访问` : `HTTP 200，${formatBytes(bytes)}，
可用`,
        ms,
        bytes,
        httpStatus: status,
      };
    }

    let text = '';
    if (typeof response.text === 'function') text = await response.text();
    bytes = Number.isFinite(declaredLength) && declaredLength >= 0 ? declaredLength : new TextEncoder().encode(text).length;
    const totalMs = Date.now() - startedAt;
    if (bytes === 0) {
      return {
        id,
        category: 'assets',
        title: target.title,
        status: 'fail',
        detail: `HTTP 200 但内容为空（${target.path}）`,
        suggestion: '文件存在但内容是空的，检查构建产物是否被覆盖，再把这份报告发给站点维护者。',
        ms: totalMs,
        bytes,
        httpStatus: status,
      };
    }
    // 说明：上面的 binary 分支已提前 return，这里的 expect 只剩 html / text / xml，
    // 因此不再重复判断 'binary'（否则 TS 会报「比较无重叠」）。
    if (!looksLike(target.expect, text)) {
      return {
        id,
        category: 'assets',
        title: target.title,
        status: 'warn',
        detail: `HTTP 200，但内容看起来不像 ${target.expect === 'xml' ? 'XML' : target.expect === 'html' ? 'HTML 页面' : '文本'}（可能是错误页被当作 200 返回）`,
        suggestion: '用浏览器直接打开这个地址看看是不是被替换成了错误页，再把这份报告发给站点维护者。',
        ms: totalMs,
        bytes,
        httpStatus: status,
      };
    }
    return {
      id,
      category: 'assets',
      title: target.title,
      status: 'pass',
      detail: `HTTP 200，${formatBytes(bytes)}，${totalMs} 毫秒`,
      ms: totalMs,
      bytes,
      httpStatus: status,
    };
  } catch (error) {
    // 网络层异常（断网、被拦截、CORS 失败等）：记为 fail，不向上抛
    return {
      id,
      category: 'assets',
      title: target.title,
      status: 'fail',
      detail: `请求 ${target.path} 失败：${errorText(error)}`,
      suggestion: suggestionForStatus(0),
      ms: Date.now() - startedAt,
      httpStatus: 0,
    };
  }
}

/** 把未知异常收敛成中文可读的一句话 */
function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return `网络或浏览器拦截（${error.message}）`;
  if (typeof error === 'string' && error) return `网络或浏览器拦截（${error}）`;
  return '网络或浏览器拦截';
}

/** 逐项检查静态资源；串行执行，避免一次打出十几个并发请求被 CDN 限速 */
export async function checkAssets(fetcher?: VerifyFetcher): Promise<VerifyItem[]> {
  const run = resolveFetcher(fetcher);
  const items: VerifyItem[] = [];
  for (const target of ASSET_TARGETS) {
    items.push(await checkOneAsset(run, target));
  }
  return items;
}

// ─────────────────────────── SEO 产物 ───────────────────────────

/** 从 HTML 中提取所有 `<link rel="canonical" href="...">` 的 href（属性顺序无关） */
function extractCanonicalHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']?canonical["']?/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];
    hrefs.push(href === undefined ? '' : href.trim());
  }
  return hrefs;
}

/** 从 HTML 中提取 `<meta name="robots" content="...">` 的 content（属性顺序无关） */
function extractRobotsContent(html: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bname\s*=\s*["']?robots["']?/i.test(tag)) continue;
    return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? '';
  }
  return null;
}

/** 把站点根地址与路径拼成绝对地址（origin 末尾斜杠兼容；path 为 '/' 时保留根） */
export function absoluteUrl(origin: string, path: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * 纯函数：检查一份已渲染好的 HTML 是否满足上线的最低 SEO 要求。
 * 不使用 DOMParser，全部走正则，保证 node 环境可直接测试。
 * 每项检查固定产出一个 VerifyItem（id 形如 `seo:<page>:title`），便于 UI 逐项展示。
 */
export function checkSeoHtml(pagePath: string, html: string, expectedCanonical: string): VerifyItem[] {
  const page = pagePath || '/';
  const prefix = `seo:${page}`;
  const source = typeof html === 'string' ? html : '';
  const items: VerifyItem[] = [];

  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  items.push({
    id: `${prefix}:title`,
    category: 'seo',
    title: `${page} 的页面标题`,
    status: title ? 'pass' : 'fail',
    detail: title ? `标题为「${title}」` : '没有找到 <title>，或标题是空的',
    suggestion: title ? undefined : '页面标题为空会影响搜索结果展示，检查 src/seo.ts 里该页的 title 配置后重新构建。',
  });

  const canonicals = extractCanonicalHrefs(source);
  const canonicalOk = canonicals.length === 1 && canonicals[0] === expectedCanonical;
  items.push({
    id: `${prefix}:canonical`,
    category: 'seo',
    title: `${page} 的 canonical 规范地址`,
    status: canonicalOk ? 'pass' : 'fail',
    detail: canonicalOk
      ? `指向 ${expectedCanonical}`
      : canonicals.length === 0
        ? `没有找到 rel="canonical"，期望 ${expectedCanonical}`
        : canonicals.length > 1
          ? `找到 ${canonicals.length} 个 canonical（应恰好 1 个）`
          : `实际为 ${canonicals[0] || '（空）'}，期望 ${expectedCanonical}`,
    suggestion: canonicalOk ? undefined : 'canonical 写错会让搜索引擎认错网址，检查 scripts/generate-seo.mjs 的生成结果后重新构建。',
  });

  const h1Count = (source.match(/<h1\b/gi) ?? []).length;
  const h1Ok = h1Count === 1;
  items.push({
    id: `${prefix}:h1`,
    category: 'seo',
    title: `${page} 的一级标题`,
    status: h1Ok ? 'pass' : 'fail',
    detail: h1Ok ? '恰好 1 个 <h1>' : `找到 ${h1Count} 个 <h1>（要求恰好 1 个）`,
    suggestion: h1Ok ? undefined : '每个页面只应有一个一级标题，检查该页模板是否漏写或重复渲染了 <h1>。',
  });

  const robotsContent = extractRobotsContent(source);
  const robotsOk = robotsContent === 'index,follow';
  items.push({
    id: `${prefix}:robots`,
    category: 'seo',
    title: `${page} 的收录指令`,
    status: robotsOk ? 'pass' : 'fail',
    detail: robotsOk
      ? '允许搜索引擎收录（index,follow）'
      : robotsContent === null
        ? '没有找到 name="robots" 的 meta 标签'
        : `实际为「${robotsContent}」，期望「index,follow」`,
    suggestion: robotsOk ? undefined : '收录指令不对会让页面搜不到，检查预渲染模板的 robots meta 输出。',
  });

  // 启动兜底脚本：只要求「脚本入口存在」，不要求脚本内容（内容由构建产物决定）
  const scriptCount = (source.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["']/gi) ?? []).length;
  const hasGuard = source.includes('__NOVIP_GUARDED_RELOAD') || source.includes('__NOVIP_BOOT_FALLBACK');
  const scriptOk = scriptCount > 0;
  items.push({
    id: `${prefix}:script`,
    category: 'seo',
    title: `${page} 的启动脚本`,
    status: scriptOk ? 'pass' : 'fail',
    detail: scriptOk
      ? `找到 ${scriptCount} 个外链脚本${hasGuard ? '，且包含启动兜底逻辑' : '（未检测到启动兜底变量，可能由入口脚本内联提供）'}`
      : '没有找到带 src 的 <script> 标签',
    suggestion: scriptOk ? undefined : '缺少启动脚本会直接白屏，检查 index.html 模板与构建入口是否正常。',
  });

  return items;
}

/** SEO 检查的目标页面（与 ASSET_TARGETS 中同一批核心页，便于交叉验证） */
export const SEO_PAGES: string[] = ['/', '/tools/pdf-merge-split', '/tools/pdf-compress', '/tools/photo-check'];

/** sitemap 的最少 URL 数（当前仓库约 51 个，留出余量；少于这个数说明生成流程出问题） */
export const SITEMAP_MIN_URLS = 30;

/** 从 sitemap.xml 中提取全部 <loc> 内容 */
export function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  for (const match of (xml || '').matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/gi)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

/** 把 sitemap 里的绝对地址收敛成路径，便于和页面路径比较 */
function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return path === '' ? '/' : path;
  } catch {
    const path = url.replace(/\/+$/, '');
    return path === '' ? '/' : path;
  }
}

/**
 * 检查 SEO 产物：逐个拉取核心页面 HTML 做 checkSeoHtml，再校验 sitemap 数量与覆盖。
 * 任一页面拉取失败会产出 fail 项，不会中断其它页面的检查。
 */
export async function checkSeo(fetcher?: VerifyFetcher, origin?: string): Promise<VerifyItem[]> {
  const run = resolveFetcher(fetcher);
  const base = origin || (typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'https://novip.site');
  const items: VerifyItem[] = [];

  for (const page of SEO_PAGES) {
    try {
      const response = await run(page);
      if (!response.ok || response.status < 200 || response.status >= 300) {
        items.push({
          id: `seo:${page}:fetch`,
          category: 'seo',
          title: `${page} 页面是否可读取`,
          status: 'fail',
          detail: `请求 ${page} 返回 HTTP ${response.status || '无响应'}`,
          suggestion: suggestionForStatus(response.status),
          httpStatus: response.status,
        });
        continue;
      }
      const html = await response.text();
      items.push(...checkSeoHtml(page, html, absoluteUrl(base, page)));
    } catch (error) {
      items.push({
        id: `seo:${page}:fetch`,
        category: 'seo',
        title: `${page} 页面是否可读取`,
        status: 'fail',
        detail: `请求 ${page} 失败：${errorText(error)}`,
        suggestion: suggestionForStatus(0),
        httpStatus: 0,
      });
    }
  }

  try {
    const response = await run('/sitemap.xml');
    if (!response.ok || response.status < 200 || response.status >= 300) {
      items.push({
        id: 'seo:sitemap:fetch',
        category: 'seo',
        title: 'sitemap.xml 是否可读取',
        status: 'fail',
        detail: `请求 /sitemap.xml 返回 HTTP ${response.status || '无响应'}`,
        suggestion: suggestionForStatus(response.status),
        httpStatus: response.status,
      });
    } else {
      const urls = parseSitemapUrls(await response.text());
      const enough = urls.length >= SITEMAP_MIN_URLS;
      items.push({
        id: 'seo:sitemap:count',
        category: 'seo',
        title: 'sitemap 覆盖的网址数量',
        status: enough ? 'pass' : 'fail',
        detail: `共 ${urls.length} 个网址（至少要 ${SITEMAP_MIN_URLS} 个）`,
        suggestion: enough ? undefined : '站点地图数量明显偏少，说明生成流程只跑了一部分，检查 scripts/generate-seo.mjs 的路径清单。',
      });
      const pathSet = new Set(urls.map(toPath));
      const missing = SEO_PAGES.filter((page) => !pathSet.has(toPath(page)));
      items.push({
        id: 'seo:sitemap:coverage',
        category: 'seo',
        title: 'sitemap 是否包含核心页面',
        status: missing.length === 0 ? 'pass' : 'fail',
        detail: missing.length === 0 ? `核心页面 ${SEO_PAGES.length} 个全部在 sitemap 中` : `缺少 ${missing.join('、')}`,
        suggestion: missing.length === 0 ? undefined : '核心页面不在站点地图里，搜索引擎可能发现不了，检查 src/seo.ts 的 pathTools 是否包含这些路径。',
      });
    }
  } catch (error) {
    items.push({
      id: 'seo:sitemap:fetch',
      category: 'seo',
      title: 'sitemap.xml 是否可读取',
      status: 'fail',
      detail: `请求 /sitemap.xml 失败：${errorText(error)}`,
      suggestion: suggestionForStatus(0),
      httpStatus: 0,
    });
  }

  return items;
}

// ─────────────────────────── 浏览器本地能力 ───────────────────────────

/** 单次探针结果（不包含 id / title，由 CapabilityProbe 补齐） */
export interface ProbeResult {
  status: VerifyStatus;
  detail: string;
  suggestion?: string;
}

/** 能力探针：一个可独立执行、永不抛错的检查 */
export interface CapabilityProbe {
  id: string;
  title: string;
  run: () => Promise<ProbeResult>;
}

/** 探针成功的结果 */
function probeOk(detail: string): ProbeResult {
  return {status: 'pass', detail};
}

/** 探针失败的结果 */
function probeFail(detail: string, suggestion: string): ProbeResult {
  return {status: 'fail', detail, suggestion};
}

/** 探针不适用（环境不支持、无法在 node 下判断）的结果 */
function probeSkip(detail: string): ProbeResult {
  return {status: 'skip', detail};
}

/**
 * 内置最小 PDF（内容稳定，不依赖外部文件）：单页 + 一段用 Identity-H 编码写的中文，
 * 用来验证 pdf-lib 确实能解析出 1 页——比只放文件头更能反映引擎是否真的工作。
 * 全文纯 ASCII（中文以 HEX 串写入），可直接内嵌源码，不会引入编码问题。
 */
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj',
  '4 0 obj<</Length 83>>stream',
  'BT /F1 14 Tf 20 120 Td <FEFF004E004F00560049005000209A8C8BC195E8623781EA68C0> Tj ET',
  'endstream endobj',
  '5 0 obj<</Type/Font/Subtype/Type0/BaseFont/Helvetica/Encoding/Identity-H/DescendantFonts[6 0 R]>>endobj',
  '6 0 obj<</Type/Font/Subtype/CIDFontType2/BaseFont/Helvetica/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/FontDescriptor 7 0 R/DW 1000>>endobj',
  '7 0 obj<</Type/FontDescriptor/FontName/Helvetica/Flags 4/FontBBox[0 0 1000 1000]/ItalicAngle 0/Ascent 880/Descent -120/CapHeight 700/StemV 80>>endobj',
  'trailer<</Root 1 0 R/Size 8>>',
  '%%EOF',
].join('\n');

/** 取当前全局对象（浏览器 window / node globalThis），避免直接写 window 导致 node 下报错 */
function globalObject(): typeof globalThis {
  return globalThis;
}

/**
 * 默认能力探针集合。
 * 覆盖：WebAssembly、PDF Worker（Blob Worker）、PDF 解析（pdf-lib）、ZIP 生成（fflate）、
 * 下载链接、剪贴板降级链、文件读取、加密随机数（crypto.subtle）。
 * pdf-lib / fflate 一律动态 import，不拖累首屏加载。
 */
export function defaultCapabilityProbes(): CapabilityProbe[] {
  return [
    {
      id: 'cap:wasm',
      title: 'WebAssembly 可用',
      run: async () => {
        try {
          if (typeof WebAssembly !== 'object' || WebAssembly === null) {
            return probeFail('当前浏览器不支持 WebAssembly', '换用较新的 Chrome / Edge / Safari 再试，PDF 压缩与 OCR 依赖它。');
          }
          const module = new WebAssembly.Module(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
          // WebAssembly.validate 在标准环境里恒存在，这里只用它校验一段最小模块头
          const valid = WebAssembly.validate(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
          return probeOk(`WebAssembly 可实例化，最小模块校验${valid ? '通过' : '未通过'}，模块构造${module instanceof WebAssembly.Module ? '正常' : '异常'}`);
        } catch (error) {
          return probeFail(`WebAssembly 初始化失败：${errorText(error)}`, '在浏览器设置里检查是否禁用了 WebAssembly，或换一个浏览器。');
        }
      },
    },
    {
      id: 'cap:worker-blob',
      title: 'PDF Worker 可创建（Blob Worker）',
      run: async () => {
        try {
          const scope = globalObject();
          if (typeof scope.Blob !== 'function' || typeof scope.Worker !== 'function' || typeof scope.URL?.createObjectURL !== 'function') {
            return probeSkip('当前环境不支持 Blob / Worker，无法探测后台线程（node 下属于正常情况）');
          }
          const blob = new scope.Blob(['self.onmessage=function(e){self.postMessage(e.data)}'], {type: 'text/javascript'});
          const url = scope.URL.createObjectURL(blob);
          try {
            // 不调用 Worker 内部（无 network / 可能被 CSP 拦截），构造成功后立即回收
            const worker = new scope.Worker(url);
            worker.terminate();
          } finally {
            scope.URL.revokeObjectURL(url);
          }
          const hasStructuredClone = typeof scope.structuredClone === 'function';
          const hasOffscreen = typeof (scope as {OffscreenCanvas?: unknown}).OffscreenCanvas === 'function';
          return probeOk(`可以创建 Blob Worker；structuredClone ${hasStructuredClone ? '可用' : '不可用'}，OffscreenCanvas ${hasOffscreen ? '可用' : '不可用（大图会慢一些）'}`);
        } catch (error) {
          return probeFail(`无法创建后台线程：${errorText(error)}`, '可能是浏览器策略或插件拦截了后台线程，关闭广告拦截插件后刷新重试。');
        }
      },
    },
    {
      id: 'cap:pdf-lib',
      title: 'PDF 解析引擎（pdf-lib）可用',
      run: async () => {
        try {
          const {PDFDocument} = await import('pdf-lib');
          // 必须显式按 UTF-8 转字节：直接传字符串会被 pdf-lib 按 latin1 编码，中文被写坏后报「找不到 PDF 头」
          const doc = await PDFDocument.load(new TextEncoder().encode(MINIMAL_PDF));
          const pages = doc.getPageCount();
          if (pages < 1) return probeFail('内置最小 PDF 解析后没有页面', '把这份报告发给维护者：PDF 引擎加载异常。');
          return probeOk(`已解析内置 PDF，识别到 ${pages} 页`);
        } catch (error) {
          return probeFail(`PDF 引擎加载失败：${errorText(error)}`, '刷新页面重试；若一直失败，可能是网络中断导致代码没下载完，把报告发给维护者。');
        }
      },
    },
    {
      id: 'cap:fflate',
      title: 'ZIP 打包引擎（fflate）可用',
      run: async () => {
        try {
          const {zipSync, strToU8} = await import('fflate');
          const bytes = zipSync({'检测.txt': strToU8('NOVIP 自检')});
          if (bytes.length < 4 || String.fromCharCode(bytes[0], bytes[1]) !== 'PK') {
            return probeFail('生成的 ZIP 文件头不对', '把这份报告发给维护者：打包引擎异常，批量下载可能失败。');
          }
          return probeOk(`已生成 ZIP，${formatBytes(bytes.length)}，文件头正常`);
        } catch (error) {
          return probeFail(`打包引擎加载失败：${errorText(error)}`, '刷新页面重试；若一直失败，把报告发给维护者。');
        }
      },
    },
    {
      id: 'cap:download',
      title: '下载功能可用',
      run: async () => {
        try {
          const scope = globalObject();
          if (typeof scope.Blob !== 'function') return probeSkip('当前环境没有 Blob，无法探测下载');
          if (typeof scope.document === 'undefined') return probeSkip('当前环境没有文档对象，无法探测下载（node 下属于正常情况）');
          const anchor = scope.document.createElement('a');
          const portable = 'download' in anchor && typeof anchor.download === 'string';
          const blobSupported = typeof scope.URL?.createObjectURL === 'function';
          if (!portable || !blobSupported) {
            return probeFail('浏览器不支持下载链接（a[download] / Blob URL）', '换用新版 Chrome 或 Edge 打开本站，才能正常保存处理后的文件。');
          }
          return probeOk('支持 Blob URL 下载，处理结果可以直接保存到本地');
        } catch (error) {
          return probeFail(`下载能力探测失败：${errorText(error)}`, '换一个浏览器试一下；若仍失败，把报告发给维护者。');
        }
      },
    },
    {
      id: 'cap:clipboard',
      title: '剪贴板（复制结果）可用',
      run: async () => {
        try {
          const scope = globalObject();
          const asyncApi = typeof scope.navigator?.clipboard?.writeText === 'function';
          const fallback = typeof scope.document !== 'undefined'
            && typeof scope.document.execCommand === 'function'
            && typeof scope.document.createElement === 'function';
          if (asyncApi) return probeOk('支持标准剪贴板接口，可一键复制结果');
          if (fallback) return probeOk('不支持标准剪贴板接口，但可用兼容方式复制（会弹出手动复制框）');
          if (typeof scope.document === 'undefined') return probeSkip('当前环境没有文档对象，无法探测剪贴板（node 下属于正常情况）');
          return probeFail('没有任何可用的复制方式', '请手动选中文本复制；或在浏览器里允许本站访问剪贴板后刷新重试。');
        } catch (error) {
          return probeFail(`剪贴板探测失败：${errorText(error)}`, '请手动选中文本复制，并把报告发给维护者。');
        }
      },
    },
    {
      id: 'cap:file-api',
      title: '本地文件读取可用',
      run: async () => {
        try {
          const scope = globalObject();
          if (typeof scope.File !== 'function' || typeof scope.FileReader !== 'function') {
            return probeSkip('当前环境不支持 File / FileReader，无法探测本地文件读取');
          }
          const supported = 'arrayBuffer' in new scope.File(['a'], 'a.txt');
          const reader = new scope.FileReader();
          if (typeof reader.readAsArrayBuffer !== 'function') {
            return probeFail('FileReader 缺少 readAsArrayBuffer', '换用新版浏览器；否则无法在本地打开你的文件。');
          }
          return probeOk(`${supported ? '文件对象支持 arrayBuffer()' : '文件对象需走 FileReader 读取'}，本地文件读取可用`);
        } catch (error) {
          return probeFail(`本地文件读取探测失败：${errorText(error)}`, '换一个浏览器试一下；若仍失败，把报告发给维护者。');
        }
      },
    },
    {
      id: 'cap:crypto',
      title: '安全随机数与加密接口可用',
      run: async () => {
        try {
          const cryptoApi = globalObject().crypto as Crypto | undefined;
          if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
            return probeFail('crypto.getRandomValues 不可用', 'HTTP 非加密连接下浏览器会禁用加密接口，请用 https:// 打开本站。');
          }
          const bytes = new Uint8Array(8);
          cryptoApi.getRandomValues(bytes);
          if (typeof cryptoApi.subtle === 'undefined') {
            return probeFail('crypto.subtle 不可用（通常是非 HTTPS 环境）', '请用 https://novip.site 打开本站，加密相关功能需要安全连接。');
          }
          return probeOk('安全随机数与 crypto.subtle 均可用');
        } catch (error) {
          return probeFail(`加密接口探测失败：${errorText(error)}`, '请用 https:// 打开本站；若仍失败，把报告发给维护者。');
        }
      },
    },
  ];
}

/** 执行单个探针并收敛成 VerifyItem；探针同步抛错也会被兜住 */
async function runProbe(probe: CapabilityProbe): Promise<VerifyItem> {
  const startedAt = Date.now();
  try {
    const result = await probe.run();
    return {
      id: probe.id,
      category: 'capability',
      title: probe.title,
      status: result.status,
      detail: result.detail,
      suggestion: result.suggestion,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      id: probe.id,
      category: 'capability',
      title: probe.title,
      status: 'fail',
      detail: `检查项自身出错：${errorText(error)}`,
      suggestion: '刷新页面重试；若一直失败，把这份报告发给我。',
      ms: Date.now() - startedAt,
    };
  }
}

/** 依次执行全部探针（串行，避免同时加载多个大模块把手机浏览器顶住） */
export async function checkCapabilities(probes?: CapabilityProbe[]): Promise<VerifyItem[]> {
  const list = probes ?? defaultCapabilityProbes();
  const items: VerifyItem[] = [];
  for (const probe of list) items.push(await runProbe(probe));
  return items;
}

// ─────────────────────────── 总入口 ───────────────────────────

/** 构建版本项的来源：部署信息 + 页面地址 */
function buildVersionItems(deploy: DeployInfo, origin: string): VerifyItem[] {
  const items: VerifyItem[] = [];
  if (deploy.source === 'production') {
    items.push({
      id: 'version:deploy',
      category: 'version',
      title: '线上部署信息',
      status: 'pass',
      detail: [
        deploy.commit ? `提交 ${deploy.commit.slice(0, 12)}` : '提交信息未提供',
        deploy.runId ? `构建号 ${deploy.runId}` : null,
        deploy.deployedAt ? `部署于 ${deploy.deployedAt}` : null,
      ].filter(Boolean).join('，'),
    });
  } else {
    items.push({
      id: 'version:deploy',
      category: 'version',
      title: '线上部署信息',
      status: 'warn',
      detail: '没有读到 /deploy-info.json，说明当前不是正式部署环境（本地预览，或部署流程未写入该文件）',
      suggestion: '如果你是在正式网址打开的，把这份报告发给我；本地预览时这一项可以忽略。',
    });
  }
  items.push({
    id: 'version:origin',
    category: 'version',
    title: '当前访问的站点',
    status: 'pass',
    detail: `来源 ${origin || '未知'}，与页面同源检查，不做任何跨域请求`,
  });
  return items;
}

/** runVerification 的可注入选项（测试与 UI 都用它） */
export interface RunVerificationOptions {
  fetcher?: VerifyFetcher;
  probes?: CapabilityProbe[];
  origin?: string;
  now?: () => number;
  userAgent?: string;
  /** 站主拖入并解析成功的本机体检报告；默认 null（= 还没运行本地脚本，出 skip 项） */
  localReport?: LocalCheckReport | null;
  /**
   * 是否附带 NOVIP 线上站点自检（静态资源 + SEO + 部署信息）。
   * 页面主线不需要它（站主要看的是 Claude 桌面应用），所以默认 false；
   * 需要站点体检的地方（例如维护者自己跑）显式传 true。
   */
  includeSiteChecks?: boolean;
}

/** 取默认 origin：浏览器用 location.origin，node 下退回部署地址 */
function defaultOrigin(): string {
  try {
    const loc = (globalThis as {location?: {origin?: string}}).location;
    if (loc?.origin) return loc.origin;
  } catch {
    // 被沙箱限制时忽略
  }
  return 'https://novip.site';
}

/** 取默认 userAgent：便于在报告里区分手机/电脑 */
function defaultUserAgent(): string {
  try {
    return (globalThis as {navigator?: {userAgent?: string}}).navigator?.userAgent ?? '';
  } catch {
    return '';
  }
}

/**
 * 执行完整自检并生成报告。
 * 顺序：部署信息 → 静态资源 → SEO → 能力探针（串行，逐项记录耗时）。
 * 任何一步内部已各自 try/catch；这里再加一层总兜底，保证永不 reject、页面永不白屏。
 */
export async function runVerification(options: RunVerificationOptions = {}): Promise<VerifyReport> {
  const now = options.now ?? (() => Date.now());
  const startedMs = now();
  const origin = options.origin ?? defaultOrigin();
  const userAgent = options.userAgent ?? defaultUserAgent();
  const items: VerifyItem[] = [];

  // ── 第一组：Claude 本机体检（来自拖入的 claude-check.json，浏览器无法自己探测本机）──
  const localReport = options.localReport ?? null;
  try {
    items.push(localOverviewItem(localReport));
    items.push(...localCheckItems(localReport));
  } catch (error) {
    items.push({
      id: 'local:internal',
      category: 'local',
      title: 'Claude 本机体检',
      status: 'fail',
      detail: `体检报告处理出错：${errorText(error)}`,
      suggestion: '重新拖入 claude-check.json；若还是失败，把这份报告发给我。',
    });
  }

  // ── 第二组：浏览器本地能力（页面真正能自检的部分）──
  try {
    items.push(...await checkCapabilities(options.probes));
  } catch (error) {
    items.push({
      id: 'capability:internal',
      category: 'capability',
      title: '浏览器能力检查',
      status: 'fail',
      detail: `检查过程自身出错：${errorText(error)}`,
      suggestion: '刷新页面重试；若一直失败，把这份报告发给我。',
    });
  }

  // ── 可选：NOVIP 线上站点自检（默认关闭，只给维护者用）──
  let deployInfo: DeployInfo | null = null;
  if (options.includeSiteChecks) {
    try {
      deployInfo = await collectDeployInfo(options.fetcher);
    } catch {
      deployInfo = {source: 'local'};
    }
    items.push(...buildVersionItems(deployInfo, origin));

    try {
      items.push(...await checkAssets(options.fetcher));
    } catch (error) {
      items.push({
        id: 'assets:internal',
        category: 'assets',
        title: '静态资源检查',
        status: 'fail',
        detail: `检查过程自身出错：${errorText(error)}`,
        suggestion: '刷新页面重试；若一直失败，把这份报告发给我。',
      });
    }

    try {
      items.push(...await checkSeo(options.fetcher, origin));
    } catch (error) {
      items.push({
        id: 'seo:internal',
        category: 'seo',
        title: 'SEO 产物检查',
        status: 'fail',
        detail: `检查过程自身出错：${errorText(error)}`,
        suggestion: '刷新页面重试；若一直失败，把这份报告发给我。',
      });
    }
  }

  const summary = summarize(items);
  const finishedMs = now();
  return {
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: Math.max(0, finishedMs - startedMs),
    origin,
    userAgent,
    deployInfo,
    items,
    summary,
    verdict: verdictOf(summary),
  };
}

// ─────────────────────────── Markdown 报告 ───────────────────────────

/** 把文本压成单行，避免破坏 Markdown 表格 */
function oneLine(text: string): string {
  return (text || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

/** 把 Markdown 表格单元格里的竖线转义，并限制长度（太长的详情截断，全文在失败清单里） */
function cell(text: string, max = 60): string {
  const flat = oneLine(text);
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** 北京时间（Asia/Shanghai）可读时间；解析失败时原样返回 */
function beijingTime(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(ms));
  } catch {
    return value;
  }
}

/**
 * 渲染中文 Markdown 报告，供站主一键复制后直接发给维护者。
 * 结构：标题 → 基本信息 → 结论 → 分组结果表 → 需要处理的项目与建议 → 下一步。
 */
export function renderMarkdownReport(report: VerifyReport): string {
  const {summary, verdict, deployInfo} = report;
  const lines: string[] = [];

  lines.push('# NOVIP 验证门户 · Claude 体检报告');
  lines.push('');
  lines.push(`- 生成时间：${beijingTime(report.startedAt)}（北京时间）`);
  lines.push(`- 耗时：${(report.durationMs / 1000).toFixed(1)} 秒`);
  const hasLocalReport = report.items.some((entry) => entry.category === 'local' && entry.id !== 'local:overview' && entry.id !== 'local:missing');
  const scopes = [`Claude 本机体检${hasLocalReport ? '' : '（未运行本地脚本）'}`, '浏览器本地能力'];
  if (deployInfo) scopes.push('NOVIP 线上站点自检');
  lines.push(`- 检查范围：${scopes.join(' + ')}`);
  if (report.origin) lines.push(`- 页面来源：${report.origin}`);
  if (deployInfo?.source === 'production') {
    lines.push(`- 线上版本：提交 ${deployInfo.commit ? deployInfo.commit.slice(0, 12) : '未提供'}${deployInfo.runId ? `，构建号 ${deployInfo.runId}` : ''}${deployInfo.deployedAt ? `，部署于 ${deployInfo.deployedAt}` : ''}`);
  } else if (deployInfo) {
    lines.push('- 线上版本：未读到部署信息（本地预览或部署流程未写入 /deploy-info.json）');
  }
  if (report.userAgent) lines.push(`- 浏览器：${cell(report.userAgent, 120)}`);
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push(`**${verdict === 'ready' ? '✅ 可以交付' : verdict === 'attention' ? '⚠️ 需要留意' : '❌ 暂不交付'}**：${VERDICT_TEXT[verdict]}`);
  lines.push('');
  lines.push(`统计：通过 ${summary.pass} 项，注意 ${summary.warn} 项，不通 ${summary.fail} 项，跳过 ${summary.skip} 项，共 ${summary.total} 项。`);
  lines.push('');
  if (summary.skip > 0) {
    lines.push(`> 其中 ${summary.skip} 项被「跳过」：通常是还没运行本地体检脚本，或当前浏览器不支持某项能力。跳过不算失败，不影响结论。`);
    lines.push('');
  }

  for (const category of ALL_CATEGORY_ORDER) {
    const group = report.items.filter((entry) => entry.category === category);
    if (group.length === 0) continue;
    lines.push(`## ${CATEGORY_LABELS[category]}`);
    lines.push('');
    lines.push('| 项目 | 状态 | 详情 |');
    lines.push('| --- | --- | --- |');
    for (const entry of group) {
      const status = STATUS_TEXT[entry.status];
      lines.push(`| ${cell(entry.title, 40)} | ${status.icon} ${status.label} | ${cell(entry.detail, 80)} |`);
    }
    lines.push('');
  }

  // 应用信息单独成块：表格单元格会被截断，签名权威这类关键信息必须完整可读
  const overview = report.items.find((entry) => entry.id === 'local:overview');
  if (overview) {
    lines.push('### 应用信息');
    lines.push('');
    lines.push(`- ${oneLine(overview.detail) || '未提供'}`);
    lines.push('');
  }

  // 逐条铺开，不截断：失败 / 注意 / 跳过 都要列出来，skip 不能悄悄消失
  const details = report.items.filter((entry) => entry.status === 'fail' || entry.status === 'warn' || entry.status === 'skip');
  lines.push('## 逐项说明');
  lines.push('');
  if (details.length === 0) {
    lines.push('没有需要处理的项目，全部通过。');
  } else {
    details.forEach((entry, index) => {
      const status = STATUS_TEXT[entry.status];
      lines.push(`### ${index + 1}. ${status.icon} ${entry.title}（${CATEGORY_LABELS[entry.category]}）`);
      lines.push('');
      lines.push(`- 状态：${status.label}`);
      lines.push(`- 现象：${oneLine(entry.detail) || '未提供'}`);
      lines.push(`- 下一步：${oneLine(entry.suggestion || '把这一项发给维护者。')}`);
      if (typeof entry.httpStatus === 'number' && entry.httpStatus > 0) lines.push(`- HTTP 状态：${entry.httpStatus}`);
      lines.push('');
    });
  }
  lines.push('');

  lines.push('## 下一步');
  lines.push('');
  if (verdict === 'ready') {
    lines.push('1. 可以正常使用，把这份报告复制发给维护者存档即可。');
    lines.push('2. 不需要你做任何技术操作，也不用打开终端。');
    lines.push('3. 之后想再确认，重新打开本页点一次「重新自检」。');
  } else if (verdict === 'attention') {
    lines.push('1. 基本可用，把上面的「逐项说明」整段复制发给维护者。');
    lines.push('2. 不需要你做任何技术操作，也不用打开终端。');
    lines.push('3. 维护者处理后再打开本页确认一次。');
  } else {
    lines.push('1. 先按报告里的「下一步」逐条处理；多数是本地脚本没跑或没拖文件。');
    lines.push('2. 处理完后点「重新自检」再看一次，确认红色项消失。');
    lines.push('3. 仍然红的，把这份报告整段复制发给维护者，不要自己改任何配置。');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('本报告由 NOVIP 站内验证门户自动生成：只在你的浏览器本地运行，不会上传任何文件内容。');

  return lines.join('\n');
}
