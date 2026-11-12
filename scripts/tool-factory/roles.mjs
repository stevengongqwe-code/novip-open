import fs from 'node:fs';
import path from 'node:path';

/**
 * Sensitive file patterns that MUST NOT be auto-merged or auto-deployed
 * without explicit manual approval.
 */
export const SENSITIVE_PATH_PATTERNS = [
  /^\.env/i,
  /(^|\/)\.env\./i,
  /^edge-functions\//i,
  /secret/i,
  /credential/i,
  /payment/i,
  /billing/i,
  /dns/i,
  /waf/i,
  /auth-provider/i,
];

/**
 * Dangerous code patterns forbidden inside pure-frontend tool modules (`src/tools/*`).
 */
export const FORBIDDEN_TOOL_CODE_PATTERNS = [
  {
    name: 'eval_execution',
    pattern: /\beval\s*\(/,
    reason: '禁止在工具代码中使用 eval()',
  },
  {
    name: 'new_function_execution',
    pattern: /\bnew\s+Function\s*\(/,
    reason: '禁止在工具代码中使用 new Function()',
  },
  {
    name: 'external_http_upload',
    pattern: /\bfetch\s*\(\s*['"`]https?:\/\//i,
    reason: '纯本地工具禁止向外部 HTTP 接口上传用户数据',
  },
  {
    name: 'xmlhttprequest_upload',
    pattern: /\bnew\s+XMLHttpRequest\s*\(/,
    reason: '纯本地工具禁止使用 XMLHttpRequest 发送外部请求',
  },
  {
    name: 'hardcoded_private_key',
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    reason: '禁止硬编码私钥信息',
  },
];

/**
 * Compute weighted score (0-100 scale) for a candidate tool across the 6 dimensions.
 */
export function computeCandidateScore(scores, weights) {
  const w = weights || {
    frequency: 0.22,
    searchDemand: 0.18,
    frontendFeasibility: 0.2,
    privacyAdvantage: 0.15,
    lowMaintenanceCost: 0.1,
    uniqueness: 0.15,
  };

  const weightedTenScale =
    (Number(scores.frequency) || 0) * w.frequency +
    (Number(scores.searchDemand) || 0) * w.searchDemand +
    (Number(scores.frontendFeasibility) || 0) * w.frontendFeasibility +
    (Number(scores.privacyAdvantage) || 0) * w.privacyAdvantage +
    (Number(scores.lowMaintenanceCost) || 0) * w.lowMaintenanceCost +
    (Number(scores.uniqueness) || 0) * w.uniqueness;

  return Math.round(weightedTenScale * 100) / 10;
}

/**
 * Extract currently registered tool IDs and titles from `src/tools/registry.ts`.
 */
export function parseRegisteredTools(registrySource) {
  const tools = [];
  const regex = /\{\s*id:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'\s*,\s*group:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g;
  let match = regex.exec(registrySource);
  while (match) {
    tools.push({
      id: match[1],
      path: match[2],
      cat: match[3],
      title: match[4],
    });
    match = regex.exec(registrySource);
  }
  return tools;
}

/**
 * Role 01: Demand Scout
 * Evaluates candidate pool against registered tools, scores 6 dimensions,
 * prevents duplicate registration, and selects the highest-value target.
 */
export function runDemandScout({ candidatesData, registrySource, targetToolId }) {
  const registeredTools = parseRegisteredTools(registrySource);
  const registeredIds = new Set(registeredTools.map((t) => t.id));
  const weights = candidatesData.scoringWeights;

  const ranked = (candidatesData.candidates || [])
    .map((candidate) => {
      const compositeScore = computeCandidateScore(candidate.scores || {}, weights);
      const alreadyRegistered = registeredIds.has(candidate.id);
      return {
        ...candidate,
        compositeScore,
        alreadyRegistered,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const selected = targetToolId
    ? ranked.find((item) => item.id === targetToolId) || null
    : ranked.find((item) => !item.alreadyRegistered && item.status === 'queued') ||
      ranked[0] ||
      null;

  return {
    role: '01. Demand Scout',
    timestamp: new Date().toISOString(),
    registeredToolCount: registeredTools.length,
    candidateCount: ranked.length,
    rankedCandidates: ranked.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      compositeScore: c.compositeScore,
      alreadyRegistered: c.alreadyRegistered,
    })),
    selectedCandidate: selected,
  };
}

/**
 * Role 02: Product Architect
 * Produces a complete, deterministic product specification for the selected candidate.
 */
export function runProductArchitect(candidate) {
  if (!candidate) {
    throw new Error('Product Architect requires a valid candidate tool.');
  }

  return {
    role: '02. Product Architect',
    timestamp: new Date().toISOString(),
    spec: {
      id: candidate.id,
      route: `/tools/${candidate.id}`,
      title: candidate.title,
      category: candidate.category,
      summary: candidate.summary,
      painPoint: candidate.painPoint,
      targetScenarios: candidate.targetScenarios || [],
      ioContract: {
        inputFormats: candidate.inputFormats || [],
        outputFormats: candidate.outputFormats || [],
        processingMode: 'Pure Browser Memory (Zero Server Upload)',
      },
      uxRequirements: {
        desktopLayout: '1440px 双栏/工作台布局，顶栏提供一键加载示例与状态反馈',
        mobileLayout: '375px/390px 单列自适应，按钮触控高度 >= 38px，零横向溢出',
        emptyAndErrorStates: '提供空状态引导、一键加载校园示例、损坏文件可读错误提示',
      },
      seoMeta: {
        title: `${candidate.title} - 免费在线${candidate.title}工具 | NOVIP 大学生工具站`,
        description: `${candidate.summary}。${candidate.privacyGuarantee}`,
        canonical: `https://novip.site/tools/${candidate.id}`,
      },
      acceptanceCriteria: [
        '纯本地浏览器内存处理，不发起任何外部上传请求',
        '支持一键加载内置示例数据，零文件即可完整体验导出闭环',
        '对格式错误或空文件给出明确中文错误提示，页面不崩溃',
        '桌面端 1440px 与手机端 375px 布局无横向滚动溢出',
        '通过 TypeScript、ESLint、单元测试、生产构建与 SEO 预渲染校验',
      ],
    },
  };
}

/**
 * Role 03: Tool Builder Verification
 * Verifies that all required files and registration points for a tool ID are wired properly.
 */
export function runToolBuilderVerify({ rootDir, toolId }) {
  const registryPath = path.join(rootDir, 'src/tools/registry.ts');
  const mainPath = path.join(rootDir, 'src/main.tsx');
  const seoPath = path.join(rootDir, 'src/seo.ts');
  const searchCorePath = path.join(rootDir, 'src/tools/search-core.ts');

  const registryText = fs.readFileSync(registryPath, 'utf8');
  const mainText = fs.readFileSync(mainPath, 'utf8');
  const seoText = fs.readFileSync(seoPath, 'utf8');
  const searchCoreText = fs.readFileSync(searchCorePath, 'utf8');

  const checks = {
    inRegistry: new RegExp(`id:\\s*'${toolId}'`).test(registryText),
    inMainRouter: new RegExp(`id\\s*===\\s*'${toolId}'|case\\s+'${toolId}':`).test(mainText),
    inSeoMap: new RegExp(`['"]?${toolId}['"]?\\s*:`).test(seoText),
    inSearchSynonyms: new RegExp(`['"]?${toolId}['"]?\\s*:`).test(searchCoreText),
    hasCoreModule: fs.existsSync(path.join(rootDir, `src/tools/${toolId}-core.ts`)),
    hasUnitTest: fs.existsSync(path.join(rootDir, `tests/${toolId}.test.ts`)),
  };

  const passed = Object.values(checks).every(Boolean);

  return {
    role: '03. Tool Builder',
    timestamp: new Date().toISOString(),
    toolId,
    checks,
    passed,
  };
}

/**
 * Role 04: QA Inspector Static Security & Privacy Scan
 * Scans tool files for forbidden patterns (external uploads, eval, hardcoded keys).
 */
export function runQaInspectorScan({ rootDir, filesToScan }) {
  const toolsDir = path.join(rootDir, 'src/tools');
  const targets =
    filesToScan ||
    fs
      .readdirSync(toolsDir)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      .map((f) => path.join(toolsDir, f));

  const violations = [];
  for (const filePath of targets) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(rootDir, filePath);
    for (const rule of FORBIDDEN_TOOL_CODE_PATTERNS) {
      if (rule.pattern.test(content)) {
        violations.push({
          file: relPath,
          rule: rule.name,
          reason: rule.reason,
        });
      }
    }
  }

  return {
    role: '04. QA Inspector',
    timestamp: new Date().toISOString(),
    scannedFileCount: targets.length,
    violations,
    passed: violations.length === 0,
  };
}

/**
 * Role 05: Release Engineer Security & Sensitive-Path Gate
 * Blocks automatic merge/deploy if sensitive paths are modified or if existing tools were removed.
 */
export function runReleaseEngineerGate({ changedFiles = [], previousToolIds = [], currentToolIds = [] }) {
  const sensitiveTouches = [];

  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/').trim();
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(normalized)) {
        sensitiveTouches.push({
          file: normalized,
          matchedPattern: String(pattern),
        });
        break;
      }
    }
  }

  const currentSet = new Set(currentToolIds);
  const removedTools = previousToolIds.filter((id) => !currentSet.has(id));

  const autoMergeAllowed = sensitiveTouches.length === 0 && removedTools.length === 0;

  return {
    role: '05. Release Engineer',
    timestamp: new Date().toISOString(),
    changedFileCount: changedFiles.length,
    sensitiveTouches,
    removedTools,
    autoMergeAllowed,
    requiresManualApproval: !autoMergeAllowed,
    reason: autoMergeAllowed
      ? '所有变更均在安全白名单范围内，且未删除任何现有工具，允许进入自动化发布流水线。'
      : `检测到敏感变更 (${sensitiveTouches.map((s) => s.file).join(', ')}) 或删除工具 (${removedTools.join(', ')})，已暂停自动合并并转人工审批。`,
  };
}

/**
 * Role 06: Operation Monitor
 * Verifies live endpoints or local pre-rendered build output and emits rollback recommendations on failure.
 */
export async function runOperationMonitorCheck({
  baseUrl = 'https://novip.site',
  routes = ['/', '/deploy-info.json', '/tools/timetable', '/tools/image-watermark', '/tools/ppt-extract', '/sitemap.xml', '/robots.txt'],
  fetchImpl = globalThis.fetch,
}) {
  const results = [];
  let allHealthy = true;

  for (const route of routes) {
    const url = `${baseUrl.replace(/\/$/, '')}${route}`;
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': 'NOVIP-Operation-Monitor/1.0',
          'Cache-Control': 'no-cache',
        },
      });
      const latencyMs = Date.now() - startedAt;
      const bodyText = await response.text();
      const ok = response.status === 200 && bodyText.length > 20;
      if (!ok) allHealthy = false;

      results.push({
        route,
        url,
        status: response.status,
        latencyMs,
        bytes: bodyText.length,
        healthy: ok,
      });
    } catch (error) {
      allHealthy = false;
      results.push({
        route,
        url,
        status: 0,
        latencyMs: Date.now() - startedAt,
        bytes: 0,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    role: '06. Operation Monitor',
    timestamp: new Date().toISOString(),
    baseUrl,
    allHealthy,
    rollbackRecommended: !allHealthy,
    endpoints: results,
  };
}
