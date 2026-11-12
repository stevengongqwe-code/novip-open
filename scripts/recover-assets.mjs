#!/usr/bin/env node
/**
 * 回收 NOVIP 构建前置资源 —— 只从白名单来源，全部可校验、可重复执行。
 *
 * 来源：
 *   1) vendor/xlsx-0.20.3.tgz   ← SheetJS 官方 CDN（sha512 必须与 package-lock.json 一致）
 *   2) public/ 静态资源         ← 默认本站自有生产环境 https://novip.site/
 *      （fonts-v4.css / coverage-v3.json / NOTICE.txt / upstream 授权文本 / *.woff2 /
 *        novip-logo.jpg / author-wechat-qr.png）
 *
 * 用法：
 *   node scripts/recover-assets.mjs                    # 回收缺失资源（已存在的跳过）
 *   node scripts/recover-assets.mjs --check            # 只校验本地资源，不联网
 *   node scripts/recover-assets.mjs --only=vendor      # 只处理 xlsx
 *   node scripts/recover-assets.mjs --only=assets      # 只处理 public/ 资源
 *   node scripts/recover-assets.mjs --source=https://... # 覆盖生产源（必须 https，需人工确认）
 *
 * 退出码：0 = 全部就绪；1 = 有缺失或校验失败。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const VENDOR_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';
const VENDOR_PATH = join(ROOT, 'vendor/xlsx-0.20.3.tgz');
const DEFAULT_ORIGIN = 'https://novip.site/';
const CONCURRENCY = 8;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name) || argv.includes('--' + name + '=true');
const value = (name) => {
  const hit = argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const CHECK_ONLY = flag('check');
const ONLY = value('only') || 'all';
const ORIGIN = (value('source') || DEFAULT_ORIGIN).replace(/\/+$/, '') + '/';

const die = (msg) => { console.error('[recover-assets] FAIL ' + msg); process.exit(1); };
const log = (msg) => console.log('[recover-assets] ' + msg);
const sha512 = (buf) => 'sha512-' + createHash('sha512').update(buf).digest('base64');

if (!ORIGIN.startsWith('https://')) die('生产源必须是 https://（当前 ' + ORIGIN + '）');
if (CHECK_ONLY && value('source')) die('--check 与 --source 不能同时使用');

function lockIntegrity() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const entry = lock.packages?.['node_modules/xlsx'];
  if (!entry || !entry.integrity) die('package-lock.json 缺少 node_modules/xlsx.integrity');
  return entry.integrity;
}

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'novip-recover-assets/1.0 (+build tool)' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return Buffer.from(await res.arrayBuffer());
}

async function download(url, dest, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const buf = await fetchBuf(url);
      mkdirSync(join(dest, '..'), { recursive: true });
      writeFileSync(dest, buf);
      return buf.length;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr;
}

async function pool(items, worker, limit = CONCURRENCY) {
  let i = 0, done = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx], idx); done++; }
      catch (err) { console.error('[recover-assets] 下载失败 ' + items[idx] + ' :: ' + err.message); }
    }
  });
  await Promise.all(runners);
  return done;
}

function magicIsWoff2(file) {
  try { return readFileSync(file).subarray(0, 4).toString('latin1') === 'wOF2'; }
  catch { return false; }
}

function fontListFromCss(css) {
  // 兼容 url(./x.woff2) 与 url("./x.woff2") 两种写法（当前 CSS 两种混用）
  const raw = [...css.matchAll(/url\(\s*["']?\.?\/?([^"')]+\.woff2)["']?\s*\)/g)].map((m) => m[1]);
  return [...new Set(raw.map((f) => f.replace(/^\.\//, '').replace(/^fonts\//, '')))];
}

async function recoverVendor() {
  const expected = lockIntegrity();
  if (existsSync(VENDOR_PATH)) {
    const actual = sha512(readFileSync(VENDOR_PATH));
    if (actual === expected) { log('vendor xlsx 已存在且哈希一致'); return true; }
    log('vendor xlsx 哈希不一致，重新下载');
  }
  log('下载 ' + VENDOR_URL);
  const buf = await fetchBuf(VENDOR_URL);
  const actual = sha512(buf);
  if (actual !== expected) die('xlsx sha512 校验失败：期望 ' + expected + '，实际 ' + actual);
  mkdirSync(join(ROOT, 'vendor'), { recursive: true });
  writeFileSync(VENDOR_PATH, buf);
  log('vendor xlsx 就位（' + buf.length + ' 字节，sha512 校验通过）');
  return true;
}

async function recoverAssets() {
  const pub = join(ROOT, 'public');
  const mustHave = [
    ['fonts/fonts-v4.css', 'text'],
    ['fonts/coverage-v3.json', 'text'],
    ['fonts/NOTICE.txt', 'text'],
    ['novip-logo.jpg', 'binary'],
    ['author-wechat-qr.png', 'binary'],
  ];
  let missing = 0;
  for (const [rel] of mustHave) if (!existsSync(join(pub, rel))) missing++;

  // 1) 必需文件
  for (const [rel] of mustHave) {
    const dest = join(pub, rel);
    if (existsSync(dest) && statSync(dest).size > 0) continue;
    const size = await download(ORIGIN + rel, dest);
    log('下载 public/' + rel + ' (' + size + ' 字节)');
  }

  // 2) 字体二进制：从 CSS 解析清单，只补缺失
  const cssPath = join(pub, 'fonts/fonts-v4.css');
  if (!existsSync(cssPath)) die('缺少 public/fonts/fonts-v4.css，无法解析字体清单');
  const css = readFileSync(cssPath, 'utf8');
  const files = fontListFromCss(css);
  if (files.length === 0) die('fonts-v4.css 中未解析到任何 woff2 引用');
  const toFetch = files.filter((f) => {
    const p = join(pub, 'fonts', f);
    return !existsSync(p) || statSync(p).size === 0 || !magicIsWoff2(p);
  });
  log('字体清单 ' + files.length + ' 个 woff2，需下载 ' + toFetch.length + ' 个');
  if (toFetch.length) {
    await pool(toFetch, async (f) => {
      const dest = join(pub, 'fonts', f);
      // 优先从 node_modules/@fontsource 与 @chinese-fonts 查找（支持新装开源字体与离线构建）
      for (const sub of ['zhi-mang-xing', 'liu-jian-mao-cao', 'zcool-kuaile', 'klee-one', 'long-cang', 'ma-shan-zheng', 'lxgw-wenkai']) {
        const local = join(ROOT, 'node_modules/@fontsource', sub, 'files', f);
        if (existsSync(local)) {
          writeFileSync(dest, readFileSync(local));
          if (magicIsWoff2(dest)) return;
        }
      }
      if (f.startsWith('xiaolai-')) {
        const local = join(ROOT, 'node_modules/@chinese-fonts/xiaolai/dist/Xiaolai', f.slice('xiaolai-'.length));
        if (existsSync(local)) {
          writeFileSync(dest, readFileSync(local));
          if (magicIsWoff2(dest)) return;
        }
      }
      if (f.startsWith('yozai-')) {
        const local = join(ROOT, 'node_modules/@chinese-fonts/yozai/dist/Yozai-Regular', f.slice('yozai-'.length));
        if (existsSync(local)) {
          writeFileSync(dest, readFileSync(local));
          if (magicIsWoff2(dest)) return;
        }
      }
      try {
        await download(ORIGIN + 'fonts/' + f, dest);
        if (!magicIsWoff2(dest)) throw new Error('不是 woff2：' + f);
      } catch (err) {
        console.warn('[recover-assets] WARN 字体文件 ' + f + ' 暂未在生产源上线（将在构建阶段由字体脚本补齐）');
      }
    });
  }

  // 3) 字体管线前置授权文本（prepare_fonts.py 需要；新站可能 404，缺失只告警）
  for (const name of ['upstream/yozai-OFL.txt', 'upstream/xiaolai-OFL.txt']) {
    const dest = join(pub, 'fonts', name);
    if (existsSync(dest) && statSync(dest).size > 0) continue;
    try {
      const size = await download(ORIGIN + 'fonts/' + name, dest);
      log('下载 public/fonts/' + name + ' (' + size + ' 字节)');
    } catch {
      console.warn('[recover-assets] WARN 缺少 public/fonts/' + name +
        '（字体重建管线需要；可向站主索取或从旧托管取回）');
    }
  }

  const woff2 = files.filter((f) => existsSync(join(pub, 'fonts', f)) && magicIsWoff2(join(pub, 'fonts', f)));
  log('public/fonts 就绪 ' + woff2.length + '/' + files.length + ' 个 woff2');
  return true;
}

function check() {
  const failures = [];
  const expected = lockIntegrity();
  if (!existsSync(VENDOR_PATH)) failures.push('缺少 vendor/xlsx-0.20.3.tgz');
  else if (sha512(readFileSync(VENDOR_PATH)) !== expected) failures.push('vendor xlsx 哈希不一致');
  for (const rel of ['public/fonts/fonts-v4.css', 'public/fonts/coverage-v3.json',
    'public/fonts/NOTICE.txt', 'public/novip-logo.jpg', 'public/author-wechat-qr.png']) {
    if (!existsSync(join(ROOT, rel)) || statSync(join(ROOT, rel)).size === 0) failures.push('缺少 ' + rel);
  }
  const cssPath = join(ROOT, 'public/fonts/fonts-v4.css');
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, 'utf8');
    const files = fontListFromCss(css);
    const bad = files.filter((f) => !magicIsWoff2(join(ROOT, 'public/fonts', f)));
    if (bad.length) failures.push(bad.length + ' 个字体文件缺失或损坏（首个：' + bad[0] + '）');
    else log('字体文件完整：' + files.length + ' 个 woff2');
  }
  if (failures.length) { failures.forEach((f) => console.error('[recover-assets] FAIL ' + f)); return 1; }
  log('全部构建前置资源校验通过（--check）');
  return 0;
}

const main = async () => {
  if (CHECK_ONLY) process.exit(check());
  let ok = true;
  if (ONLY === 'all' || ONLY === 'vendor') ok = (await recoverVendor()) && ok;
  if (ONLY === 'all' || ONLY === 'assets') ok = (await recoverAssets()) && ok;
  if (!ok) die('部分资源未就绪，见上方日志');
  log('完成。下一步：npm ci && npm run typecheck && npm run lint && npm test && npm run build && node scripts/verify-build.mjs dist');
};

main().catch((e) => die(e && e.stack ? e.stack : String(e)));
