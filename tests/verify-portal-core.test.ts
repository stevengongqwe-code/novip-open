import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CATEGORY_ORDER,
  ASSET_TARGETS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  LOCAL_REPORT_MISSING_DETAIL,
  LOCAL_REPORT_MISSING_SUGGESTION,
  LOCAL_REPORT_SCHEMA,
  SEO_PAGES,
  SITEMAP_MIN_URLS,
  STATUS_TEXT,
  VERDICT_TEXT,
  absoluteUrl,
  checkAssets,
  checkCapabilities,
  checkSeo,
  checkSeoHtml,
  collectDeployInfo,
  defaultCapabilityProbes,
  formatBytes,
  localCheckItems,
  localOverviewItem,
  parseLocalCheckReport,
  parseSitemapUrls,
  renderMarkdownReport,
  runVerification,
  suggestionForStatus,
  summarize,
  verdictOf,
  type CapabilityProbe,
  type DeployInfo,
  type LocalCheckReport,
  type VerifyFetcher,
  type VerifyItem,
  type VerifyReport,
  type VerifyResponse,
} from '../src/lib/verify-portal-core';

// ─────────────────────── 测试工具 ───────────────────────

/** 构造一个假响应 */
function response(status: number, body = '', headers: Record<string, string> = {}): VerifyResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: {get: (name: string) => headers[name.toLowerCase()] ?? null},
  };
}

/** 一份合规的 HTML（title / canonical / 1 个 h1 / index,follow / 启动脚本） */
function goodHtml(canonical: string): string {
  return [
    '<!doctype html><html lang="zh-CN"><head>',
    '<meta charset="UTF-8" />',
    '<title>NOVIP 大学生工具</title>',
    '<meta name="robots" content="index,follow" />',
    `<link rel="canonical" href="${canonical}" />`,
    '</head><body><h1>页面标题</h1>',
    '<script>window.__NOVIP_GUARDED_RELOAD = function(){};</script>',
    '<script type="module" crossorigin src="/assets/main.js"></script>',
    '</body></html>',
  ].join('');
}

