# NOVIP 高清宣传截图

这套截图由真实的 Chromium + Playwright 对公开网站 https://novip.site 截取，不是 AI 生成或界面概念图。

- 电脑：1600 × 1000 CSS 像素、DPR 2，输出 **3200 × 2000** PNG
- 手机：390 × 844 CSS 像素、DPR 3，输出 **1170 × 2532** PNG
- 页面：首页、PDF 合并拆分、期末成绩反推、课程表、报名照片
- 每次执行均以当时线上内容为准。线上尚未部署的代码不会显示在截图里。

运行方式：本仓库只保留采集脚本 `scripts/capture-showcase.mjs`，不含自动提交截图的 CI 工作流。需要重新截图时，在本机按脚本头部说明准备隔离的 Playwright（脚本通过环境变量 `NOVIP_PLAYWRIGHT_MODULE` 指定 Playwright 模块路径），执行 `node scripts/capture-showcase.mjs`，产物写入 `docs/screenshots/`；请自行复核后再提交。

**注意：** 截图为采集当时线上内容；线上尚未部署的代码不会显示在截图里。“功能已合并”不等于“生产站点已上线”。
