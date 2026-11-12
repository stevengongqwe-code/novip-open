# NOVIP 逐项功能验收矩阵

当前结果以下表为准。

## 本轮 N1–N9 及基础要求最终矩阵

|要求|状态|路由 / 代码|复现QA / 样例 / 实际结果与限制|
|---|---|---|---|
|1 NOVIP品牌与首页口号|完成（沿用原Logo）|/；Brand.tsx、Home.tsx、index.html、third-party-notices|首页22入口DOM；原Logo文件未修改；副标题“遇到收费功能？先来 NOVIP 看看。”；移除未绑定域名展示；旧最近记录键兼容|
|N1 免费替代搜索|完成（站内维护表）|/；search-core.ts|novip.test.ts：21组中英文/同义词检索及未知/恶意输入；PPT体积太大命中瘦身；无结果明确暂未收录。外部工具沿用cost官方清单，不作实时AI承诺|
|N2 报名材料检查|完成（客观信息）|/tools/materials；Materials.tsx、materials-core.ts|480×640/100KiB真实JPG通过；尺寸/大小/文件名错误独立失败；JSON导入导出与错误拒绝；DPI、背景、人像等标未知/人工复核；图片经完整解码，EXIF显示尺寸优先；PDF格式为文件头检查，不代表结构完整。修复链接到原照片/图片工具|
|N3 图片批处理中心|完成（有限格式）|/tools/images；BatchQueue.tsx、Images.tsx、image-core.ts|20输入19成功1失败，ZIP含19可解码JPG+错误记录；排序/移除/清空、逐项状态/下载、串行、取消保留成功项、只重试失败/跳过；参数处理中禁改；单图20MB/总80MB；KiB目标仅JPEG|
|N3 PDF批任务|完成（提取/PNG）|/tools/batch-pdf；BatchPdf.tsx、原conversion/pdf.ts|DOM实际提取第2页为单页PDF，队列ZIP重开；PNG复用原PDF渲染器；每PDF20MB/50页、队列20份/80MB/输出100MB|
|N4 PPTX瘦身|完成（受支持图片子集）|/tools/ppt-slim；PptSlim.tsx、ppt-core.ts|原9359839→860953 bytes，PNG降采样；ZIP结构及python-pptx重开2页/文字保留，所有非媒体内容逐字节一致；无收益不允许下载“变小结果”。SVG/EMF/字体/动画/嵌入对象保留、不删未使用媒体；未通过WPS/Office GUI实机|
|N5 扫描增强|部分（可靠基础能力）|/tools/scan；Scan.tsx、scan-core.ts|旋转/亮度对比/彩色灰度黑白/背景减弱Beta/轻锐化；合成阴影与低对比样张实际PNG及单页PDF可打开；前后对照；400万像素上限；不提供四角透视定位、多图PDF或原文恢复；低端Android性能未验证|
|N6 PDF隐私清理|完成（限定元数据）|/tools/pdf-privacy；Privacy.tsx、privacy-core.ts|删除Info字典、Metadata引用/类型化XMP流；重新打开比对；pypdf：Author为空、正文仍在、页数不变；加密无法载入、签名字段/ByteRange默认阻止；不是全文匿名，注释/附件/隐藏层/未引用旧对象等仍有风险|
|N7 批量OCR|部分（本地引擎与队列已实现）|/tools/ocr；Ocr.tsx、ocr-core.ts、BatchQueue|中英真实Tesseract样张识别00123/中国通过；20文件上限、逐项结果可编辑/复制/独立与合并TXT/ZIP；模型按需缓存。扫描PDF：先120DPI转图，最多5选中页、总50页/20MB；整条浏览器Worker+PDF OCR链尚未浏览器实测，不宣称已验收|
|N8 功能许愿池|部分（诚实兜底）|/tools/wishes；Wishes.tsx|需求/软件/期望/自愿回访/授权确认；复制/下载/无默认收件人的邮件草稿；明确尚未在线提交。无已授权接收后台/项目邮箱，不伪造开发者收到、仅公开本轮用户明确授权的微信StevenGRK，不公开其他私人邮箱/学校，不提供假排名或投票|
|N9 任务入口与最近|完成（工程验证）|/；registry/Home/main|22入口全部点击挂载，无错误边界；保留16原路由/hash，6新增工具，最近6工具ID可清除；所有结果页通用反馈可达许愿池|
|A手写与C照片回归|完成（核心/原生检查），手机受限|App/engine/export、features/id-photo|原19组相关测试；超长中文分页无丢字；480×640/100KiB真实编码、无法压到目标拒绝且尺寸不变；EXIF1/6/8原生检查；无Android触屏实机|
|B文件与D文献/DOCX回归|完成（已有有限模式）|conversion、references、DocxCheck|保留53既有测试；原生PDF提取删除分组拆分、多图顺序/边距；DOCX报告定位与字体修复；双版本规则辅助保留，不宣称标准完全保证；复杂Office高保真仍禁用|
|E表格与F通用回归|完成（已有范围）|Sheets、TableClean、Academic、Planner等|DOM真实00123保留、去重撤销/XLSX重开；课设可编辑6页PPTX；简历PDF；成绩/统计/会员计算；多页中文简历6页可重开|
|0 安装及四检查|完成|package.json；qa-logs/novip|基线53 tests全过；本轮59 tests，typecheck/lint/build，原DOM回归、新DOM、原生集成/独立解码日志；构建以最终build.log为准|
|10 移动端/浏览器/Network|受限|既有响应式与本轮队列布局|当前没有control-browser工具，未启动替代浏览器；未进行Android 360/390/480实机、IME、触屏、系统下载、真实Network/内存测量。DOM原+新两套测试fetch/XHR/beacon均0；不能替代浏览器验收|
|禁止/暂缓范围|遵守|原hosting.json及项目边界|不改域名/DNS/Graybird/访问范围，不加校园数据库；课件四合一暂缓；不购API/服务器、不加登录或会员|

