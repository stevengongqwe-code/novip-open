import {readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prerenderPaths} from '../src/seo.ts';

/**
 * 生产 SEO 产物门禁：检查预渲染页、canonical、sitemap、EdgeOne 规则、静态入口与启动兜底。
 * 用法：node --import tsx scripts/verify-seo-build.mjs dist
 */
export function verifySeoBuild(directory) {
  const errors = [];
  const read = (file) => {
    if (!existsSync(join(directory, file))) { errors.push(`缺少 ${file}`); return ''; }
    return readFileSync(join(directory, file), 'utf8');
  };
  const robots = read('robots.txt');
  if (!/^User-agent: \*\s*\nAllow: \/\s*\n\s*Sitemap: https:\/\/novip\.site\/sitemap\.xml\s*$/.test(robots)) errors.push('robots 内容异常');
  const xml = read('sitemap.xml');
  if (!xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') || !xml.trim().endsWith('</urlset>')) errors.push('sitemap 不是预期XML');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  // prerenderPaths = registry 里的工具页 + 额外独立页（如 /verify），已按路径去重
  const expectedCount = prerenderPaths.length + 1;
  if (urls.length !== expectedCount) errors.push(`sitemap 应包含 ${expectedCount} 个 URL，实际 ${urls.length}`);
  if (new Set(urls).size !== urls.length) errors.push('sitemap 存在重复 URL');
  const titles = new Set(), descriptions = new Set();
  for (const url of urls) {
    // 允许 /tools/*、/nav 与额外独立页（如 /verify）
    if (!/^https:\/\/novip\.site\/(?:tools\/[a-z0-9-]+|nav|verify)?$/.test(url)) { errors.push(`非规范URL ${url}`); continue; }
    const path = new URL(url).pathname;
    const html = read(path === '/' ? 'index.html' : path.slice(1) + '/index.html');
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"\s*\/>/)?.[1];
    if (!title || titles.has(title)) errors.push(`title 缺失或重复 ${url}`);
    if (!description || descriptions.has(description)) errors.push(`description 缺失或重复 ${url}`);
    titles.add(title); descriptions.add(description);
    if ((html.match(/<h1[ >]/g) || []).length !== 1) errors.push(`H1不是一个 ${url}`);
    if ((html.match(/<link rel="canonical"/g) || []).length !== 1 || !html.includes(`rel="canonical" href="${url}"`)) errors.push(`canonical 错配 ${url}`);
    if (!html.includes('name="robots" content="index,follow"')) errors.push(`索引指令异常 ${url}`);
    if (!html.includes('__NOVIP_GUARDED_RELOAD')) errors.push(`缺少启动兜底 ${url}`);
    if (path === '/') {
      if (!html.includes('id="seo-nav"')) errors.push('首页缺少静态工具导航');
      if (!html.includes('FAQPage')) errors.push('首页缺少 FAQ 结构化数据');
    }
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    if (!scripts.length) errors.push(`缺少脚本入口 ${url}`);
    for (const entry of [...scripts, ...[...html.matchAll(/<link[^>]+href="(\/assets\/[^"?#]+)"/g)].map((match) => match[1])]) {
      if (!entry.startsWith('/assets/') || !existsSync(join(directory, entry.slice(1)))) errors.push(`入口缺失或非本地 ${entry}`);
    }
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(match[1]); } catch { errors.push(`JSON-LD不可解析 ${url}`); }
    }
  }
  const missing = read('404.html');
  if (!missing.includes('name="robots" content="noindex,follow"') || missing.includes('rel="canonical"')) errors.push('404必须noindex且不指向首页canonical');
  let config;
  try { config = JSON.parse(read('edgeone.json')); } catch { errors.push('EdgeOne配置不可解析'); }
  if (config) {
    if (!Array.isArray(config.rewrites) || config.rewrites.length !== prerenderPaths.length + 1) errors.push('EdgeOne rewrites 数量应为独立页数 + 网站数据页');
    if (!config.rewrites?.some((rule) => rule.source === '/stats' && rule.destination === '/stats/index.html')) errors.push('缺少 /stats rewrite');
    if (!config.redirects?.some((rule) => rule.source === '/stats/' && rule.destination === '/stats')) errors.push('缺少 /stats 尾斜杠重定向');
    if (config.rewrites?.some((rule) => rule.source === '/*')) errors.push('EdgeOne 不应使用 /* 通配 fallback');
    for (const path of prerenderPaths) {
      if (!config.rewrites?.some((rule) => rule.source === path && rule.destination === path + '/index.html')) errors.push(`缺少rewrite ${path}`);
      if (!config.redirects?.some((rule) => rule.source === path + '/' && rule.destination === path)) errors.push(`缺少尾斜杠重定向 ${path}`);
    }
  }
  if (!existsSync(join(directory, 'healthz.html'))) errors.push('缺少 healthz.html');
  if (!existsSync(join(directory, 'package.json'))) errors.push('缺少 EdgeOne 部署所需 package.json');
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = verifySeoBuild(process.argv[2] ?? 'dist');
  if (errors.length) { errors.forEach((error) => console.error('[verify-seo] FAIL ' + error)); process.exit(1); }
  console.log('[verify-seo] PASS：预渲染页 / canonical / sitemap / EdgeOne 规则 / 启动兜底全部通过');
}
