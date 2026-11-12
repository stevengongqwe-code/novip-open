import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tools} from '../src/tools/registry.ts';
import {pathTools, prerenderPaths, pageSeo, toolNotes, SITE_URL} from '../src/seo.ts';

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

const GROUPS = [...new Set(tools.map((tool) => tool.group))];

export function navHtml() {
  return GROUPS.map((group) => {
    const items = tools.filter((tool) => tool.group === group)
      .map((tool) => `<li><a href="${tool.path}">${escapeHtml(tool.name)}</a>：${escapeHtml(tool.task)}</li>`).join('');
    return `<section><h2>${escapeHtml(group)}</h2><ul>${items}</ul></section>`;
  }).join('');
}

function toolJsonLd(tool) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: `${tool.name}：${tool.task}`,
    url: SITE_URL + tool.path,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    inLanguage: 'zh-CN',
    offers: {'@type': 'Offer', price: '0', priceCurrency: 'CNY'},
    isAccessibleForFree: true,
    isPartOf: {'@type': 'WebSite', name: 'NOVIP', url: SITE_URL + '/'},
  };
}

export function renderPage(template, page) {
  const seo = pageSeo(page);
  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(seo.title)}</title>`);
  for (const [attribute, key, value] of [
    ['name', 'description', seo.description],
    ['name', 'robots', seo.robots],
    ['property', 'og:title', seo.title],
    ['property', 'og:description', seo.description],
    ['property', 'og:url', seo.canonical],
  ]) {
    html = html.replace(new RegExp(`<meta ${attribute}="${key}" content="[^"]*"\\s*\\/?>(?:\\n)?`), () =>
      `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />\n`);
  }
  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');
  if (seo.canonical) html = html.replace('</head>', `  <link rel="canonical" href="${seo.canonical}" />\n</head>`);
  if (page === 'home') {
    html = html.replace(/(<nav id="seo-nav"[^>]*>)[\s\S]*?(<\/nav>)/, () =>
      `<nav id="seo-nav" aria-label="NOVIP 工具导航">${navHtml()}</nav>`);
    return html;
  }
  const tool = tools.find((item) => item.id === page);
  const content = tool
    ? `<h1>${escapeHtml(tool.name)}</h1><p>${escapeHtml(tool.task)}</p><h2>使用方法与限制</h2><p>${escapeHtml(toolNotes[page] || '无需强制登录，无下载水印，文件优先在浏览器本地处理。')}</p><nav aria-label="NOVIP 工具导航">${navHtml()}</nav><p role="status">正在加载交互工具，请稍候…</p><noscript>请启用 JavaScript 以使用浏览器内处理工具。</noscript>`
    : `<span style="font-size:36px;font-weight:bold;color:#c9232c" aria-hidden="true">404</span><h1>这里没有 VIP，也没有这个页面</h1><p style="font-size:16px;color:#52525b">你可能访问了失效的链接，或者这个页面已经调整了地址。</p><div style="background:#fff7f7;border-left:4px solid #c9232c;padding:14px 18px;border-radius:8px;margin:16px 0"><strong style="color:#c9232c">💡 NOVIP 态度</strong><p style="margin:6px 0 0;color:#3f3f46;line-height:1.6">在 NOVIP，你找不到充值 VIP 的弹窗，也找不到这个页面。不过既然来了，别空手而归——下面这些完全免费、无需登录、不加水印的高频工具，也许正好能解你的燃眉之急：</p></div><section aria-label="热门急救工具推荐"><h2>🔥 推荐这些高频反 VIP 工具</h2><ul><li><a href="/tools/pdf-compress">PDF 压缩</a>：按轻度/推荐/极限档位重采样压缩 PDF，变大自动拦截保留原件。</li><li><a href="/tools/pdf-merge-split">PDF 合并与拆分</a>：多份课件论文合并为一个，按页码范围拆分或提取指定页，纯本地处理。</li><li><a href="/tools/photo-check">报名照片体检诊断</a>：一键体检报名照片尺寸、KB体积、底色合规性，提供智能修复。</li><li><a href="/tools/files">文件格式转换</a>：Word/PPT/图片与PDF纯本地相互转换，无水印不排队。</li><li><a href="/#references">参考文献格式化</a>：GB/T 7714双版本、五类文献、校验与TXT一键导出。</li><li><a href="/#handwrite">手写字迹生成器</a>：中文多页手写字迹模拟，导出PNG/PDF作业救急。</li></ul></section><p style="margin-top:24px"><a href="/" style="display:inline-block;padding:10px 22px;background:#c9232c;color:white;text-decoration:none;border-radius:8px;font-weight:600">返回 NOVIP 工具首页 ➔</a></p>`;
  html = html.replace(/(<div id="root">)[\s\S]*?(<\/div>)/, () =>
    `<div id="root"><main style="max-width:1120px;margin:32px auto;padding:24px;font-family:system-ui,sans-serif;color:#18181b"><a href="/">NOVIP 大学生免费工具箱</a>${content}</main></div>`);
  if (tool) {
    html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(toolJsonLd(tool))}</script>\n</head>`);
  }
  return html;
}

export function sitemapXml() {
  // /stats 为交互页，不进 sitemap（避免与预渲染页同等的静态校验口径混淆），但从导航与首页可见。
  // prerenderPaths = pathTools + EXTRA_PATH_TOOLS（如 /verify），已按路径去重。
  const urls = [SITE_URL + '/', ...prerenderPaths.map((path) => SITE_URL + path)];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n') + '\n</urlset>\n';
}

export function edgeConfig() {
  return {
    redirects: [
      {source: '/stats/', destination: '/stats', statusCode: 301},
      ...prerenderPaths.map((path) => ({source: path + '/', destination: path, statusCode: 301})),
    ],
    rewrites: [
      {source: '/stats', destination: '/stats/index.html'},
      ...prerenderPaths.map((path) => ({source: path, destination: path + '/index.html'})),
    ],
    headers: [
      {source: '/robots.txt', headers: [{key: 'Content-Type', value: 'text/plain; charset=utf-8'}]},
      {source: '/sitemap.xml', headers: [{key: 'Content-Type', value: 'application/xml; charset=utf-8'}]},
    ],
  };
}

export function generateSeo(directory = 'dist') {
  const dist = resolve(directory);
  const template = readFileSync(join(dist, 'index.html'), 'utf8');
  // 预渲染：工具页 + 额外独立页（/verify）。registry 里有 verify 时 Set 去重，不会写两次。
  for (const path of prerenderPaths) {
    const tool = tools.find((item) => item.path === path);
    if (!tool) continue;
    const folder = join(dist, path.slice(1));
    mkdirSync(folder, {recursive: true});
    writeFileSync(join(folder, 'index.html'), renderPage(template, tool.id));
  }
  writeFileSync(join(dist, 'index.html'), renderPage(template, 'home'));
  writeFileSync(join(dist, '404.html'), renderPage(template, 'not-found'));
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  writeFileSync(join(dist, 'sitemap.xml'), sitemapXml());
  writeFileSync(join(dist, 'edgeone.json'), JSON.stringify(edgeConfig(), null, 2) + '\n');
  // EdgeOne Makers deploy 需要产物根存在 package.json。
  writeFileSync(join(dist, 'package.json'), JSON.stringify({name: 'novip-site', private: true, type: 'module'}, null, 2) + '\n');
  console.log(`[seo] ${prerenderPaths.length} 个独立页（工具 ${pathTools.length} + 额外 ${prerenderPaths.length - pathTools.length}）+ 首页 + 网站数据页 + 404；sitemap ${prerenderPaths.length + 1} URL；EdgeOne 规则 ${prerenderPaths.length + 1} redirects/rewrites -> ${dist}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateSeo(process.argv[2]);
