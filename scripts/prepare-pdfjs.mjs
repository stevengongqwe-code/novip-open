#!/usr/bin/env node
/**
 * 从 node_modules/pdfjs-dist 同步 public/pdfjs 运行时资源。
 * （仓库此前没有这一步，导致 public/pdfjs 只能靠人工同步——CI 缺口，已补）
 *
 * 复制：
 *   node_modules/pdfjs-dist/cmaps/          -> public/pdfjs/cmaps/
 *   node_modules/pdfjs-dist/standard_fonts/ -> public/pdfjs/standard_fonts/
 *   node_modules/pdfjs-dist/build/*.wasm    -> public/pdfjs/wasm/
 * 缺任一项即报错退出（CI 阻断），不静默跳过。
 */
import { cpSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'node_modules/pdfjs-dist';
const DST = 'public/pdfjs';
const die = (m) => { console.error('prepare-pdfjs 失败: ' + m); process.exit(1); };

if (!existsSync(SRC)) die('node_modules/pdfjs-dist 不存在，请先 npm ci');
mkdirSync(DST, { recursive: true });

for (const dir of ['cmaps', 'standard_fonts']) {
  const s = join(SRC, dir), d = join(DST, dir);
  if (!existsSync(s)) die(`缺少 ${s}`);
  cpSync(s, d, { recursive: true });
  console.log(`已同步 ${d} (${readdirSync(d).length} 文件)`);
}

// pdfjs-dist 的 wasm 位置随版本变化：3.x/4.x 在 build/，6.x 在 wasm/，部分发行版在包根。
// 逐层探测，任一命中即复制到 public/pdfjs/wasm/（页面通过 wasmUrl 指向该目录）。
const wasmCandidates = [join(SRC, 'wasm'), join(SRC, 'build'), SRC];
mkdirSync(join(DST, 'wasm'), { recursive: true });
let n = 0;
for (const dir of wasmCandidates) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.wasm')) continue;
    if (existsSync(join(DST, 'wasm', f))) continue;
    copyFileSync(join(dir, f), join(DST, 'wasm', f)); n++;
  }
}
if (n === 0) {
  // 兜底：递归查找（排除 node_modules 深层依赖的无关 wasm）
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(p, depth + 1); }
      else if (entry.name.endsWith('.wasm')) { copyFileSync(p, join(DST, 'wasm', entry.name)); n++; }
    }
  };
  walk(SRC);
}
n === 0 ? die('未找到任何 wasm 文件') : console.log(`已同步 wasm/ (${n} 文件)`);
console.log('prepare-pdfjs 完成');
