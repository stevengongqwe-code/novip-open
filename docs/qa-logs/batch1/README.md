# Batch1 浏览器验收记录（2026-10-24）

本目录保存 **真实 Chrome（headless + CDP）移动视口验收** 的可复现输入与结果：

| 文件 | 说明 |
| --- | --- |
| `cases.json` | 10 个验收用例：首页入口、文本整理、时间戳、房贷、BMI/BMR、MD5、图片取色、长图拼接、PDF 加页码、PDF 裁剪 |
| `make-fixtures.mjs` | 生成测试图片（纯色/双色 PNG）与 3 页 PDF（pdf-lib），输出到 `fixtures/` |
| `fixtures/` | 已生成的测试数据（合计约 4 KB，无真实用户文件） |
| `report-390x844.json` | 390×844 @3x 视口下的真实测量结果（含 console/page error、横向溢出、资源统计） |
| `report-360x800.json` | 360×800 @3x 视口下的结果 |

## 复现步骤

```bash
# 1) 构建并启动本地预览
npm run build
npx vite preview --port 4173 --host 127.0.0.1 &

# 2) 启动真实 Chrome（headless，开放 CDP 端口）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9333 \
  --user-data-dir=/tmp/dsh-chrome-qa --no-first-run --disable-gpu --no-sandbox about:blank &

# 3) 重新生成测试数据（可选，仓库已含 fixtures）
node docs/qa-logs/batch1/make-fixtures.mjs

# 4) 运行验收脚本（file 步骤的相对路径以仓库根目录为基准）
node scripts/browser-audit.mjs http://127.0.0.1:4173 docs/qa-logs/batch1/cases.json \
  docs/qa-logs/batch1/out 390 844
node scripts/browser-audit.mjs http://127.0.0.1:4173 docs/qa-logs/batch1/cases.json \
  docs/qa-logs/batch1/out360 360 800
```

脚本对每个用例检查：页面 H1、横向溢出（`scrollWidth > innerWidth`）、`<24px` 触控目标、console error、page exception、HTTP 失败请求、数据 `fetch` 次数，并输出截图与 JSON 报告。
**注意**：本脚本是桌面 Chrome 的移动视口模拟，不等于 Android/微信内置浏览器真机验收；真机限制见 `docs/batch1-acceptance.md`。