复现命令：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`node tests/upgrade-ui.mjs`、`node tests/novip-ui.mjs`、`node --import tsx tests/novip-integration.ts`、`node tests/run-native-regression.mjs`、`python tests/verify-novip.py`。原生测试先生成样例，再执行新DOM与独立解码。

样例：`/samples/novip/photo-480x640.jpg`、`20-image-mixed.zip`、`slim.pptx`、`metadata-clean.pdf`、`scan-gray.png`、`scan.pdf`。均为合成测试数据。原始大PPT由tests/novip-integration.ts可重建。原生引擎输出/DOM下载记录在test-artifacts（可重新运行生成），验收日志在docs/qa-logs/novip，并随reports公开。


## 原有功能细项与历史测试证据（保留范围）

# NOVIP 全站功能验收矩阵（2026-10-16）

下方原有模块表记录上轮范围。本轮实际基线V10，新增与修订结论以下表优先；所有“完成”均指明确列出的有限功能，不代表Android实机验收。

状态定义：“完成”指列明的MVP及对应工程验证通过，不等于Android/桌面浏览器实机验收通过。浏览器与移动端验证限制在表尾单列，不能把DOM/原生Canvas验证冒充浏览器验证。

生产源站：https://zhijian-handwrite.stevengongqwe.chatgpt.site/ 。本表为本次升级的待发布内容；最终发布成功状态及版本/commit以交付消息和原生部署记录为准。

