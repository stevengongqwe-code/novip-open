# vendor/xlsx-0.20.3.tgz 缺失问题说明

## 现状

`package.json` 以 `file:vendor/xlsx-0.20.3.tgz` 引用 xlsx，但 `vendor/` 目录未提交到仓库，
导致全新克隆后 `npm ci` 直接失败（P0-1 阻塞项，2026-10-18 核实）。

## 为什么不能从 npm 直接安装

`xlsx` 0.20.x 系列**未发布到 npm 公共仓库**（`npm view xlsx versions` 最高仅到 0.18.5）。
SheetJS 官方将 0.19+ / 0.20.x 通过自有 CDN 分发：`https://cdn.sheetjs.com/xlsx-0.20.3/`。
这正是原作者采用 `file:` 本地 vendoring 的原因。

## 恢复方案（已验证）

2026-10-18 从官方 CDN 取回 tarball，并与 `package-lock.json` 记录的完整性哈希比对：

- 来源：`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`（2,409,319 字节）
- 期望（package-lock.json）：`sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`
- 实测：**完全一致** → 取回的文件与原作者 vendoring 的字节完全相同。

CI（`.github/workflows/ci.yml`）在 `npm ci` 之前自动执行"恢复 + sha512 校验"步骤，
校验失败则阻断构建。因此 `package.json` 的 `file:` 声明保持原样，无需修改。

## 备选：彻底 vendoring

如希望仓库完全自包含（不依赖构建时下载），可将已验证的 tarball 放入 `vendor/xlsx-0.20.3.tgz`
后提交。注意：GitHub MCP 推送通道为纯文本，二进制文件会损坏，须经由 git CLI 或网页端上传。

## 2026-10-24 复核

- 重新从官方 CDN 取回 tarball：2,409,319 字节，sha512 与 `package-lock.json` **完全一致**（本轮再次实测 MATCH）。
- 本快照已包含 `.github/workflows/ci.yml`，它在 `npm ci` 之前执行“恢复 + sha512 校验”；本地开发仍推荐先跑 `node scripts/recover-assets.mjs --only=vendor`。
