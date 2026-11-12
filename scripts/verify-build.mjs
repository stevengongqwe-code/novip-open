#!/usr/bin/env node
/**
 * NOVIP 构建产物完整性校验（CI 发布门禁）
 *
 * 固化 2026-10-17 抢修教训：
 *  1. index.html 引用的入口 JS/CSS 必须真实存在（缺失曾导致白屏）
 *  2. __vite__mapDeps 依赖清单必须 0 缺失
 *  3. 动态 import("./X") / new Worker("/...") / new URL("/...") / 静态资源绝对路径引用必须存在
 *  4. 字体 CSS 的 url() 引用必须可解析，且 woff2 魔数为 wOF2
 *  5. wasm 魔数为 \0asm
 *  6. reports/*.md 与 ocr/* 不得缺失（曾被运行时引用）
 *  7. 入口链零外部 https 请求（大陆访问：跨境资源是故障源）
 *
 * 注意：public/fonts/ 与 public/pdfjs/ 由手动管线生成（见 docs/BUILD.md），
 * CI 构建不含它们时，相关检查只警告不失败。
 *
 * 用法：node scripts/verify-build.mjs [dist目录，默认 dist]
 * 退出码：0=全部通过；1=有 FAIL（CI 阻断发布）
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const DIST = resolve(process.argv[2] || 'dist');
const fails = [];
const warns = [];
const passes = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const pass = (m) => passes.push(m);

const read = (p) => readFileSync(join(DIST, p), 'utf8');
const exists = (p) => existsSync(join(DIST, p));

if (!exists('index.html')) { fail('dist/index.html 不存在'); }
else {
  const html = read('index.html');
  const entries = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)) entries.add(m[1]);
  if (entries.size === 0) fail('index.html 未发现 /assets/ 入口引用');
  for (const e of entries) {
    exists(e.slice(1)) ? pass(`入口存在 ${e}`) : fail(`入口缺失 ${e}（曾导致白屏）`);
  }
  const extRe = /https:\/\/[a-zA-Z0-9.-]+\//g;
  const extHits = new Set((html.match(extRe) || []).map(s => s.replace(/\/$/, '')));
  for (const js of [...entries].filter(e => e.endsWith('.js'))) {
    const body = exists(js.slice(1)) ? read(js.slice(1)) : '';
    for (const h of (body.match(extRe) || [])) extHits.add(h.replace(/\/$/, ''));
  }
  const bad = [...extHits].filter(h => !h.includes('www.w3.org'));
  bad.length ? warn(`入口链发现外部域（人工复核）: ${bad.join(', ')}`) : pass('入口链零外部 https 请求');
}

const jsFiles = [];
(function walk(d, rel) {
  if (!existsSync(join(DIST, d))) return;
  for (const f of readdirSync(join(DIST, d))) {
    const p = join(d, f), r = rel ? rel + '/' + f : f;
    if (statSync(join(DIST, p)).isDirectory()) walk(p, r);
    else if (f.endsWith('.js')) jsFiles.push(r);
  }
})('assets', '');

const referenced = new Set();
for (const jf of jsFiles) {
  const body = readFileSync(join(DIST, 'assets', jf), 'utf8');
  for (const m of body.matchAll(/__vite__mapDeps\(\s*\[([^\]]*)\]/g))
    for (const s of m[1].matchAll(/"(\.\/[^"]+)"/g)) referenced.add('/assets/' + s[1].slice(2));
  for (const m of body.matchAll(/import\(\s*["'](\.\/[^"']+\.(?:js|css))["']\s*\)/g))
    referenced.add('/assets/' + m[1].slice(2));
  for (const m of body.matchAll(/(?:new Worker|new URL|fetch)\(\s*["'](\/[^"']+)["']/g))
    referenced.add(m[1].split('?')[0]);
  for (const m of body.matchAll(/["'`](\/(?:assets|fonts|ocr|pdfjs|reports)\/[^"'`?#]*\.[A-Za-z0-9]{1,5})["'`?#]/g))
    referenced.add(m[1]);
  for (const m of body.matchAll(/["'`](\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|gif|webp|svg|ico|txt|md|pdf|mp4|mp3|woff2?))["'`?#]/g))
    referenced.add(m[1]);
}
let miss = 0;
for (const r of referenced) {
  // fonts/pdfjs 由手动管线提供：缺失只警告（见 docs/BUILD.md），不阻断
  const manual = r.startsWith('/fonts/') || r.startsWith('/pdfjs/');
  // 运行时端点：由 EdgeOne Functions 或部署步骤在发布时提供，不是静态文件。
  const runtime = r === '/deploy-info.json' || r.startsWith('/api/');
  if (!exists(r.slice(1))) {
    if (runtime) pass(`运行时端点（部署时提供）: ${r}`);
    else if (manual) warn(`被引用但缺失（手动管线，见 docs/BUILD.md）: ${r}`);
    else { fail(`被引用但缺失: ${r}`); miss++; }
  }
}
miss === 0 ? pass(`引用完整性：${referenced.size} 个引用 0 缺失`) : fail(`引用缺失共 ${miss} 处`);

if (!existsSync(join(DIST, 'fonts'))) {
  warn('dist/fonts/ 缺失（手动管线，见 docs/BUILD.md），跳过字体校验');
} else {
  const fontCssCandidates = [];
  (function walk(d, rel) {
    for (const f of readdirSync(join(DIST, d))) {
      const p = join(d, f), r = rel ? rel + '/' + f : f;
      if (statSync(join(DIST, p)).isDirectory()) walk(p, r);
      else if (f.endsWith('.css')) fontCssCandidates.push(r);
    }
  })('fonts', 'fonts');
  let fontOk = 0, fontMiss = 0, fontBadMagic = 0;
  for (const css of fontCssCandidates) {
    const body = readFileSync(join(DIST, css), 'utf8');
    if (!body.includes('@font-face')) continue;
    if (!body.includes('font-display')) warn(`${css} 缺少 font-display（建议 swap）`);
    for (const m of body.matchAll(/url\(\s*["']?([^"'()]+)["']?\s*\)/g)) {
      const u = m[1];
      if (u.startsWith('data:') || u.startsWith('http')) continue;
      const fp = join(DIST, dirname(css), u);
      if (!existsSync(fp)) { fontMiss++; fail(`字体缺失: ${css} -> ${u}`); continue; }
      fontOk++;
      if (u.endsWith('.woff2')) {
        const magic = readFileSync(fp).subarray(0, 4).toString('latin1');
        if (magic !== 'wOF2') { fontBadMagic++; fail(`字体魔数异常: ${u}`); }
      }
    }
  }
  fontMiss === 0 && fontBadMagic === 0
    ? pass(`字体：${fontOk} 个引用可解析，woff2 魔数全对`)
    : fail(`字体问题：缺失 ${fontMiss} / 魔数异常 ${fontBadMagic}`);
}

const wasmFiles = [];
for (const d of ['ocr', 'pdfjs']) {
  if (!existsSync(join(DIST, d))) continue;
  for (const f of readdirSync(join(DIST, d), { recursive: true })) {
    const p = join(DIST, d, String(f));
    if (String(f).endsWith('.wasm') && statSync(p).isFile()) wasmFiles.push(join(d, String(f)));
  }
}
let wasmBad = 0;
for (const w of wasmFiles) {
  const magic = readFileSync(join(DIST, w)).subarray(0, 4);
  if (!(magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d)) {
    wasmBad++; fail(`wasm 魔数异常: ${w}`);
  }
}
wasmFiles.length === 0 ? warn('未发现 wasm 文件（OCR 未打包进本次构建）')
  : wasmBad === 0 ? pass(`${wasmFiles.length} 个 wasm 魔数有效`) : fail(`${wasmBad} 个 wasm 魔数异常`);

const mustExist = [
  'ocr/worker.min.js',
  'ocr/lang/eng.traineddata.gz',
  'ocr/lang/chi_sim.traineddata.gz',
  'reports/feature-matrix.md',
  'reports/acceptance-report.md',
];
for (const f of mustExist) exists(f) ? pass(`运行时文件存在 ${f}`) : fail(`运行时文件缺失 ${f}`);

console.log(`\n==== NOVIP verify-build: ${DIST} ====`);
console.log(`PASS ${passes.length} / WARN ${warns.length} / FAIL ${fails.length}`);
for (const m of warns) console.log('  WARN ' + m);
for (const m of fails) console.log('  FAIL ' + m);
if (fails.length) { console.log('\n构建校验未通过，阻断发布。'); process.exit(1); }
console.log('\n构建校验通过，可以发布。');