|编号/任务书要求|状态|页面及具体行为|源码与证据|
|---|---|---|---|
|0 审计、原项目、回退|完成|沿用原站项目，基线V10保留|feature-audit.md；.openai/hosting.json；部署记录|
|0 安装/typecheck/lint/test/build|完成|依赖安装；显式TypeScript检查；真实ESLint10；53组核心测试；Vite构建|package.json、eslint.config.mjs、qa-logs|
|1 首页主张与5类入口|完成|[/](https://zhijian-handwrite.stevengongqwe.chatgpt.site/)：“大学生，别花冤枉钱。”，22工具|tools/Home.tsx、registry.ts；DOM14项|
|1 任务搜索、最近使用与清除|完成|按名称/任务搜索；只保存最近6个有效工具ID；可清除|registry.ts；DOM验证无文件内容持久化|
|1 懒加载、独立错误边界、处理中/失败|完成|各工具独立lazy及ToolBoundary；新工具useJob取消/异常/状态|main.tsx、tools/common.tsx|
|1 免费/无需强制登录/无水印|完成|所有基础页面无付费墙，无注册要求，输出无站点水印|代码审计；真实导出检查|
|1 反馈与建议入口|部分|匿名报告可下载、复制或系统分享；明确不会自动送达|tool-common.tsx；无接收后台/专用邮箱配置，未公开私人联系信息|
|1 文件限制、危险类型、ObjectURL/Worker释放|完成（已覆盖范围）|各工具显式MB/页数/像素/行数限制；本机处理|conversion/files.ts、photo/core.ts、sheets/core.ts；错误样例测试|
|A TXT/DOCX、中英文、标点、多段落|完成|[/#handwrite](https://zhijian-handwrite.stevengongqwe.chatgpt.site/#handwrite)|App.tsx、engine.ts；既有19组手写/字库测试|
|A 多页PNG/PDF、长文本分页|完成|PNG多页ZIP；PDF实际多页|export.ts；>1300字、1001格分页；原生渲染导出|
|A 纸张与报告纸|完成|白纸、横线、方格、400字稿纸、通用自绘实验报告纸、自有背景|engine.ts；实验纸页头避让/长文测试|
|A 字体许可及笔迹参数|完成（模拟边界）|保留10款授权字体/个人字库；字号、行距、边距、墨色、随机变化|fonts/NOTICE.txt；不保证真人笔迹或审核|
|A 文字偏移|完成|水平/垂直±15px，预览/导出共用drawPage|engine.ts/App.tsx；边界测试|
|B PDF合并/单页拆分/旋转|完成|[/tools/files](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/files)|conversion/pdf.ts；2份合并页数相加、旋转保留全部页|
|B 范围分组拆分|完成|例如1-3;4-6，各组新PDF|engine.ts；实际文件重开/页数|
|B 删除/提取页面|完成|范围提取或删页；禁止误删全部|PDFDocument独立重开检查|
|B PDF→PNG/JPG/页范围/DPI|完成|96/144/200 DPI及范围；上限50页|既有文件阶段1/2共28检查|
|B 多图→PDF排序/页面尺寸/边距|完成|上移下移、A4/原始尺寸、四边mm|engine.imageFrames；实际2页及方向/10mm边距|
|B 基础PDF体积优化|完成（有损限定）|96DPI栅格化，明确丢失可搜索文字/表单/签名；没变小则拒绝|63770→27883字节测试；无收益样例拒绝|
|B DOCX→PDF/图片/PPTX|完成（基础近似/视觉模式）|中文文本、普通图片/表格；复杂形状或版式明确拒绝|office.ts；可打开的PDF/PNG/页面图片PPTX|
|B PPTX→PDF/图片/DOCX|完成（基础静态/视觉模式）|不保证母版、动画、图表和复杂对象|阶段1/2真实导出及损坏样例|
|B PDF→DOCX|完成（两种有限模式）|整页图片不可编辑，或仅可编辑文字提取，不还原复杂排版|扫描件文本模式拒绝，不假造OCR文本|
|B PDF→PPTX|完成（不可编辑图像）|每页作为一张幻灯片图像|实际PPTX包/幻灯片数量检查|
|B 多图→DOCX/PPTX|完成（图像嵌入）|按队列顺序嵌图|原生生成库；python-docx/python-pptx重开|
|B 复杂Office高保真|阻塞，未启用|真实LibreOffice后端方案保留于backend/；当前静态站无该后端|未购买服务器、未配置收费API；控件明确禁用|
|C 480×640 / JPG≤100KiB|完成（引擎/DOM验证）|[/tools/id-photo](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/id-photo)|实际101365字节，独立Pillow重开480×640|
|C 上传/拖动/缩放/重置/px/mm/DPI|完成（工程验证）|JPG/PNG/WebP，真实格式检查，固定输出像素|原照片5组+11项DOM流程|
|C 达不到KB不降像素|完成|2000×2000 / 5KiB无法满足时错误、无下载、尺寸不变|真实编码及核心测试|
|C EXIF/长横图/连续切换|部分|原生引擎EXIF1/6/8、极长横图边界；DOM换图取消通过|Android浏览器EXIF及实机手势未验证|
|C 手动抠图/换底|部分，Beta|[/tools/background](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/background)：红/蓝/白/自定义、涂抹/恢复、5步撤销、保留尺寸PNG|background-core.ts；真实像素擦除/恢复测试；最多200万像素|
|C 自动高质量人像抠图|阻塞，未发布|没有通过真实头发/复杂背景/手机性能验收的自动模型|未用简单涂抹伪称自动AI抠图|
|C 官方考试场景预设|阻塞，未发布|未核实当年官方地区/年份要求；提供手动参数和一寸/二寸参考|不硬编码全国通用、不保证报名通过|
|D GB/T2015/2025五类题录|完成（规则辅助试用）|[/#references](https://zhijian-handwrite.stevengongqwe.chatgpt.site/#references)|40合成条款样例×2版本；既有标准来源保留；不编造DOI|
|D 作者/标点/日期/缺项/复制/TXT|完成（覆盖范围）|逐条确认、学校覆盖、DOI可缺；有限结构解析|references/core.ts；真实TXT下载及日期/编号测试|
|D 调序/编号引用|完成|上下调序，连续编号，变更后重新确认|References.tsx；原文不变；不自动改正文引用|
|D DOCX结构/格式检查|完成（可读取范围）|[/tools/docx-check](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/docx-check)：标题outline、分脚本字体继承、字号、倍数行距、节页边距、基础参考文献编号|10组新增测试的一部分；位置为段落/节，未知不判合格|
|D 自有学校模板与报告|完成（有限建议）|上传自己的DOCX模板提取常见属性，预览后应用；报告JSON|不维护全国学校规则；混合字体/主题与复杂行距标未知|
|D 自动修复|部分（字体字号）|范围预览+确认，仅对未检测为标题的正文文字设字体/字号，生成副本|真实DOCX独立重开，移除冲突的主题字体属性；不自动修复杂版式/页码|
|E 工作簿/工作表/列映射/合并|完成|[/#sheets](https://zhijian-handwrite.stevengongqwe.chatgpt.site/#sheets)|既有真实Worker、异构列、前导零、日期/公式缓存检查|
|E 去重/空行/列名统一/拆合列/筛选|完成（单表值模式）|[/tools/table-clean](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/table-clean)：按字段去重，操作链预览、撤销、恢复源表|data-core.ts；不覆盖原文件；重复空表头先去合并页映射|
|E CSV↔XLSX|完成|真实XLSX/UTF-8 CSV读写；原公式不重新计算|实际XLSX重新打开，00123保留文本；CSV公式注入防护|
|F1 批量图片尺寸/KB/格式/命名/ZIP|完成|[/tools/images](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/images)：逐项顺序/删除/错误报告，前后字节/节省比例|实际3格式解码及DOM生成ZIP；KB仅JPG，无静默降像素|
|F1 基础图片OCR|完成（本地引擎），浏览器兼容待验|[/tools/ocr](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/ocr)：简中/英，模型延迟本地加载，结果可编辑TXT|真实Tesseract WASM+本地模型，中英00123；引擎置信分非准确率|
|F2 DOCX/TXT/PDF文字比较|完成（文字层）|[/tools/compare](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/compare)：逐行增删、差异TXT|LCS重建两侧原文，扫描件提示OCR；不宣称语义比较|
|F3 免费简历|完成（页面图像PDF）|[/tools/resume](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/resume)：3自有模板/表单/预览/多页PDF|实际1页及长中文6页PDF重开；不上传个人信息|
|F4 实验数据/标准曲线|完成（计算边界）|[/tools/lab](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/lab)：均值/样本与总体SD/相对误差/最小二乘/R²/吸光度反算|已知数值测试、退化/溢出拒绝、外推提示；公式/复制/JSON/CSV|
|F5 课设辅助|完成（本地模板）|[/tools/course](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/course)：清单/日期/报告提纲/材料成本/Markdown/PPTX|实际可编辑6页PPTX；长要求摘要标明，全文保留Markdown|
|F6 成绩反推/GPA|完成（自设规则）|[/tools/grades](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/grades)|自定义权重/分段/学分；数学验证及JSON输出，非官方判定|
|F7 会员成本/免费替代|完成（核实范围）|[/tools/cost](https://zhijian-handwrite.stevengongqwe.chatgpt.site/tools/cost)|用户输入现价；官方LibreOffice/GIMP/Zotero/PDFsam链接与局限|
|7 队列/排序/删除/ZIP/错误记录|完成（适用批处理）|文件中心、图片批量；清晰逐项结果|DOM真实下载和ZIP包内解码验证|
|8 课件四合一|暂缓|无入口、无假工具|用户明确证据不足|
|8 校园/甘农信息查询|按要求排除|无页面、无API、未删除用户数据（未发现相关模块）|源码审计；路由/目录测试|
|9 Android360/375/390/480与桌面浏览器|未完成实机验收|CSS断点/44px按钮/PointerCapture已实现；仅375px合成触屏事件验证|没有可用control-browser；未启动替代浏览器；输入法遮挡/滚动/下载需实机|
|9 Network与性能|部分|DOM测试fetch/XHR/beacon=0；源码仅Office显式保真模式有文件POST；OCR资源同源加载|未用真实浏览器Network/LCP/峰值内存测量；首页未静态引入OCR/PDF/模型|
|9 发布与回退|以原生部署结果为准|原域名、原项目；保留V10回退|release-notes.md、交付消息的最终version/commit|

未宣称：任意题录完全正确、任意Word准确页码、扫描PDF自动成为完美可编辑Word、任意照片官方审核一定通过、Android未实测却已验收。

## 红黑白主题与作者联系更新

用户明确授权公开作者微信StevenGRK。全站界面从绿色改为Logo对应红黑白；白色/浅灰底、黑灰正文、红色主按钮与导航选中态，原Logo不变。AuthorContact.tsx在所有路由底部展示微信号，提供复制与失败时手动选择兜底；许愿池说明可通过该微信主动发送需求，不自动发送任何消息。typecheck/lint及实际DOM复制测试通过；未新增Android实机或真实浏览器视觉验证。

## Batch1（2026-10-24）浏览器工具箱新增矩阵

本轮在 PR #26 基线（27 工具）上新增 8 个工具并扩展开发者工具，工具总数 35。逐项证据、测试数字、chunk 体积与浏览器验收见 [Batch1 验收报告](batch1-acceptance.md)。

| 工具 | 路由 | 状态 | 自动化测试 | 真实浏览器验收（390/360 视口） | 主要限制 |
|---|---|---|---|---|---|
| 开发者与文本工具箱（扩展） | /tools/developer | 完成（Batch1，扩展至 17 个本地操作） | 31 例 | MD5("abc") 实测正确 | MD5/SHA-1 仅校验用途；JWT 仅解码不验签；HMAC 密钥仅十六进制 |
| 时间戳转换器 | /tools/timestamp | 完成（Batch1） | 21 例 | epoch 0 → 1970-01-01 08:00（上海） | 11/12 位需手动选单位；不支持闰秒；不建模历史夏令时 |
| 文本工具箱 | /tools/text | 完成（Batch1） | 43 例（核心+UI） | 去重/统计/整理实际输出正确 | 排序为字符串序；50 万字符上限；不做文件导入 |
| 房贷与利息计算器 | /tools/finance | 完成（Batch1） | 75 例（核心+UI） | 100 万/4.9%/30 年月供 5307.27 页面可见 | 不含手续费/保险/LPR 浮动；提前还款为估算 |
| BMI / 体脂率参考计算 | /tools/health | 完成（Batch1，参考估算） | 76 例（核心+UI） | 175cm/70kg/30 岁 → BMI 22.9、BMR 1649 | 估算非诊断；儿童不适用成人分类 |
| 图片取色 / 颜色转换 | /tools/color-picker | 完成（Batch1） | 30 例 | 上传双色 PNG → 画布取色/主色板正常 | 大图缩小预览但取色取原图像素；半透明像素不入主色板 |
| 长图拼接 | /tools/stitch | 完成（Batch1） | 34 例（核心+UI） | 双图拼接完成并下载 PNG | 2–10 张、总 ≤40MB、单边 ≤20000px、总面积 ≤8000 万像素 |
| PDF 加页码 | /tools/pdf-page-number | 完成（Batch1） | 27 例（含 pdf-lib/pdfjs 集成） | 3 页 PDF 生成并出现下载 | 仅 ASCII 页码（中文页码需嵌入 CJK 字体，暂不做）；加密 PDF 不支持 |
| PDF 裁剪 | /tools/pdf-crop | 完成（Batch1） | 29 例（核心+UI） | 3 页 PDF 四边各 10mm 裁剪生成 | 裁剪=改变可见区域、不删除内容、不是脱敏；加密 PDF 不支持 |

- 集成验证：`npm run typecheck` 通过；`npm test` **431/431 通过**；`npm run build` 通过；`node scripts/verify-build.mjs dist` PASS 10 / WARN 1 / FAIL 0；真实 Chrome 390×844 与 360×800 各 **10/10** 用例通过（0 console error、0 横向溢出、0 数据 fetch）。
- 未验证：Android/微信内置浏览器与 iOS Safari 真机；中文页码；加密 PDF；AES-GCM 与文件流式哈希（ToolKnit 开发者能力中的余项）。