/** 一份合规的 sitemap（含全部核心页面） */
function goodSitemap(extra = 0): string {
  const paths = [...SEO_PAGES, ...Array.from({length: extra}, (_, i) => `/tools/extra-${i}`)];
  const body = paths.map((path) => `  <url><loc>https://novip.site${path === '/' ? '/' : path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/** 所有路径都返回 200 的假 fetcher（内容按路径区分） */
function healthyFetcher(options: {origin?: string; overrides?: Record<string, () => Promise<VerifyResponse>>} = {}): VerifyFetcher {
  return async (path: string) => {
    const override = options.overrides?.[path];
    if (override) return override();
    if (path === '/deploy-info.json') {
      return response(200, JSON.stringify({commit: 'abc123def456789', runId: '4242', deployedAt: '2026-10-31T00:00:00Z'}));
    }
    if (path === '/sitemap.xml') return response(200, goodSitemap(30));
    if (path === '/robots.txt') return response(200, 'User-agent: *\nAllow: /\n');
    if (path === '/fonts/fonts-v4.css') return response(200, '@font-face{font-family:X;src:url(/fonts/x.woff2)}', {'content-length': '64'});
    if (path === '/novip-logo.jpg') return response(200, '', {'content-length': '151547'});
    if (path.endsWith('.jpg') || path.endsWith('.png')) return response(200, '', {'content-length': '1024'});
    return response(200, goodHtml(absoluteUrl(options.origin ?? 'https://novip.site', path)));
  };
}

/** 全部通过的探针（隔离浏览器的网络与模块加载） */
function passingProbes(): CapabilityProbe[] {
  return [
    {id: 'probe:a', title: '探针甲', run: async () => ({status: 'pass' as const, detail: '通过'})},
    {id: 'probe:b', title: '探针乙', run: async () => ({status: 'warn' as const, detail: '可用但不完美'})},
  ];
}

/** 找到某项 */
function item(items: VerifyItem[], id: string): VerifyItem {
  const found = items.find((entry) => entry.id === id);
  assert.ok(found, `应存在检查项 ${id}`);
  return found;
}

// ─────────────────────── 常量与类型 ───────────────────────

describe('验证门户核心 (verify-portal-core) — 常量', () => {
  it('CATEGORY_LABELS 覆盖全部分类，页面主线只有 local / capability 两组', () => {
    assert.deepEqual(CATEGORY_LABELS, {
      local: 'Claude 本机体检',
      capability: '浏览器本地能力',
      version: '构建与版本',
      assets: '静态资源可达性',
      seo: 'SEO 产物',
    });
    // 页面展示顺序 = 两组
    assert.deepEqual(CATEGORY_ORDER, ['local', 'capability']);
    // 全量顺序覆盖所有分类，且两两不重复
    assert.deepEqual([...ALL_CATEGORY_ORDER].sort(), [...Object.keys(CATEGORY_LABELS)].sort());
  });

  it('STATUS_TEXT 四种状态都有中文名与图标（不只靠颜色区分）', () => {
    for (const status of ['pass', 'warn', 'fail', 'skip'] as const) {
      assert.ok(STATUS_TEXT[status].label.length > 0, `${status} 需要中文名`);
      assert.ok(STATUS_TEXT[status].icon.length > 0, `${status} 需要图标`);
    }
  });

  it('ASSET_TARGETS 覆盖任务要求的 11 个真实路径，且每项都有中文标题', () => {
    const paths = ASSET_TARGETS.map((target) => target.path);
    const required = [
      '/', '/robots.txt', '/sitemap.xml', '/healthz.html', '/nav',
      '/tools/pdf-merge-split', '/tools/pdf-compress', '/tools/photo-check', '/tools/files',
      '/fonts/fonts-v4.css', '/novip-logo.jpg',
    ];
    for (const path of required) assert.ok(paths.includes(path), `ASSET_TARGETS 缺少 ${path}`);
    assert.equal(new Set(paths).size, paths.length, 'ASSET_TARGETS 不应有重复路径');
    for (const target of ASSET_TARGETS) {
      assert.ok(target.title.trim().length > 0, `${target.path} 缺少中文标题`);
      assert.ok(['html', 'text', 'xml', 'binary'].includes(target.expect), `${target.path} 的 expect 非法`);
    }
  });

  it('formatBytes / absoluteUrl 处理边界输入', () => {
    assert.equal(formatBytes(512), '512 字节');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
    assert.equal(formatBytes(undefined), '未知');
    assert.equal(formatBytes(-1), '未知');
    assert.equal(absoluteUrl('https://novip.site/', '/'), 'https://novip.site/');
    assert.equal(absoluteUrl('https://novip.site', '/tools/files'), 'https://novip.site/tools/files');
    assert.equal(absoluteUrl('https://novip.site///', 'tools/files'), 'https://novip.site/tools/files');
  });

  it('suggestionForStatus 区分 404 / 5xx / 0 三种建议', () => {
    assert.match(suggestionForStatus(404), /构建产物/);
    assert.match(suggestionForStatus(503), /1–2 分钟/);
    assert.match(suggestionForStatus(0), /重试/);
  });
});

// ─────────────────────── 汇总与结论 ───────────────────────

describe('验证门户核心 — summarize / verdictOf', () => {
  const make = (status: VerifyItem['status']): VerifyItem => ({
    id: `x:${status}:${Math.random()}`,
    category: 'assets',
    title: '测试项',
    status,
    detail: '详情',
  });

  it('空数组：total 为 0，verdict 为 ready（「没有可检查项」不等于出错）', () => {
    const summary = summarize([]);
    assert.deepEqual(summary, {pass: 0, warn: 0, fail: 0, skip: 0, total: 0});
    assert.equal(verdictOf(summary), 'ready');
  });

  it('全通过 → ready', () => {
    assert.equal(verdictOf(summarize([make('pass'), make('pass')])), 'ready');
  });

  it('有 warn 无 fail → attention', () => {
    assert.equal(verdictOf(summarize([make('pass'), make('warn')])), 'attention');
  });

  it('任一 fail → blocked（优先级高于 warn）', () => {
    assert.equal(verdictOf(summarize([make('warn'), make('fail'), make('pass')])), 'blocked');
  });

  it('只有 skip → ready（浏览器不支持某项能力不代表站点不可用）', () => {
    assert.equal(verdictOf(summarize([make('skip'), make('skip')])), 'ready');
    assert.equal(summarize([make('skip')]).skip, 1);
  });

  it('summarize 计数与 total 一致', () => {
    const summary = summarize([make('pass'), make('warn'), make('fail'), make('skip'), make('pass')]);
    assert.deepEqual(summary, {pass: 2, warn: 1, fail: 1, skip: 1, total: 5});
  });
});

// ─────────────────────── 部署信息 ───────────────────────

describe('验证门户核心 — collectDeployInfo', () => {
  it('200 + JSON：source 为 production，commit / runId / deployedAt 被解析', async () => {
    const info = await collectDeployInfo(async (path) => {
      assert.equal(path, '/deploy-info.json');
      return response(200, JSON.stringify({commit: 'deadbeefcafe', runId: '9001', deployedAt: '2026-10-31T01:00:00Z'}));
    });
    assert.equal(info.source, 'production');
    assert.equal(info.commit, 'deadbeefcafe');
    assert.equal(info.runId, '9001');
    assert.equal(info.deployedAt, '2026-10-31T01:00:00Z');
    assert.ok(info.raw && typeof info.raw === 'object');
  });

  it('兼容 sha / run_id / deployed_at 等写法', async () => {
    const info = await collectDeployInfo(async () => response(200, JSON.stringify({sha: '0123456', run_id: 77, deployed_at: '2026-10-30'})));
    assert.equal(info.source, 'production');
    assert.equal(info.commit, '0123456');
    assert.equal(info.runId, '77');
    assert.equal(info.deployedAt, '2026-10-30');
  });

  it('404：source 为 local，不抛错', async () => {
    const info = await collectDeployInfo(async () => response(404, 'Not Found'));
    assert.deepEqual(info, {source: 'local'});
  });

  it('非法 JSON：source 为 local，不抛错', async () => {
    const info = await collectDeployInfo(async () => response(200, '<html>不是 JSON</html>'));
    assert.equal(info.source, 'local');
    assert.equal(info.commit, undefined);
  });

  it('网络异常：source 为 local，不抛错', async () => {
    const info = await collectDeployInfo(async () => {
      throw new Error('Failed to fetch');
    });
    assert.equal(info.source, 'local');
  });

  it('JSON 是数组或 null：视为 local（不是合法的部署对象）', async () => {
    assert.equal((await collectDeployInfo(async () => response(200, '[1,2,3]'))).source, 'local');
    assert.equal((await collectDeployInfo(async () => response(200, 'null'))).source, 'local');
  });

  it('不传 fetcher 时不会因为 node 环境没有网络而抛错', async () => {
    // node 下 globalThis.fetch 对相对路径会失败；此时必须安全降级为 local
    const info = await collectDeployInfo();
    assert.ok(info.source === 'local' || info.source === 'production');
  });
});

// ─────────────────────── 静态资源 ───────────────────────

describe('验证门户核心 — checkAssets', () => {
  it('全部 200：每一项都 pass，并记录 httpStatus / ms / bytes', async () => {
    const items = await checkAssets(healthyFetcher());
    assert.equal(items.length, ASSET_TARGETS.length);
    for (const entry of items) {
      assert.equal(entry.status, 'pass', `${entry.id} 应当通过，实际 ${entry.status}：${entry.detail}`);
      assert.equal(entry.category, 'assets');
      assert.equal(entry.httpStatus, 200);
      assert.equal(typeof entry.ms, 'number');
      assert.ok((entry.bytes ?? 0) > 0, `${entry.id} 应记录 bytes`);
    }
  });

  it('二进制资源只读响应头：不调用 text()，bytes 取 content-length', async () => {
    let textCalled = false;
    const fetcher: VerifyFetcher = async (path) => {
      if (path === '/novip-logo.jpg') {
        return {
          ok: true,
          status: 200,
          text: async () => {
            textCalled = true;
            return '';
          },
          headers: {get: (name: string) => (name.toLowerCase() === 'content-length' ? '151547' : null)},
        };
      }
      if (path === '/') return response(200, goodHtml('https://novip.site/'));
      return response(200, path.endsWith('.xml') ? '<urlset></urlset>' : 'text');
    };
    const items = await checkAssets(fetcher);
    const logo = item(items, 'asset:/novip-logo.jpg');
    assert.equal(logo.status, 'pass');
    assert.equal(logo.bytes, 151547);
    assert.equal(textCalled, false, '二进制资源不应读取正文');
  });

  it('一个 404：该项 fail 且建议指向「检查构建产物」', async () => {
    const items = await checkAssets(healthyFetcher({
      overrides: {'/robots.txt': async () => response(404, 'not found')},
    }));
    const robots = item(items, 'asset:/robots.txt');
    assert.equal(robots.status, 'fail');
    assert.equal(robots.httpStatus, 404);
    assert.match(robots.suggestion ?? '', /构建产物/);
    // 其它项不受影响
    assert.equal(item(items, 'asset:/').status, 'pass');
  });

  it('5xx：建议提示等 1–2 分钟重试', async () => {
    const items = await checkAssets(healthyFetcher({
      overrides: {'/nav': async () => response(503, 'unavailable')},
    }));
    const nav = item(items, 'asset:/nav');
    assert.equal(nav.status, 'fail');
    assert.equal(nav.httpStatus, 503);
    assert.match(nav.suggestion ?? '', /1–2 分钟/);
  });

  it('网络异常（fetch 抛错）：记为 fail、httpStatus 0、建议含重试、整体不 reject', async () => {
    const items = await checkAssets(healthyFetcher({
      overrides: {
        '/tools/files': async () => {
          throw new TypeError('Failed to fetch');
        },
      },
    }));
    const files = item(items, 'asset:/tools/files');
    assert.equal(files.status, 'fail');
    assert.equal(files.httpStatus, 0);
    assert.match(files.suggestion ?? '', /重试/);
    assert.equal(item(items, 'asset:/').status, 'pass');
  });

  it('200 但内容为空：记为 fail', async () => {
    const items = await checkAssets(healthyFetcher({
      overrides: {'/healthz.html': async () => response(200, '')},
    }));
    assert.equal(item(items, 'asset:/healthz.html').status, 'fail');
  });

  it('200 但返回的是错误页（HTML 冒充 XML）：记为 warn 而不是 fail', async () => {
    const items = await checkAssets(healthyFetcher({
      overrides: {'/sitemap.xml': async () => response(200, '<html><body>错误页</body></html>')},
    }));
    assert.equal(item(items, 'asset:/sitemap.xml').status, 'warn');
  });

  it('请求路径与 ASSET_TARGETS 完全一致（不请求白名单外的地址）', async () => {
    const seen: string[] = [];
    await checkAssets(async (path) => {
      seen.push(path);
      return healthyFetcher()(path);
    });
    assert.deepEqual(seen, ASSET_TARGETS.map((target) => target.path));
  });
});

// ─────────────────────── SEO ───────────────────────

describe('验证门户核心 — checkSeoHtml', () => {
  const canonical = 'https://novip.site/tools/pdf-compress';

  it('全部合规：五项（title / canonical / h1 / robots / 脚本）全部 pass', () => {
    const items = checkSeoHtml('/tools/pdf-compress', goodHtml(canonical), canonical);
    assert.equal(items.length, 5);
    for (const entry of items) assert.equal(entry.status, 'pass', `${entry.id} 应当通过：${entry.detail}`);
    assert.ok(items.every((entry) => entry.category === 'seo'));
    assert.deepEqual(items.map((entry) => entry.id), [
      'seo:/tools/pdf-compress:title',
      'seo:/tools/pdf-compress:canonical',
      'seo:/tools/pdf-compress:h1',
      'seo:/tools/pdf-compress:robots',
      'seo:/tools/pdf-compress:script',
    ]);
  });

  it('title 缺失 → 对应项 fail 并给出建议', () => {
    const html = goodHtml(canonical).replace(/<title>[^<]*<\/title>/, '');
    const title = item(checkSeoHtml('/tools/pdf-compress', html, canonical), 'seo:/tools/pdf-compress:title');
    assert.equal(title.status, 'fail');
    assert.ok((title.suggestion ?? '').length > 0);
  });

  it('title 为空 → fail', () => {
    const html = goodHtml(canonical).replace(/<title>[^<]*<\/title>/, '<title>   </title>');
    assert.equal(item(checkSeoHtml('/x', html, canonical), 'seo:/x:title').status, 'fail');
  });

  it('canonical 错配 → fail，且详情里写明期望值', () => {
    const html = goodHtml('https://novip.site/wrong');
    const canon = item(checkSeoHtml('/tools/pdf-compress', html, canonical), 'seo:/tools/pdf-compress:canonical');
    assert.equal(canon.status, 'fail');
    assert.match(canon.detail, /https:\/\/novip\.site\/wrong/);
    assert.match(canon.detail, /期望/);
  });

  it('canonical 缺失或重复 → fail', () => {
    const missing = goodHtml(canonical).replace(/<link rel="canonical"[^>]*>/, '');
    assert.equal(item(checkSeoHtml('/p', missing, canonical), 'seo:/p:canonical').status, 'fail');
    const doubled = goodHtml(canonical) + `<link rel="canonical" href="${canonical}" />`;
    const dup = item(checkSeoHtml('/p', doubled, canonical), 'seo:/p:canonical');
    assert.equal(dup.status, 'fail');
    assert.match(dup.detail, /2 个/);
  });

  it('canonical 属性顺序颠倒也能识别', () => {
    const html = goodHtml(canonical).replace(/<link rel="canonical" href="([^"]*)" \/>/, '<link href="$1" rel="canonical">');
    assert.equal(item(checkSeoHtml('/p', html, canonical), 'seo:/p:canonical').status, 'pass');
  });

  it('h1 为 0 个 → fail', () => {
    const html = goodHtml(canonical).replace('<h1>页面标题</h1>', '');
    const h1 = item(checkSeoHtml('/p', html, canonical), 'seo:/p:h1');
    assert.equal(h1.status, 'fail');
    assert.match(h1.detail, /0 个/);
  });

  it('h1 为 2 个 → fail', () => {
    const html = goodHtml(canonical).replace('</h1>', '</h1><h1>第二个</h1>');
    const h1 = item(checkSeoHtml('/p', html, canonical), 'seo:/p:h1');
    assert.equal(h1.status, 'fail');
    assert.match(h1.detail, /2 个/);
  });

  it('robots 写错（noindex）→ fail；缺失 → fail', () => {
    const wrong = goodHtml(canonical).replace('content="index,follow"', 'content="noindex,nofollow"');
    const wrongItem = item(checkSeoHtml('/p', wrong, canonical), 'seo:/p:robots');
    assert.equal(wrongItem.status, 'fail');
    assert.match(wrongItem.detail, /noindex,nofollow/);
    const missing = goodHtml(canonical).replace(/<meta name="robots"[^>]*>/, '');
    assert.equal(item(checkSeoHtml('/p', missing, canonical), 'seo:/p:robots').status, 'fail');
  });

  it('robots 大小写与空格差异（Index,Follow）→ fail（按预渲染产物的严格写法）', () => {
    const html = goodHtml(canonical).replace('content="index,follow"', 'content="Index, Follow"');
    assert.equal(item(checkSeoHtml('/p', html, canonical), 'seo:/p:robots').status, 'fail');
  });

  it('没有外链脚本 → 脚本项 fail', () => {
    const html = goodHtml(canonical).replace(/<script type="module"[^>]*><\/script>/, '');
    assert.equal(item(checkSeoHtml('/p', html, canonical), 'seo:/p:script').status, 'fail');
  });

  it('空 HTML 不会抛错，五项全部 fail', () => {
    const items = checkSeoHtml('/', '', 'https://novip.site/');
    assert.equal(items.length, 5);
    assert.ok(items.every((entry) => entry.status === 'fail'));
  });
});

describe('验证门户核心 — checkSeo', () => {
  it('全部合规：所有检查项 pass（含 sitemap 数量与覆盖）', async () => {
    const items = await checkSeo(healthyFetcher(), 'https://novip.site');
    for (const entry of items) assert.equal(entry.status, 'pass', `${entry.id} 应通过：${entry.detail}`);
    // 4 个页面 × 5 项 + sitemap 数量 + sitemap 覆盖
    assert.equal(items.length, SEO_PAGES.length * 5 + 2);
  });

  it('canonical 按 origin 拼接（本地预览也能通过）', async () => {
    const items = await checkSeo(healthyFetcher({origin: 'http://127.0.0.1:4179'}), 'http://127.0.0.1:4179');
    for (const entry of items) assert.equal(entry.status, 'pass', `${entry.id}：${entry.detail}`);
  });

  it('sitemap 网址过少 → 数量项 fail、覆盖项 fail', async () => {
    const items = await checkSeo(healthyFetcher({
      overrides: {'/sitemap.xml': async () => response(200, goodSitemap(0))},
    }), 'https://novip.site');
    const count = item(items, 'seo:sitemap:count');
    assert.equal(count.status, 'fail');
    assert.match(count.detail, new RegExp(String(SITEMAP_MIN_URLS)));
    assert.equal(item(items, 'seo:sitemap:coverage').status, 'pass');
  });

  it('sitemap 缺少核心页面 → 覆盖项 fail 并列出缺失路径', async () => {
    const xml = goodSitemap(40).replace(/^.*pdf-compress.*$/m, '');
    const items = await checkSeo(healthyFetcher({
      overrides: {'/sitemap.xml': async () => response(200, xml)},
    }), 'https://novip.site');
    const coverage = item(items, 'seo:sitemap:coverage');
    assert.equal(coverage.status, 'fail');
    assert.match(coverage.detail, /\/tools\/pdf-compress/);
    assert.equal(item(items, 'seo:sitemap:count').status, 'pass');
  });

  it('某页面 500：产出该页 fail 项，其它页面继续检查', async () => {
    const items = await checkSeo(healthyFetcher({
      overrides: {'/tools/photo-check': async () => response(500, 'boom')},
    }), 'https://novip.site');
    const failed = item(items, 'seo:/tools/photo-check:fetch');
    assert.equal(failed.status, 'fail');
    assert.equal(failed.httpStatus, 500);
    assert.equal(item(items, 'seo:/:title').status, 'pass');
  });

  it('某页面网络异常：不抛错，记为 fail 且建议含重试', async () => {
    const items = await checkSeo(healthyFetcher({
      overrides: {
        '/': async () => {
          throw new Error('NetworkError');
        },
      },
    }), 'https://novip.site');
    const failed = item(items, 'seo:/:fetch');
    assert.equal(failed.status, 'fail');
    assert.match(failed.suggestion ?? '', /重试/);
  });

  it('sitemap 请求异常：不抛错，记为 fail', async () => {
    const items = await checkSeo(healthyFetcher({
      overrides: {
        '/sitemap.xml': async () => {
          throw new Error('NetworkError');
        },
      },
    }), 'https://novip.site');
    assert.equal(item(items, 'seo:sitemap:fetch').status, 'fail');
    assert.equal(item(items, 'seo:/:title').status, 'pass');
  });

  it('parseSitemapUrls 忽略空白并支持相对地址', () => {
    const xml = '<urlset><url><loc> https://novip.site/ </loc></url><url><loc>/nav</loc></url></urlset>';
    assert.deepEqual(parseSitemapUrls(xml), ['https://novip.site/', '/nav']);
    assert.deepEqual(parseSitemapUrls(''), []);
  });
});

// ─────────────────────── 能力探针 ───────────────────────

describe('验证门户核心 — 能力探针', () => {
  it('defaultCapabilityProbes 覆盖任务要求的全部能力，且 id 唯一', async () => {
    const probes = defaultCapabilityProbes();
    const ids = probes.map((probe) => probe.id);
    assert.equal(new Set(ids).size, ids.length, '探针 id 不应重复');
    const requiredPrefixes = ['wasm', 'worker', 'pdf', 'fflate', 'download', 'clipboard', 'file', 'crypto'];
    for (const keyword of requiredPrefixes) {
      assert.ok(ids.some((id) => id.includes(keyword)), `缺少能力探针：${keyword}`);
    }
    for (const probe of probes) {
      assert.ok(probe.title.trim().length > 0, `${probe.id} 缺少中文标题`);
      assert.equal(typeof probe.run, 'function');
    }
  });

  it('每个默认探针单独执行都不抛错，并返回合法结构', async () => {
    for (const probe of defaultCapabilityProbes()) {
      const result = await probe.run();
      assert.ok(['pass', 'warn', 'fail', 'skip'].includes(result.status), `${probe.id} 状态非法`);
      assert.ok(result.detail.length > 0, `${probe.id} 缺少详情`);
    }
  });

  it('pdf-lib 与 fflate 探针在 node 下真实通过（动态 import 生效）', async () => {
    const ids = ['cap:pdf-lib', 'cap:fflate'];
    const probes = defaultCapabilityProbes().filter((probe) => ids.includes(probe.id));
    assert.equal(probes.length, 2);
    const items = await checkCapabilities(probes);
    for (const entry of items) assert.equal(entry.status, 'pass', `${entry.id}：${entry.detail}`);
  });

  it('checkCapabilities 为每项补上 category / ms / suggestion', async () => {
    const items = await checkCapabilities([
      {id: 'probe:ok', title: '通过项', run: async () => ({status: 'pass', detail: '好'})},
      {id: 'probe:bad', title: '失败项', run: async () => ({status: 'fail', detail: '坏', suggestion: '修一下'})},
    ]);
    assert.equal(items.length, 2);
    const [ok, bad] = items;
    assert.equal(ok.category, 'capability');
    assert.equal(typeof ok.ms, 'number');
    assert.equal(bad.suggestion, '修一下');
  });

  it('探针自身抛异常：被收敛成 fail，而不是让 checkCapabilities reject', async () => {
    const items = await checkCapabilities([{
      id: 'probe:throw',
      title: '会抛异常的探针',
      run: async () => {
        throw new Error('意外崩溃');
      },
    }]);
    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'fail');
    assert.match(items[0].detail, /意外崩溃/);
    assert.ok((items[0].suggestion ?? '').length > 0);
  });

  it('探针同步抛错（非 async）：同样被收敛成 fail', async () => {
    const broken = {
      id: 'probe:sync-throw',
      title: '同步抛错探针',
      run: () => {
        throw new Error('同步崩了');
      },
    } as unknown as CapabilityProbe;
    const items = await checkCapabilities([broken]);
    assert.equal(items[0].status, 'fail');
    assert.match(items[0].detail, /同步崩了/);
  });
});

// ─────────────────────── 总入口 ───────────────────────

describe('验证门户核心 — runVerification', () => {
  it('全部通过 → verdict 为 ready，报告字段完整', async () => {
    let ticks = 0;
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: passingProbes(),
      origin: 'https://novip.site',
      userAgent: '测试浏览器',
      includeSiteChecks: true,
      now: () => {
        ticks += 1;
        return 1_700_000_000_000 + ticks * 10;
      },
    });
    assert.equal(report.summary.fail, 0);
    assert.equal(report.summary.total, report.items.length);
    assert.equal(report.origin, 'https://novip.site');
    assert.equal(report.userAgent, '测试浏览器');
    assert.ok(report.durationMs > 0);
    assert.ok(!Number.isNaN(Date.parse(report.startedAt)));
    assert.ok(!Number.isNaN(Date.parse(report.finishedAt)));
    assert.equal(report.deployInfo?.source, 'production');
    assert.equal(report.deployInfo?.commit, 'abc123def456789');
    // 页面主线的两组（local + capability）都必须有内容
    for (const category of CATEGORY_ORDER) {
      assert.ok(report.items.some((entry) => entry.category === category), `缺少分类 ${category} 的检查项`);
    }
    // 资源与 SEO 全绿、但注入的探针里有一条 warn → 结论应为 attention（而不是 ready）
    assert.equal(report.summary.warn, 1);
    assert.equal(report.verdict, 'attention');
  });

  it('全部通过且无 warn → ready', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
    });
    assert.equal(report.verdict, 'ready');
    assert.equal(report.summary.warn, 0);
    assert.equal(report.summary.fail, 0);
  });

  it('一个资源 404 → 该 item fail 且 report.verdict 为 blocked', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher({overrides: {'/robots.txt': async () => response(404, '')}}),
      probes: passingProbes(),
      origin: 'https://novip.site',
      includeSiteChecks: true,
    });
    assert.equal(report.verdict, 'blocked');
    const robots = item(report.items, 'asset:/robots.txt');
    assert.equal(robots.status, 'fail');
    assert.match(robots.suggestion ?? '', /构建产物/);
    assert.ok(report.summary.fail >= 1);
  });

  it('网络整体异常（每次 fetch 都抛错）→ 不 reject，全部记为 fail', async () => {
    const report = await runVerification({
      fetcher: async () => {
        throw new TypeError('Failed to fetch');
      },
      probes: passingProbes(),
      origin: 'http://127.0.0.1:4179',
      includeSiteChecks: true,
    });
    assert.equal(report.verdict, 'blocked');
    assert.equal(report.deployInfo?.source, 'local');
    const files = item(report.items, 'asset:/tools/files');
    assert.equal(files.status, 'fail');
    assert.match(files.suggestion ?? '', /重试/);
    // 所有依赖网络的检查项（静态资源 + SEO 页面 + sitemap）必须全部 fail
    const networkItems = report.items.filter((entry) => entry.category === 'assets' || entry.category === 'seo');
    assert.ok(networkItems.length > 0);
    assert.ok(networkItems.every((entry) => entry.status === 'fail'), '网络全断时资源与 SEO 项应全部 fail');
    // 版本类的「当前访问站点」不依赖网络，仍可 pass；这里验证它不是被误判成网络失败
    assert.equal(item(report.items, 'version:origin').status, 'pass');
  });

  it('探针抛异常 → runVerification 把它变成 fail 而不是 reject', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [
        {id: 'probe:ok', title: '正常探针', run: async () => ({status: 'pass' as const, detail: '好'})},
        {
          id: 'probe:boom',
          title: '崩溃探针',
          run: async () => {
            throw new Error('探针内部爆炸');
          },
        },
      ],
      origin: 'https://novip.site',
      includeSiteChecks: true,
    });
    assert.equal(report.verdict, 'blocked');
    const boom = item(report.items, 'probe:boom');
    assert.equal(boom.status, 'fail');
    assert.match(boom.detail, /探针内部爆炸/);
    assert.equal(item(report.items, 'probe:ok').status, 'pass');
  });

  it('默认探针（不注入）在 node 下也能跑完，不因缺 DOM 而 reject', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      origin: 'https://novip.site',
    });
    assert.ok(Array.isArray(report.items));
    const capItems = report.items.filter((entry) => entry.category === 'capability');
    assert.equal(capItems.length, defaultCapabilityProbes().length);
    // node 下没有 DOM：下载 / 剪贴板应被 skip 而不是 fail
    assert.ok(capItems.some((entry) => entry.status === 'skip'));
  });

  it('未传 origin 时使用默认站点地址，不抛错', async () => {
    const report = await runVerification({fetcher: healthyFetcher(), probes: passingProbes()});
    assert.ok(report.origin.length > 0);
    assert.ok(report.items.length > 0);
  });

  it('now 可注入：durationMs 与起止时间一致', async () => {
    const times = [1_000, 1_250];
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [],
      origin: 'https://novip.site',
      now: () => times.shift() ?? 1_250,
    });
    assert.equal(report.durationMs, 250);
    assert.equal(report.startedAt, new Date(1_000).toISOString());
    assert.equal(report.finishedAt, new Date(1_250).toISOString());
  });
});

// ─────────────────────── Markdown 报告 ───────────────────────

describe('验证门户核心 — renderMarkdownReport', () => {
  async function buildReport(): Promise<VerifyReport> {
    return runVerification({
      fetcher: healthyFetcher({
        overrides: {
          '/sitemap.xml': async () => response(404, 'missing'),
          '/tools/pdf-compress': async () => response(503, 'busy'),
        },
      }),
      probes: [
        {id: 'probe:ok', title: '正常探针', run: async () => ({status: 'pass' as const, detail: '好'})},
        {id: 'probe:warn', title: '注意探针', run: async () => ({status: 'warn' as const, detail: '慢了一点'})},
      ],
      origin: 'https://novip.site',
      userAgent: 'Mozilla/5.0 测试',
      // 该用例要验证报告里能读到 commit，因此显式开启站点自检
      includeSiteChecks: true,
    });
  }

  it('失败报告包含中文标题、commit、每个失败项的建议与「下一步」', async () => {
    const report = await buildReport();
    const markdown = renderMarkdownReport(report);
    assert.match(markdown, /^# NOVIP 验证门户 · Claude 体检报告/m);
    assert.ok(markdown.includes('abc123def456'), '应包含 commit');
    assert.ok(markdown.includes('结论'), '应包含结论段');
    assert.ok(markdown.includes('## 下一步'), '失败报告必须包含「下一步」');
    assert.ok(markdown.includes('| 项目 | 状态 | 详情 |'), '应有表格表头');
    // 只要求「实际出现过的分类」都有标题（报告不为没有项目的分组生成空表）
    for (const category of new Set(report.items.map((entry) => entry.category))) {
      assert.ok(markdown.includes(CATEGORY_LABELS[category]), `应包含分类标题 ${CATEGORY_LABELS[category]}`);
    }
    // 每个失败 / 注意项的建议都要出现
    for (const entry of report.items.filter((one) => one.status === 'fail' || one.status === 'warn')) {
      assert.ok(markdown.includes(entry.suggestion ?? ''), `缺少建议：${entry.id}`);
    }
    assert.ok(markdown.includes('❌'), '应有失败图标');
    assert.ok(markdown.includes('暂不交付'), 'blocked 应给出明确结论');
  });

  it('全部通过的报告结论为「可以交付」，且没有失败项章节内容', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
    });
    const markdown = renderMarkdownReport(report);
    assert.equal(report.verdict, 'ready');
    assert.ok(markdown.includes('✅ 可以交付'));
    assert.ok(markdown.includes('全部通过'));
    assert.ok(markdown.includes('## 下一步'));
  });

  it('本地无部署信息时写明来源，而不是谎称有 commit', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher({overrides: {'/deploy-info.json': async () => response(404, '')}}),
      probes: [],
      origin: 'http://127.0.0.1:4179',
      includeSiteChecks: true,
    });
    const markdown = renderMarkdownReport(report);
    assert.ok(markdown.includes('http://127.0.0.1:4179'));
    assert.ok(markdown.includes('未读到部署信息'));
    assert.ok(!markdown.includes('abc123def456'), '本地预览不该出现别人的 commit');
  });

  it('详情里的竖线被转义，不会破坏 Markdown 表格', () => {
    const itemWithPipe: VerifyItem = {
      id: 'x:1',
      category: 'assets',
      title: '含竖线 | 的标题',
      status: 'fail',
      detail: '详情 a|b',
      suggestion: '建议 c|d',
    };
    const report = {
      startedAt: '2026-10-31T00:00:00.000Z',
      finishedAt: '2026-10-31T00:00:01.000Z',
      durationMs: 1000,
      origin: 'https://novip.site',
      userAgent: '',
      deployInfo: {source: 'local'} as DeployInfo,
      items: [itemWithPipe],
      summary: summarize([itemWithPipe]),
      verdict: verdictOf(summarize([itemWithPipe])),
    };
    const markdown = renderMarkdownReport(report);
    const tableRow = markdown.split('\n').find((line) => line.startsWith('| 含竖线'));
    assert.ok(tableRow);
    // 列分隔符只能是「未被反斜杠转义」的竖线：去掉 \| 后应当恰好剩 4 根（3 列）
    const separators = (tableRow.replace(/\\\|/g, '').match(/\|/g) ?? []).length;
    assert.equal(separators, 4, `表格行应只有 4 根列分隔符：${tableRow}`);
    assert.ok(markdown.includes('❌ 暂不交付'));
  });

  it('空报告也能渲染，不抛错', () => {
    const empty = {pass: 0, warn: 0, fail: 0, skip: 0, total: 0};
    const markdown = renderMarkdownReport({
      startedAt: '2026-10-31T00:00:00.000Z',
      finishedAt: '2026-10-31T00:00:00.000Z',
      durationMs: 0,
      origin: '',
      userAgent: '',
      deployInfo: null,
      items: [],
      summary: empty,
      verdict: verdictOf(empty),
    });
    assert.ok(markdown.startsWith('# NOVIP 验证门户 · Claude 体检报告'));
    assert.ok(markdown.includes('全部通过'));
    assert.ok(VERDICT_TEXT.ready.length > 0);
  });
});

// ─────────────────────── 本机体检报告（Claude 桌面应用） ───────────────────────

/** 构造一份合法的 claude-check.json 文本 */
function validLocalReportText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 'novip-claude-check/v1',
    generatedAt: '2026-10-31T02:00:00Z',
    app: {
      path: '/Applications/Claude.app',
      bundleId: 'com.anthropic.claudefordesktop',
      version: '4.4212.0',
      electron: '32.2.7',
      arch: 'arm64',
    },
    signature: {
      valid: true,
      authority: 'Developer ID Application: Anthropic PBC (XXXXXXX)',
      notarized: true,
      hardenedRuntime: true,
    },
    items: [
      {id: 'install', title: '应用是否安装', status: 'pass', detail: '在 /Applications 下找到 Claude.app'},
      {id: 'launch', title: '应用能否启动', status: 'pass', detail: '进程可启动，窗口正常'},
      {id: 'update', title: '更新通道', status: 'warn', detail: '当前版本比最新版落后一个小版本', suggestion: '在 Claude 菜单里点「检查更新」即可'},
    ],
    ...overrides,
  });
}

describe('验证门户核心 — parseLocalCheckReport', () => {
  it('合法报告：ok 为 true，应用与签名信息被完整解析', () => {
    const result = parseLocalCheckReport(validLocalReportText());
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    const {report} = result;
    assert.equal(report.schema, LOCAL_REPORT_SCHEMA);
    assert.equal(report.generatedAt, '2026-10-31T02:00:00Z');
    assert.equal(report.app.path, '/Applications/Claude.app');
    assert.equal(report.app.bundleId, 'com.anthropic.claudefordesktop');
    assert.equal(report.app.version, '4.4212.0');
    assert.equal(report.app.arch, 'arm64');
    assert.equal(report.signature?.valid, true);
    assert.match(report.signature?.authority ?? '', /Anthropic PBC/);
    assert.equal(report.items.length, 3);
    assert.equal(report.items[2].status, 'warn');
  });

  it('非法 JSON：ok 为 false，给中文 error，不抛错', () => {
    const result = parseLocalCheckReport('{ 这不是 JSON ');
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /JSON/);
  });

  it('schema 不匹配：ok 为 false，error 指出期望的格式', () => {
    const result = parseLocalCheckReport(validLocalReportText({schema: 'something-else/v9'}));
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /novip-claude-check\/v1/);
  });

  it('缺少 schema：ok 为 false', () => {
    const text = JSON.stringify({generatedAt: 'x', app: {}, items: []});
    const result = parseLocalCheckReport(text);
    assert.equal(result.ok, false);
  });

  it('items 不是数组：ok 为 false，error 提到 items', () => {
    const result = parseLocalCheckReport(validLocalReportText({items: '不是数组'}));
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /items/);
  });

  it('items 缺失：ok 为 false', () => {
    const parsed = JSON.parse(validLocalReportText()) as Record<string, unknown>;
    delete parsed.items;
    const result = parseLocalCheckReport(JSON.stringify(parsed));
    assert.equal(result.ok, false);
  });

  it('app 缺必填字段：ok 为 false 并点名缺哪一项', () => {
    const parsed = JSON.parse(validLocalReportText()) as {app: Record<string, unknown>};
    delete parsed.app.version;
    const result = parseLocalCheckReport(JSON.stringify(parsed));
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /版本号/);
  });

  it('空串 / 空白 / 非对象 JSON：都返回 ok false 且不抛错', () => {
    for (const text of ['', '   ', 'null', '[]', '42', '"字符串"']) {
      const result = parseLocalCheckReport(text);
      assert.equal(result.ok, false, `输入 ${JSON.stringify(text)} 应解析失败`);
    }
  });

  it('单条检查项缺 status / status 非法：ok 为 false', () => {
    const bad = {items: [{id: 'a', title: '标题', detail: '详情'}]};
    assert.equal(parseLocalCheckReport(validLocalReportText(bad)).ok, false);
    const wrongStatus = {items: [{id: 'a', title: '标题', detail: '详情', status: 'great'}]};
    const result = parseLocalCheckReport(validLocalReportText(wrongStatus));
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /pass \/ warn \/ fail \/ skip/);
  });
});

describe('验证门户核心 — localCheckItems', () => {
  it('null：恰好返回 1 条 skip 项，文案指出 Claude 无法从浏览器读取', () => {
    const items = localCheckItems(null);
    assert.equal(items.length, 1);
    const only = items[0];
    assert.equal(only.status, 'skip');
    assert.equal(only.category, 'local');
    assert.equal(only.detail, LOCAL_REPORT_MISSING_DETAIL);
    assert.equal(only.suggestion, LOCAL_REPORT_MISSING_SUGGESTION);
    assert.match(only.detail, /Claude 体检\.command/);
    assert.match(only.detail, /无法从浏览器读取/);
    assert.match(only.suggestion ?? '', /claude-check\.json/);
  });

  it('有报告：按 report.items 逐条映射，id 自动加 local 前缀', () => {
    const result = parseLocalCheckReport(validLocalReportText());
    assert.ok(result.ok);
    const items = localCheckItems(result.report);
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((entry) => entry.id), ['local:install', 'local:launch', 'local:update']);
    assert.ok(items.every((entry) => entry.category === 'local'));
  });

  it('报告 items 为空数组：返回 1 条 skip，而不是空数组（避免 UI 空白）', () => {
    const empty: LocalCheckReport = {
      schema: LOCAL_REPORT_SCHEMA,
      generatedAt: '2026-10-31T02:00:00Z',
      app: {path: '/Applications/Claude.app', bundleId: 'com.anthropic.claudefordesktop', version: '4.4212.0'},
      items: [],
    };
    const items = localCheckItems(empty);
    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'skip');
  });

  it('localOverviewItem：汇总应用路径、版本、标识与签名权威', () => {
    const result = parseLocalCheckReport(validLocalReportText());
    assert.ok(result.ok);
    const overview = localOverviewItem(result.report);
    assert.equal(overview.status, 'pass');
    assert.ok(overview.detail.includes('/Applications/Claude.app'));
    assert.ok(overview.detail.includes('4.4212.0'));
    assert.ok(overview.detail.includes('com.anthropic.claudefordesktop'));
    assert.ok(overview.detail.includes('Anthropic PBC'));
    assert.equal(localOverviewItem(null).status, 'skip');
  });

  it('签名无效时概览项为 fail', () => {
    const result = parseLocalCheckReport(validLocalReportText({signature: {valid: false}}));
    assert.ok(result.ok);
    assert.equal(localOverviewItem(result.report).status, 'fail');
  });
});

describe('验证门户核心 — 本机体检与整体结论', () => {
  it('无本地报告时 skip 项不影响 verdict：能力探针全 pass → ready', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
      localReport: null,
    });
    assert.equal(report.verdict, 'ready');
    // local 组此时两条 skip：一条「应用概览」（未读取）、一条「本机体检报告」（还没运行脚本）
    assert.equal(report.summary.skip, 2);
    assert.equal(report.summary.fail, 0);
    const localItems = report.items.filter((entry) => entry.category === 'local');
    assert.equal(localItems.length, 2);
    assert.ok(localItems.every((entry) => entry.status === 'skip'));
    assert.equal(item(report.items, 'local:missing').status, 'skip');
  });

  it('默认不传 localReport 等同于 null', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
    });
    assert.equal(report.verdict, 'ready');
    assert.equal(report.summary.skip, 2);
  });

  it('默认不跑线上站点自检：没有 version / assets / seo 分类', async () => {
    const report = await runVerification({
      fetcher: healthyFetcher(),
      probes: [],
      origin: 'https://novip.site',
    });
    const categories = new Set(report.items.map((entry) => entry.category));
    // 探针传空数组，自然没有 capability 项；关键是没有 version / assets / seo
    assert.deepEqual([...categories], ['local']);
    assert.ok(!categories.has('version') && !categories.has('assets') && !categories.has('seo'));
    assert.equal(report.deployInfo, null);
  });

  it('传入本地报告：local 分组含概览 + 各检查项，warn 使结论为 attention', async () => {
    const parsed = parseLocalCheckReport(validLocalReportText());
    assert.ok(parsed.ok);
    const report = await runVerification({
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
      localReport: parsed.report,
    });
    const localItems = report.items.filter((entry) => entry.category === 'local');
    assert.equal(localItems.length, 4); // 1 条概览 + 3 条检查项
    assert.equal(item(report.items, 'local:overview').status, 'pass');
    assert.equal(item(report.items, 'local:update').status, 'warn');
    assert.equal(report.verdict, 'attention');
  });

  it('本地报告里有 fail → 结论为 blocked', async () => {
    const parsed = parseLocalCheckReport(validLocalReportText({
      items: [{id: 'login', title: '登录状态', status: 'fail', detail: '登录已过期', suggestion: '重新登录 Claude 账号'}],
    }));
    assert.ok(parsed.ok);
    const report = await runVerification({probes: [], origin: 'https://novip.site', localReport: parsed.report});
    assert.equal(report.verdict, 'blocked');
    assert.equal(item(report.items, 'local:login').suggestion, '重新登录 Claude 账号');
  });
});

describe('验证门户核心 — 报告包含本机体检与 skip 项', () => {
  it('报告含应用路径、版本、签名权威与每条 item 的状态详情', async () => {
    const parsed = parseLocalCheckReport(validLocalReportText());
    assert.ok(parsed.ok);
    const report = await runVerification({
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
      localReport: parsed.report,
    });
    const markdown = renderMarkdownReport(report);
    assert.ok(markdown.includes('Claude 体检报告'));
    assert.ok(markdown.includes('/Applications/Claude.app'));
    assert.ok(markdown.includes('4.4212.0'));
    // 签名权威出现在「应用概览」的详情里（表格单元格会按 80 字截断，所以看逐项说明块）
    assert.match(markdown, /Developer ID Application/);
    assert.ok(markdown.includes('Claude 本机体检'));
    // 每条 item 的标题与详情都出现
    for (const entry of parsed.report.items) {
      assert.ok(markdown.includes(entry.title), `缺少检查项标题：${entry.title}`);
      assert.ok(markdown.includes(entry.detail), `缺少检查项详情：${entry.detail}`);
    }
    assert.ok(markdown.includes('## 下一步'));
  });

  it('skip 项必须出现在报告里，不能悄悄消失', async () => {
    const report = await runVerification({
      probes: [{id: 'probe:only', title: '通过项', run: async () => ({status: 'pass' as const, detail: '好'})}],
      origin: 'https://novip.site',
      localReport: null,
    });
    const markdown = renderMarkdownReport(report);
    assert.ok(markdown.includes(LOCAL_REPORT_MISSING_DETAIL), '报告必须列出缺失本机报告这条 skip 项');
    assert.ok(markdown.includes('跳过'), '报告应出现「跳过」字样');
    assert.ok(markdown.includes('跳过不算失败'), '报告应解释跳过不影响结论');
  });
});
