# NOVIP 构建文档（可复现构建）

## 环境要求

- Node.js 20+（已验证 v22.23.4）
- Python 3.10+（仅字体重建管线需要）+ `pip install fonttools brotli`
- 网络：`npm ci` 需要 npm registry；`vendor/xlsx` 需要 SheetJS 官方 CDN（或本地已有缓存）

## 标准构建（本地 / CI）

```bash
git clone <repo> && cd novip
node scripts/recover-assets.mjs    # 1) vendor/xlsx（sha512 与锁文件比对）+ 生产静态资源
npm ci
npm run typecheck
npm run lint
npm test
node scripts/prepare-pdfjs.mjs     # 2) 手动管线：cmaps / standard_fonts / wasm
npm run build                      # = prepare-ocr + prepare-reports + tsc -b + vite build
node scripts/verify-build.mjs dist # 3) 发布门禁：任一 FAIL 即阻断发布
```

说明：

- `scripts/recover-assets.mjs` 只从白名单来源取文件：SheetJS 官方 CDN（哈希必须与 `package-lock.json` 一致）与本站自有生产环境；已存在文件跳过，`--check` 只做本地离线校验。
- `npm run build` 自动产出 `public/ocr/`（tesseract worker/wasm/中英语言包，来自 npm 依赖）与 `public/reports/`（`docs/*.md`，缺失仅告警不阻断）。
- 生产静态资源（`public/fonts/`、`public/novip-logo.jpg`、`public/author-wechat-qr.png`）当前未入库，由 recover-assets 回收；是否入库、是否走 Git LFS/Release 附件由站主决定。
- `public/pdfjs/` 必须生成：应用通过 `/pdfjs/cmaps/`、`/pdfjs/standard_fonts/`、`/pdfjs/wasm/` 加载 PDF 运行时资源。`verify-build` **不检查**该目录，漏跑会静默降级。

## 字体（从源头重建，非必需）

`public/fonts/` 可直接使用回收产物；若要从源头重建：

```bash
# 前置：public/fonts/upstream/yozai-OFL.txt 与 upstream/xiaolai-OFL.txt（已入库）
#       font-sources/JasonHandwriting*.ttf（脚本内官方仓库 URL）
python3 scripts/prepare_fonts.py    # -> fonts-v2.css / coverage-v2.json
python3 scripts/extend_fonts.py     # -> fonts-v3.css / coverage-v3.json（寒蝉 / 辰宇）
python3 scripts/refresh_ui_font.py  # -> fonts-v4.css / paperpen-ui-v4.woff2
```

应用实际请求 `/fonts/fonts-v4.css` 与 `/fonts/coverage-v3.json`，必须跑到 v4 产物；只跑第一步会缺少应用需要的文件名。

## 已知缺口（2026-10-24 记录，本文档随源码更新可能滞后）

- `scripts/generate-seo.mjs` 与 `edgeone.json` 重写规则在 `main` 上的可用性需按当前分支自行复核；若缺失，直接把 `dist/` 当纯静态站点部署时 `/tools/*` 深链会 404。
- 生产部署使用 EdgeOne Makers 的静态重写规则与 `/tools/*/index.html` 预渲染产物；换用其它托管需自行准备等价重写规则。
- `scripts/prepare-reports.mjs` 期望的 `docs/feature-audit.md` 不在快照内，会跳过并告警（不阻断构建）。

## 本快照的构建状态

本公开快照**未附带构建通过证明**：`vendor/xlsx-0.20.3.tgz` 与 `public/` 下的生产字体、Logo、作者二维码都不在仓库内，补齐需要联网下载。请按上面的标准构建流程补齐后自行验证；`.github/workflows/ci.yml` 只是仓库内的构建门禁定义，不代表它在你的 fork 上已经跑通。
