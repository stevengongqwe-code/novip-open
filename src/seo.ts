import {tools, PUBLIC_TOOL_COUNT, type Page, type ToolID} from './tools/registry.ts';
import {getLanguage, getLocaleDict, type Language} from './i18n';

export const SITE_URL = 'https://novip.site';
export const HOME_TITLE = `NOVIP 2.0 大学生免费工具箱｜${PUBLIC_TOOL_COUNT} 个 PDF、图片、文本、课表、PPT与校园工具`;
export const HOME_DESCRIPTION =
  `大学做作业、报名、排版不用开会员！NOVIP 2.0 提供 ${PUBLIC_TOOL_COUNT} 个免费实用工具：PDF 合并拆分压缩加页码、A4 证件复印拼版、报名照片体检、手写字迹生成、课表导出、PPT 生成与图片提取、Mermaid 流程图、错题本、生活费、实习工时与答辩计时等，无强制登录、无下载水印。`;

// 需要预渲染独立页、进 sitemap 与 EdgeOne 规则的路径：/tools/*、/nav，以及 Claude 体检门户 /verify。
export const pathTools = tools.filter(
  (tool) => tool.path.startsWith('/tools/') || tool.path === '/nav' || tool.path === '/verify',
);

/**
 * 额外的独立页路径（不在 registry 的工具列表里）。
 * 用途：让 /verify 这类「系统页」照样进 sitemap 与 EdgeOne 规则，但不占「工具总数」的口径。
 * 目前 registry 里也保留了一条 verify 工具（用于顶栏标题/面包屑），两者用 Set 去重，绝不重复。
 */
export const EXTRA_PATH_TOOLS = [{id: 'verify', path: '/verify'}] as const;

/** 需要预渲染与配规则的完整路径清单（工具 + 额外独立页，按路径去重） */
export const prerenderPaths: string[] = [
  ...new Set([...pathTools.map((tool) => tool.path), ...EXTRA_PATH_TOOLS.map((tool) => tool.path)]),
];

// Visible usage notes shared by the pre-rendered document and the React UI.
export const toolNotes: Partial<Record<ToolID, string>> = {
  wrongbook: '填写错题和答案，复习时先隐藏答案再翻看。记录保存在当前设备浏览器，请定期导出 JSON 备份。',
  'campus-budget': '设定生活费预算，逐笔记录支出，可导出 CSV；记录仅保存在本机，需自行按周期清空。',
  'internship-hours': '填写上班、下班、休息时间和时薪计算预计报酬，支持跨午夜。此工具不计算加班法定报酬。',
  'priority-matrix': '按紧急和重要划分任务象限，可标记完成状态或导出 JSON。数据仅存本机。',
  'defense-pacer': '粘贴答辩讲稿，按估算语速和目标时长查看时间差，可开启排练倒计时，实际以现场试讲为准。',
  "batch-pdf": "选择PDF和页范围，再提取页面或转为PNG。逐项核对结果后下载；每个文件最多20MB，最多处理50页。",
  "materials": "先填写报名要求的格式、像素、大小和文件名规则，再选择材料检查。规则由你提供，结果不能代替报名系统审核。",
  "ppt": "选择PPTX并设置图片压缩参数，下载后检查图片清晰度与排版。仅压缩嵌入图片，不保证所有演示文稿都能明显缩小。",
  "scan": "导入扫描图片后调整旋转、亮度、对比度与灰度，预览满意再下载。背景减弱为Beta功能，无法恢复原图没有记录的细节。",
  "privacy": "选择PDF，清理作者等元数据并核对前后结果。元数据清理不等于全文匿名化；正文、注释、附件等仍可能包含身份信息。",
  "wishes": "描述需要的工具功能，可复制需求或打开邮件草稿。当前没有在线提交服务，需要你自行发送邮件。",
  "files": "选择文件与转换任务，完成后打开输出核对内容。Office基础转换可能重新排版；扫描PDF需要先识别文字，不能直接成为可编辑原文。",
  "photo": "根据报名通知设置像素、比例与文件大小，裁剪预览后下载照片。请以报名系统要求为准，尺寸合规不保证审核通过。",
  "images": "选择图片并设置目标尺寸、格式与压缩参数，预览后导出。压缩可能损失细节，格式支持取决于当前浏览器。",
  "background": "手动涂抹要移除的背景，也可恢复误删区域，再选择底色下载。本工具为手动处理Beta版，不是自动高质量人像抠图。",
  "handwrite": "输入中文文字，选择手写字体与纸张，多页自动排版后导出 PNG 或 PDF。文字与个人字库只在浏览器本地处理，不上传；单次最多 20,000 字。定位为排版、练习与手帐用途。",
  "references": "粘贴每行一条的题录或手工填写字段，按 GB/T 7714—2025 / 2015 格式化并逐条校验，确认后复制或导出 TXT。工具只处理已支持的结构，不联网补造题录，提交前请对照原文与学校规范核对。",
  "ocr": "选择清晰的中英文图片，在本机识别后复制文字。首次需加载识别资源，识别结果可能有误，提交或引用前请人工校对。",
  "docx-check": "先设置自己的排版规则，再导入DOCX检查标题、字号、行距与页边距。规则检查不能代替学校模板审核。",
  "compare": "导入TXT、DOCX、PDF或粘贴两份文字，逐行查看增删差异。只比较可提取文本，不判断语义或像素版式；扫描PDF需先OCR。",
  "resume": "填写教育、实践与项目经历，选择模板预览后下载无水印PDF。PDF为页面图片，文字不可编辑或搜索，请核对分页和中文显示。",
  "course": "填写课程任务与时间安排，整理报告提纲、答辩PPT和材料成本。导出内容需要自行补充核实，不代写课程成果。",
  "table-clean": "导入Excel或CSV，选择字段去重、列名统一、拆合列或筛选，核对结果再下载。建议保留原文件，避免误删有效数据。",
  "sheets": "导入 XLSX 或 CSV，把多份报名表按列名对齐合成一张，核对行数与预览后再下载。文件只在浏览器本地处理，不上传；公式只用缓存值，复杂样式不保留。",
  "lab": "按提示输入实验数据，计算均值、标准差、相对误差或线性拟合。请自行核对单位、样本和适用公式，结果不代替实验判断。",
  "grades": "输入平时成绩、考试权重、目标分数，或课程成绩与学分计算GPA。绩点规则由你设置，还需核对学校最低分及其他规定。",
  "cost": "输入实际价格、购买周期和使用次数计算单次成本，再查看免费替代方案的限制。价格不作实时承诺，不提供破解或绕过许可。",
  "leave-helper": "填写请假事由与对象，生成微信、正式、当面三版文字，按需修改后自行发送。工具不代发消息，也不保证请假获批。",
  "material-collector": "导入名单与收到的文件，自动匹配后人工修正歧义，再导出核对表与整理ZIP。匹配结果需要你逐项核对。",
  "file-organizer": "选择多个文件，设置编号、前后缀或查找替换规则，预览重命名结果后打包下载。重名会自动避让，不移动原文件。",
  "college-nav": "按报名、查成绩、找资源等场景整理大学生常用官方网站，链接为人工维护，信息以各网站最新公告为准。",
  "developer": "JSON、Base64、URL、MD5/SHA/HMAC 摘要、JWT 只读解析、密码生成与 UUID 都在浏览器本地计算。JWT 不验证签名，MD5/SHA-1 不能用于口令存储。",
  "timestamp": "秒/毫秒时间戳与上海或 UTC 日期时间互转，10/13 位自动识别。时区口径固定，不建模历史夏令时与闰秒。",
  "text": "统计字数、汉字与行数，去空行、去重、排序、加行号，转换大小写与全半角。排序为字符串序，单次最多 50 万字符。",
  "finance": "等额本息/等额本金月供、总利息与逐月还款表，以及单利/复利估算。金额按分计算，不含手续费、保险与 LPR 浮动，仅供估算。",
  "health": "按身高体重计算 BMI 与健康体重区间，用围度估算体脂率，并给出 BMR/TDEE 参考。公式估算不是医疗测量或诊断。",
  "color-picker": "上传图片后点击取色，得到 HEX/RGB/HSL 并复制；自动提取前 8 个主色。图片只在本地解码，不上传。",
  "stitch": "把 2–10 张图片纵向或横向拼成一张长图，可设间距、背景色与统一宽度。超过单边 20000px 或 8000 万像素会拒绝处理。",
  "pdf-page-number": "给 PDF 按九宫格位置加页码，支持起始编号、页码范围、跳过封面、字号与毫米边距。页码仅支持 ASCII 格式。",
  "pdf-crop": "按毫米统一裁剪 PDF 四边或套用去白边预设，保存后逐页复核尺寸。裁剪改变可见区域，不删除页面内容，也不等于脱敏。",
  "timetable": "设置学期开始日期、教学周数和节次时间，添加课程（支持单周、双周、自定义周次），自动生成周课表并提示时间冲突；可导出 .ics 导入 Apple / Google 日历并设置课前 5–30 分钟提醒。课表只保存在当前浏览器，不上传，可导出备份。",
  "pdf-watermark": "给 PDF 叠加中文水印，支持全页密铺或居中单条、颜色/透明度/角度/字号与页码范围。水印是视觉标识，不是加密或脱敏，原文件不会被修改。",
  "image-watermark": "给证件照、成绩单或作业图片叠加防盗用密铺文字水印、九宫格署名日期戳或透明 Logo 图标，支持单张或批量打包 ZIP 下载。合成在浏览器本地完成，不上传原图。",
  "ppt-extract": "从 .pptx 课件中无损提取全部内嵌图片（PNG/JPG/SVG/GIF/WebP），自动关联幻灯片页码、去除重复母版图标，并打包导出 ZIP 与 CSV 清单。仅支持 .pptx 格式，旧版 .ppt 需先另存为 .pptx。",
  "ppt-generate": "选择答辩或作业汇报预设，自定义大纲要点与视觉主题，生成并下载标准 16:9 宽屏 PPTX 演示文稿；可在 Microsoft PowerPoint 或 WPS 中二次编辑。",
  "pdf-form": "选择国家/校级奖助学金、缓考申请或请假审批表模板，在线填报并使用手写签名板签字，一键生成标准 A4 盖章审批 PDF 打印提交。",
  "image-compress": "严格按照学信网、四六级或考研报名要求（如 ≤ 100KB 或 ≤ 50KB）精准压缩图片，双视口滑块实时肉眼核验前后画质细节。",
  "flowchart": "基于 Mermaid 语法极速渲染业务流程图、算法分治图、TCP握手时序图与数据库 ER 图，支持一键导出高清矢量 SVG 与 2x PNG。",
  "media-converter": "网课视频提取纯音频 MP3、音频片段裁剪截取，或视频截取制作动态 GIF；全流程基于浏览器本地 Web Audio 与 Canvas 运算。",
  "web-to-apk": "输入任意网址，自定义应用名称、图标与包名，一键在浏览器本地构建并签名可直接在安卓手机安装的 APK 安装包；同步提供 PWA 配置清单与 Android Studio 源码工程打包。",
  "qr": "把链接、文字、WiFi、邮件或电话做成二维码（PNG/SVG 下载），或把图片里的二维码解析成文字；全部在浏览器本地处理，不上传；解出的链接只显示不自动跳转，确认可信再打开。",
  "random-pick": "粘贴一份名单，在同一页完成随机点名（单抽/多抽/不重复轮次）、随机分组（按组数或每组人数，组间人数差至多 1 人）与随机排序；全部在浏览器本地计算，不上传、不保存名单。",
  "split-bill": "记下每笔费用谁付了多少钱、谁参与分摊（均分、按权重或指定金额），自动算出每人已付、应付与结余，并给出转账清单；全部在浏览器本地计算，不上传、不经手资金。",
  "class-fund": "记下班级每笔班费收支（期初结余、收入、支出、分类合计）与每位成员交没交班费，自动算出结余、欠费名单与可直接发群的公示文本；全部在浏览器本地计算，不上传、不经手资金。",
  "exam-plan": "填好多门考试的名称与日期，按日期升序看每场剩余天数与复习阶段，选中一场生成倒排周计划、模考节点与每日节奏，可复制计划文本或下载 CSV；全部在浏览器本地计算，不上传、不保存。",
  "fitness-test": "填好体测 7 项成绩，按国家学生体质健康标准大学组评分表算出单项分、加权标准分、附加分、学年总分与等级，并给出最弱项与到下一等级的缺口，可复制结果文本或下载 CSV；全部在浏览器本地计算，不上传、不保存。",
  "composite-score": "填好德育、智育、体育与附加分，按可调权重（默认德育 20、智育 70、体育 10）算出综合测评总分与评奖档次，智育不会算可用课程学分加权子算，班委粘贴全班数据得并列名次、班级平均分与公示文本或 CSV；全部在浏览器本地计算，不上传、不保存。",
  "internship-tax": "按月粘贴税前实习报酬，对比学生实习累计预扣法与一般按次法两种口径的每月预扣与到手，并估算年度汇算应退或应补；全部在浏览器本地计算，不上传、不保存。",
  "student-loan": "填好贷款本金、入学年份、学制、期限与年利率，按国开行生源地口径算出逐年还款计划：毕业当年 111 天利息、5 年宽限期只还息、之后每年还本加利息、最后一年 9 月 20 日结清，可复制结果或下载 CSV；全部在浏览器本地计算，不上传、不保存。",
  "thesis-check": "粘贴论文全文或上传 .txt/.md/.docx，在本地自查结构完整性、标题编号连续性、图表编号与正文引用、内部重复段落、摘要与关键词字数及参考文献引用核对，可复制报告或下载 TXT；全部在浏览器本地计算，不上传、不保存。",
  "docx-format": "上传写好的 .docx，选一套排版预设，一键把全篇标题、正文、行距、缩进、页边距改成规范格式，下载可直接交稿的新 .docx 与修改清单；全部在浏览器本地计算，不上传、不保存。",
  "group-free-time": "一人粘贴多份课表，离线算出全组共同空闲时段与最佳开会时间，可复制清单发群或导出 ICS 导入手机日历；全部在浏览器本地计算，不上传、不保存。",
  "focus": "专为自习刷题、背单词、写论文设计的沉浸番茄钟，纯端侧实时合成4种白噪音，离线可用、零音频下载；全部在浏览器本地运行，不上传、不保存。",
  "postgrad-score": "按报考院校初复试权重（5:5、6:4、7:3等）精准计算最终成绩，反推目标综合分所需的最低复试逆袭分；全部在浏览器本地计算，不上传、不保存。",
  "dorm-power": "宿舍4/6人交电费结算神器：按在寝天数阶梯加权、垫付自动冲抵，一键生成微信群公示账单与极简转账清单；全部在浏览器本地计算，不上传、不保存。",
  "dorm-power-limit": "填入本校单台限功率与宿舍总功率上限，勾选在用电器，离线校验会不会跳闸并给出去掉哪一件就安全的建议；中国市电 220V 换算电流，全部在浏览器本地计算，不上传、不保存。",
  "countdown": "大学考试倒计时精确到秒，内置四六级、考研初试、教资与期末周预设，一键生成无水印励志打卡文案与自律卡片；全部在浏览器本地计算，不上传、不保存。",
  "md-to-wechat": "社团推文、通知与读书笔记排版利器：Markdown一键转为微信公众号内联高保真排版，一键复制富文本直接粘贴；全部在浏览器本地处理，不上传、不保存。",
  "id-card-layout": "上传身份证或学生证正反面，按 1:1 毫米级真实物理尺寸自动排版到 A4 页面，叠加安全防盗水印并滤除拍摄灰底，一键导出矢量 A4 打印 PDF 或高清图；文件纯端侧内存处理，绝不上传。",
  "pdf-merge-split": "多份 PDF 拖拽排序后合并为一个文档，或按页码范围/逐页拆分并打包下载。纯本地处理，不上传正文，无水印。",
  "pdf-compress": "选择 PDF 并选择压缩档位（轻度/推荐/极限或结构优化），系统在本机重新编码页面并计算节省百分比。若压缩后体积反而变大将自动拦截并保留原文件。",
  "photo-check": "上传报名照片，一键检测尺寸、KB体积、纯色底与3:4比例，直出体检报告并支持一键智能修复为480×640标准照。纯本地处理，不上传人脸隐私。",
  "verify": "Claude 桌面应用体检门户（非官方本地诊断）：先下载体检脚本并双击运行，桌面会生成 claude-check.json；把它拖进本页，即可看清应用路径、版本、应用标识、系统架构、签名、登录与更新状态，同时页面会自动检查你的浏览器能否正常处理 PDF 与压缩包。报告可一键复制或下载为 Markdown。页面只读取你主动拖入的这一份 JSON，不读取其它文件、不上传、不改动 Claude 应用本身，也不代替你亲手试用。"
};

export const TOOL_SEO_META: Partial<Record<ToolID, {title: string; description: string}>> = {
  "pdf-compress": {
    "title": "PDF 压缩瘦身（提交作业大小超限急救·变大自动拦截）｜NOVIP 大学生工具",
    "description": "提交作业或论文 PDF 体积超限？NOVIP 纯本地 PDF 压缩：支持轻度、推荐、极限档位重采样与结构优化，压缩后体积若变大自动拦截保留原文件，免费无水印。"
  },
  "pdf-merge-split": {
    "title": "PDF 合并与拆分（课件论文按页提取·删页·免费不限页数）｜NOVIP 大学生工具",
    "description": "课件讲义与毕业论文多份 PDF 合并、按页码范围拆分、指定页提取或删页。无需充值 VIP、不限页数与文件大小，纯浏览器本地秒级处理不上传。"
  },
  "photo-check": {
    "title": "报名照片体检诊断（尺寸·体积KB·底色合规检查）｜NOVIP 大学生工具",
    "description": "考研、考公、教资、四六级等各类考试报名照片一键体检：检测 480×640 尺寸、KB 大小、纯色底色与 3:4 比例，直出合规报告并支持一键修复，纯本地保护人脸隐私。"
  },
  "files": {
    "title": "文件格式转换（Word/PPT/图片与PDF本地互转·无水印限制）｜NOVIP 大学生工具",
    "description": "多功能文件格式转换：Word、PPT、图片与 PDF 纯本地双向转码，无需充值会员、不排队等待、不加任何平台水印，单文件建议 50MB 以内。"
  },
  "handwrite": {
    "title": "手写生成器（中文多页手写作业模拟·真实笔触）｜NOVIP 大学生工具",
    "description": "纯中文多页手写字迹模拟工具，多种手写字体与纸张背景，真实模拟字间距与行间距起伏，单次最多 20,000 字，作业救急一键导出无水印图片或 PDF。"
  },
  "references": {
    "title": "参考文献格式化（GB/T 7714-2025 / 2015 规范·论文排版）｜NOVIP 大学生工具",
    "description": "毕业论文与学术报告参考文献一键生成：严格遵循国标 GB/T 7714 标准，支持期刊、硕士博士学位论文、专著等，格式校验与 TXT 导出。"
  },
  "sheets": {
    "title": "Excel合并工具（多张报名表汇总对齐·保留学号前导零）｜NOVIP 大学生工具",
    "description": "班委与社团收集表汇总：多份 Excel 报名表自动按列名对齐合并为一张，文本格式保护学号前导零不丢失，纯浏览器本地极速处理。"
  },
  "pdf-page-number": {
    "title": "PDF 加页码（跳过封面·九宫格位置任选·自定义格式）｜NOVIP 大学生工具",
    "description": "毕业论文与大作业 PDF 规范添加页码：支持封面跳过、自定义起始编号、九宫格位置与字号边距微调，纯本地合成不限次数，无广告无水印。"
  },
  "pdf-crop": {
    "title": "PDF 裁剪去白边（统一裁切页边距·预设去白边）｜NOVIP 大学生工具",
    "description": "平板阅读与打印排版利器：统一裁剪 PDF 四边页边距或套用智能去白边预设，保留原文档清晰度，纯浏览器本地安全处理。"
  },
  "pdf-watermark": {
    "title": "PDF 加水印（防盗用·全页密铺·仅供报名使用）｜NOVIP 大学生工具",
    "description": "证件复印件、成绩单与报名材料防盗用：为 PDF 叠加「仅供报名使用」等中文水印，支持全页密铺或居中单条，颜色与透明度可调，本地生成保护隐私。"
  },
  "privacy": {
    "title": "PDF 元数据清理脱敏（清除作者·创建时间·编辑软件信息）｜NOVIP 大学生工具",
    "description": "毕业论文与匿名盲审材料脱敏：一键清除 PDF 内部包含的作者姓名、学校单位、创建时间与制作软件等元数据，前后核对对比，保护学术盲审隐私。"
  },
  "batch-pdf": {
    "title": "批量 PDF 任务处理（多文件按页提取·批量转PNG图片）｜NOVIP 大学生工具",
    "description": "多个 PDF 批量任务处理：逐文件按指定页码范围提取页面或转换为 PNG 高清图片，提供逐项进度查看、重试与打包下载，纯本地处理。"
  },
  "photo": {
    "title": "报名照片尺寸助手（考研考公教资 480×640 裁剪与 100KB 压缩）｜NOVIP 大学生工具",
    "description": "各类考试报名照片快速处理：将照片裁剪为标准的 480×640 像素尺寸，并精准压缩至 100KB 以内，纯本地快速处理，不上传人脸隐私。"
  },
  "color-picker": {
    "title": "图片取色器（点击提取颜色·HEX/RGB/HSL互转·前8主色分析）｜NOVIP 大学生工具",
    "description": "课件排版与设计作业取色工具：上传图片点击任意位置吸取颜色，HEX、RGB、HSL 一键复制，自动提取图片前 8 个主色与占比，本地快速解码。"
  },
  "stitch": {
    "title": "长图拼接工具（多图纵向/横向拼接·高清无平台水印）｜NOVIP 大学生工具",
    "description": "实验结果与课程截图拼接：把 2–10 张图片纵向或横向拼成长图，自由设置间距、背景颜色与统一宽度，纯本地无损导出 PNG/JPEG，不加任何水印。"
  },
  "images": {
    "title": "批量图片处理（批量改尺寸·压缩瘦身·PNG/JPG/WebP互转）｜NOVIP 大学生工具",
    "description": "多张图片批量处理神器：批量修改长宽分辨率、画质压缩瘦身、格式互相转换与自定义重命名，一键打包下载 ZIP，纯本地高效处理。"
  },
  "background": {
    "title": "手动抠图换底色（证件照红底/蓝底/白底切换·涂抹修正）｜NOVIP 大学生工具",
    "description": "报名证件照底色快速更换：支持红底、蓝底、白底及自定义颜色切换，提供涂抹画笔与橡皮擦手动微调边缘，纯前端本地处理，保护个人照片隐私。"
  },
  "ocr": {
    "title": "图片文字 OCR 识别（纯本地中英文识别·课件截图提取文字）｜NOVIP 大学生工具",
    "description": "网课课件截图与扫描书籍文字提取：纯浏览器本地离线识别简体中文与英文字符，提取可编辑文本一键复制，不向任何第三方接口上传敏感资料。"
  },
  "materials": {
    "title": "报名材料自查（格式·像素尺寸·文件体积KB·命名规则检查）｜NOVIP 大学生工具",
    "description": "报名上传前自我检查：自定义报名简章要求的格式、长宽像素、文件大小 KB 与命名规则，批量自查材料合规性，避免报名因格式被驳回。"
  },
  "scan": {
    "title": "扫描件变清晰（调整对比度灰度·手写笔记与试卷增强）｜NOVIP 大学生工具",
    "description": "手机拍摄的文档与手写笔记增强：支持旋转校正、亮度对比度调整、灰度化与黑白增强，让昏暗模糊的扫描件变得清晰易读，本地处理不传云端。"
  },
  "leave-helper": {
    "title": "大学请假理由助手（微信消息·正式请假条·当面沟通三版话术）｜NOVIP 大学生工具",
    "description": "有事请假不知道怎么跟导员和任课老师说？输入事由一键生成得体的微信汇报、书面请假条与当面沟通三种文案，表达礼貌合规，本地生成不上传。"
  },
  "material-collector": {
    "title": "班级材料收集助手（名单智能比对·一键查谁没交·打包ZIP）｜NOVIP 大学生工具",
    "description": "班委与课代表收作业神器：导入班级名单与收到的作业文件，自动核对谁交齐了谁没交，人工修正歧义，一键导出核对统计表与规范重命名的整理 ZIP。"
  },
  "file-organizer": {
    "title": "批量文件整理器（文件名批量重命名·智能编号·重名避让打包）｜NOVIP 大学生工具",
    "description": "收集作业与实验报告文件归档：多文件批量重命名，支持智能编号、前后缀添加与关键词替换，重名自动避让，纯本地打包导出 ZIP。"
  },
  "docx-check": {
    "title": "DOCX 论文格式排版检查（标题层级·字体字号·行距页边距核对）｜NOVIP 大学生工具",
    "description": "毕业论文与学术报告排版自查：按学院排版规范自定规则，自动检测标题样式、正文字体、字号大小、行距及页边距合规性，避免排版格式扣分。"
  },
  "compare": {
    "title": "文档文字比对工具（TXT/DOCX/PDF 文本增删差异对比）｜NOVIP 大学生工具",
    "description": "论文降重与作业版本修改核对：导入两份文档或粘贴文本，逐行高亮对比文字的新增、删除与修改差异，纯前端本地比对，不泄露未发表论文。"
  },
  "resume": {
    "title": "大学生免费个人简历制作（三款极简排版模板·无水印PDF导出）｜NOVIP 大学生工具",
    "description": "找实习与校园招聘必备：专为大学生设计的三款极简专业简历模板，在线填表、实时排版预览，一键导出高清无水印 PDF，完全免费不限导出。"
  },
  "course": {
    "title": "课程设计辅助规划（进度时间表·报告提纲·答辩PPT提炼）｜NOVIP 大学生工具",
    "description": "工科与文理科课程设计辅助：分解设计任务里程碑、生成阶段时间规划、自动梳理报告提纲与答辩 PPT 结构，助你按时完成大作业与课设任务。"
  },
  "ppt": {
    "title": "PPTX 瘦身压缩（压缩幻灯片图片·作业附件超限急救）｜NOVIP 大学生工具",
    "description": "演示文稿体积太大无法上传？纯本地压缩 PPTX 嵌入的图片素材，保留幻灯片排版与动画结构，无需第三方软件即可大幅缩小 PPT 文件。"
  },
  "wishes": {
    "title": "又遇到付费墙了吗？（功能许愿池·提出你想免费使用的工具）｜NOVIP 大学生工具",
    "description": "做作业、改格式又被要求开会员充 VIP？告诉 NOVIP 你遇到的收费壁垒，我们将优先研发纯本地运行的免费替代工具，拒绝学生群体被商业收割。"
  },
  "table-clean": {
    "title": "Excel / CSV 数据清洗工具（表格去重·统一列名·拆分合并列）｜NOVIP 大学生工具",
    "description": "实验数据与问卷结果整理利器：按指定字段快速去重、去除空行、批量重命名表头、按分隔符拆列与合列，纯本地表格清洗，支持 XLSX 与 CSV 互转。"
  },
  "lab": {
    "title": "理工科实验数据计算（均值·标准差·相对误差·吸光度线性拟合）｜NOVIP 大学生工具",
    "description": "大学物理与化学实验报告救急：一键计算平均值、标准差、相对误差与不确定度，支持吸光度曲线与最小二乘法线性拟合，本地快速核算实验数据。"
  },
  "grades": {
    "title": "大学期末成绩反推与 GPA 绩点计算（平时分权重·保研算分）｜NOVIP 大学生工具",
    "description": "期末考试到底要考多少分才不挂科？输入平时成绩与期末权重精准反推目标分数；支持自定义学校绩点折算规则，轻松计算课程加权 GPA。"
  },
  "cost": {
    "title": "软件会员成本核算与免费替代方案推荐（拒绝花冤枉钱）｜NOVIP 大学生工具",
    "description": "算算你的会员到底值不值：计算软件订阅的单次实际使用成本，并获取核实过的全网开源与免费替代方案及限制说明，帮助大学生省下每一分钱。"
  },
  "developer": {
    "title": "开发者与文本工具箱（JSON美化·MD5/SHA哈希·JWT解析·纯本地）｜NOVIP 大学生工具",
    "description": "计算机与软件专业学生实用工具：JSON 格式化校验、MD5/SHA/HMAC 哈希、JWT 解析、Base64 与 URL 编解码。纯浏览器本地计算不联网，保护代码与接口隐私。"
  },
  "timestamp": {
    "title": "时间戳转换器（Unix秒/毫秒时间戳转换·10位13位互转）｜NOVIP 大学生工具",
    "description": "计算机课设与开发必备：Unix 秒与毫秒时间戳与北京时间、UTC 时间双向转换，自动识别 10 位与 13 位，纯本地运行不上传。"
  },
  "text": {
    "title": "文本工具箱（作业论文去空行·文本去重·字数统计·大小写转换）｜NOVIP 大学生工具",
    "description": "论文写作与课程作业文本整理神器：纯本地字数统计、中英文字符计数、去空行、去除重复行、文本排序与大小写/全半角转换，实时预览不上传。"
  },
  "finance": {
    "title": "房贷与利息计算器（等额本息/本金月供对比·逐月还款表）｜NOVIP 大学生工具",
    "description": "大学生生活与理财规划：等额本息与等额本金月供计算、总利息支出对比、逐月还款明细表与单利复利计算，纯本地计算不收集财务隐私。"
  },
  "health": {
    "title": "BMI 与体脂率计算（体能测试·健康体重范围·热量参考）｜NOVIP 大学生工具",
    "description": "大学生体测与健身参考：按身高体重计算 BMI 与标准体重区间，支持腰围臀围估算体脂率，并提供每日基础代谢 BMR 与 TDEE 热量参考，纯本地计算。"
  },
  "college-nav": {
    "title": "大学生常用官方网站导航（学信网·四六级·研招网·办公资源）｜NOVIP 大学生工具",
    "description": "大学生活与学业必备入口合集：收录学信网、中国研究生招生信息网、四六级考试报名查分、国家智慧教育平台等官方站点，无广告免受假网址干扰。"
  },
  "timetable": {
    "title": "课程表生成器（单双周·课前提醒·一键导入手机日历·ICS导出）｜NOVIP 大学生工具",
    "description": "大学生新学期课表神器：添加课程并设置单双周，自动识别时间冲突，一键导出 .ics 文件导入 iPhone/Android/Google 日历并设置课前提醒，数据只存浏览器本地不上传。"
  },
  "image-watermark": {
    "title": "图片与证件照加水印（防盗用全屏密铺·九宫格署名·批量打包）｜NOVIP 大学生工具",
    "description": "证件办理与作业防盗专用：给证件照、成绩单或报告图片添加“仅供XX使用”倾斜密铺文字水印或自定义Logo，支持批量打包ZIP下载，本地处理零上传。"
  },
  "ppt-extract": {
    "title": "PPT 课件内嵌图片批量提取（按幻灯片分类·无损导出原图·ZIP打包）｜NOVIP 大学生工具",
    "description": "老师发的 PPT 课件图片不用一张张截图！一键解析提取 PPTX 文档内全部内嵌高清原图，自动标注幻灯片页码并打包 ZIP 下载，纯本地运行。"
  },
  "ai": {
    "title": "NOVIP AI 助手（大学生学习与工具智能向导·问答指南）｜NOVIP 大学生工具",
    "description": "面对学习、做课设、改文件不知道用什么工具？向 AI 描述你的需求，秒速推荐最合适的纯本地免费工具与步骤指南。"
  },
  "ppt-generate": {
    "title": "PPT 在线生成（答辩大纲·开题报告·课设演示文稿·16:9宽屏）｜NOVIP 大学生工具",
    "description": "期末大作业与答辩汇报救急：选择专业大纲预设，一键在线生成排版精美、可编辑的标准 16:9 PPTX 演示文稿，可在 Office/WPS 中二次修改。"
  },
  "pdf-form": {
    "title": "PDF 申请表填写与电子签名（奖学金·缓考·请假审批·免打印签字）｜NOVIP 大学生工具",
    "description": "高校奖学金、缓考申请或假条审批需在 PDF 上签字打字？在线填写表单，使用 Canvas 电子手写签名板签字，一键生成标准 A4 审批 PDF 导出打印。"
  },
  "image-compress": {
    "title": "图片精准压缩（锁定≤100KB/≤50KB·学信网/四六级报名照·双视口对比）｜NOVIP 大学生工具",
    "description": "严格按照考试报名系统体积限制精准压缩图片：双视口滑块实时肉眼核验画质细节，自动逼近指定目标 KB（如 ≤ 100KB），纯前端压缩零上传。"
  },
  "flowchart": {
    "title": "Mermaid 流程图与架构图制作（时序图·ER图·算法流程·SVG导出）｜NOVIP 大学生工具",
    "description": "毕业论文与实验报告画图利器：基于 Mermaid 极速渲染算法流程图、TCP握手时序图、数据库 ER 图，支持一键导出高清矢量 SVG 与高清图片。"
  },
  "media-converter": {
    "title": "音视频转换与音频提取（网课提取MP3·视频转动图GIF·本地处理）｜NOVIP 大学生工具",
    "description": "网课视频转纯音频 MP3 复习、截取视频片段制作动态 GIF、录音格式转换；基于浏览器端本地 Web Audio 与 Canvas 运算，保护隐私不耗流量。"
  },
  "web-to-apk": {
    "title": "网站一键生成安卓 APK（PWA 打包·手机安装包·纯端侧签名）｜NOVIP 大学生工具",
    "description": "把个人主页、博客、课表系统或常用网址打包成独立安卓 App：输入网址和应用名称，纯浏览器端生成并签名可直接安装的 APK，支持导出源码工程。"
  },
  "qr": {
    "title": "二维码生成与解析器（网址·文本·WiFi·图片扫码识别·纯本地无水印）｜NOVIP 大学生工具",
    "description": "将链接、文字、WiFi 或联系方式生成高清二维码，或上传图片快速识别解析其中的二维码内容；全部在浏览器本地完成，无水印、无需登录。"
  },
  "random-pick": {
    "title": "随机分组与点名抽签（班委分小组·课堂点名·演讲顺序·纯本地）｜NOVIP 大学生工具",
    "description": "粘贴一份名单，在同一页完成公平点名、随机分组与随机排序：不重复轮次、组间人数差至多 1 人、结果可复制或下载 CSV；全部在浏览器本地计算，不上传、不登录。"
  },
  "split-bill": {
    "title": "AA 分账与聚餐结算（多笔垫付·均分权重指定金额·转账清单·纯本地）｜NOVIP 大学生工具",
    "description": "聚餐、宿舍拼单、社团活动多笔垫付算不清？记下谁付了多少钱、谁参与每笔，自动算出每人结余与转账清单，可复制结算单或下载 CSV；全部在浏览器本地计算，不上传、不经手资金。"
  },
  "class-fund": {
    "title": "班费账本与公示（收支流水·结余·欠费名单·一键公示文本·纯本地）｜NOVIP 大学生工具",
    "description": "班委收班费、记开支、月末公示总对不上账？记下每笔收支与谁交了班费，自动算出结余、欠费名单与可直接发群的公示文本，可下载 CSV；全部在浏览器本地计算，不上传、不经手资金。"
  },
  "exam-plan": {
    "title": "考试倒计时与备考倒排规划（多考试倒计时·阶段判定·周计划·模考节点·纯本地）｜NOVIP 大学生工具",
    "description": "多门考试撞期不知道先看哪门？填好考试名和日期，看每场剩余天数与复习阶段，选中一场生成倒排周计划、模考节点与每日节奏，可复制计划文本或下载 CSV；全部在浏览器本地计算，不上传、不保存。"
  },
  "fitness-test": {
    "title": "体测成绩计算（7 项评分表·加权总分·等级·最弱项·纯本地）｜NOVIP 大学生工具",
    "description": "体测 7 项成绩一次填完，按国家学生体质健康标准大学组评分表算出单项分、加权标准分、附加分、学年总分与等级，并告诉你最弱项和到下一等级还差多少，可复制结果文本或下载 CSV；全部在浏览器本地计算，不上传、不保存。"
  },
  "composite-score": {
    "title": "综合测评计算（德育智育体育加权·附加分封顶·班级排名·评奖分档·纯本地）｜NOVIP 大学生工具",
    "description": "评奖评优前不知道综测多少分、在班里排第几？填德育、智育、体育与附加分，按可调权重算出总分与评奖档次，班委粘贴全班数据得并列名次与公示文本，可复制结果或下载 CSV；全部在浏览器本地计算，不上传、不保存。"
  },
  "internship-tax": {
    "title": "实习劳务报酬个税计算（学生累计预扣法·一般按次法对比·年度汇算退补·纯本地）｜NOVIP 大学生工具",
    "description": "实习报酬到手多少、会被扣多少税？按月粘贴税前实习报酬，对比学生实习累计预扣法与一般按次法的每月预扣与到手，并估算年度汇算应退或应补，可复制结果或下载 CSV；全部在浏览器本地计算，不上传、不保存。"
  },
  "student-loan": {
    "title": "生源地助学贷款还款计算（在校贴息·5年宽限期·逐年还款表·纯本地）｜NOVIP 大学生工具",
    "description": "贷了助学贷款，毕业后每年 12 月 20 日要还多少钱？按国开行生源地口径算出逐年还款计划：毕业当年 111 天利息、5 年宽限期只还息、之后每年还本加利息、最后一年 9 月 20 日结清，可复制结果或下载 CSV；全部在浏览器本地计算，不上传、不保存。"
  },
  "thesis-check": {
    "title": "毕业论文内容自查助手（结构·标题编号·图表引用·内部重复·摘要关键词·纯本地）｜NOVIP 大学生工具",
    "description": "论文交稿前先在本地自查一遍：结构齐不齐、标题编号跳没跳号、图表编号与正文引用对不对得上、自己文章里有没有重复的句子、摘要与关键词合不合要求；粘贴文本或上传 .txt/.md/.docx 就能出清单，可复制报告或下载 TXT；全部在浏览器本地计算，不上传、不保存。"
  },
  "docx-format": {
    "title": "DOCX 一键排版（标题分级·正文·行距·缩进·页边距·纯本地）｜NOVIP 大学生工具",
    "description": "上传写好的 .docx，选本科毕业论文或课程报告预设，一键把全篇标题、正文、行距、缩进、页边距改成规范格式，下载可直接交稿的新 .docx 与逐项修改清单；表格与题注不动、不改文字内容，全部在浏览器本地计算，不上传、不保存。"
  },
  "group-free-time": {
    "title": "小组空闲时间（多份课表求交集·推荐最佳开会时间·导出 ICS·纯本地）｜NOVIP 大学生工具",
    "description": "小组作业、社团例会约时间不用群里逐条问：一人粘贴多份课表，离线算出全组共同空闲时段与最佳开会时间，可复制清单发群或导出 ICS 导入手机日历；点格子或粘贴文本两种录入方式，全部在浏览器本地计算，不上传、不保存。"
  },
  "focus": {
    "title": "沉浸自习番茄钟与白噪音（端侧合成·零音频下载·纯本地）｜NOVIP 大学生工具",
    "description": "专为大学生自习刷题、背单词、写论文设计的沉浸番茄钟，内置纯端侧合成海浪雨声与粉红白噪音，零音频下载，完全离线运行。"
  },
  "postgrad-score": {
    "title": "考研初复试成绩折算器（院校权重加权·目标分逆袭反推·纯本地）｜NOVIP 大学生工具",
    "description": "按报考院校初试与复试权重（5:5、6:4、7:3等）精准计算最终综合分，并智能反推目标上岸线所需的最低复试逆袭分，全部本地计算不上传。"
  },
  "dorm-power": {
    "title": "宿舍电费阶梯分摊计算器（在寝天数加权·垫付冲抵·群公示文本）｜NOVIP 大学生工具",
    "description": "宿舍4/6人交电费结算神器：支持在寝天数阶梯加权、垫付自动冲抵，一键生成宿舍微信群公示账单与极简转账清单，全部本地计算不上传。"
  },
  "dorm-power-limit": {
    "title": "宿舍限电功率计算器（双限校验·电器预设·跳闸预警·纯本地）｜NOVIP 大学生工具",
    "description": "开学买电器、跳闸之后先算清楚：填入本校单台限功率与宿舍总功率上限，勾选在用电器，离线校验会不会跳闸并给出去掉哪一件就安全的建议；中国市电 220V 换算电流，全部本地计算不上传。"
  },
  "countdown": {
    "title": "四六级/考研目标倒计时微挂件（精确到秒·励志打卡海报·纯本地）｜NOVIP 大学生工具",
    "description": "大学考试倒计时精确到秒，内置四六级、考研初试、教资与期末周预设，一键生成无水印励志打卡文案与自律卡片，全部本地运行不上传。"
  },
  "md-to-wechat": {
    "title": "Markdown 转微信公众号排版助手（内联样式·一键复制富文本·纯本地）｜NOVIP 大学生工具",
    "description": "社团推文、通知与读书笔记排版利器：Markdown一键转为微信公众号内联高保真排版，一键复制富文本直接粘贴公众号后台，全部本地处理不上传。"
  },
  "verify": {
    "title": "Claude 桌面应用体检门户（安装·签名·登录·更新一页看清·非官方本地诊断）｜NOVIP",
    "description": "把本机 Claude 桌面应用的体检报告拖进来，一页看清安装路径、版本、应用标识、系统架构、代码签名、登录与更新状态，并自动检查浏览器能否正常处理 PDF 与压缩包；结果可一键导出 Markdown 报告。非官方本地诊断，不读取其它文件、不上传。"
  }
};

export type SeoPage = Page | 'not-found';

export function pageSeo(page: SeoPage, lang: Language = getLanguage()) {
  const dict = getLocaleDict(lang);
  const isEn = lang === 'en-US';

  if (page === 'home') {
    return {
      title: isEn
        ? `NOVIP 2.0 Free Campus Toolkit | ${PUBLIC_TOOL_COUNT} Essential PDF, Photo, Text & Study Tools`
        : HOME_TITLE,
      description: isEn
        ? `Free online student utilities without VIP subscriptions or watermarks. NOVIP 2.0 provides ${PUBLIC_TOOL_COUNT} essential tools: PDF merge & split, ID photo compliance, handwriting generator, timetable, format converter, and GPA calculator.`
        : HOME_DESCRIPTION,
      canonical: SITE_URL + '/',
      robots: 'index,follow',
    };
  }

  if (page === 'stats') {
    return {
      title: isEn
        ? 'NOVIP Statistics & Transparency Log | Real Growth Metrics'
        : 'NOVIP 网站数据｜公开透明的成长记录',
      description: isEn
        ? 'Inspect NOVIP tool catalog, release history, and client-side usage telemetry. 100% transparent campus utility metrics.'
        : '查看 NOVIP 的工具清单、部署版本、本机使用记录与（接通后的）全站访问统计。数据不编造，未采集的指标明确标注未接入。',
      canonical: SITE_URL + '/stats',
      robots: 'index,follow',
    };
  }

  if (page === 'not-found') {
    return {
      title: isEn
        ? 'Page Not Found | 404 | NOVIP Free Campus Toolkit'
        : '这里没有 VIP，也没有这个页面｜404｜NOVIP 大学生免费工具箱',
      description: isEn
        ? `The page you requested does not exist or has been moved. Return to NOVIP home to explore all ${PUBLIC_TOOL_COUNT} free campus utilities.`
        : `您访问的页面不存在或已被移动，请返回 NOVIP 首页查看全部 ${PUBLIC_TOOL_COUNT} 个免费实用工具。`,
      canonical: '',
      robots: 'noindex,follow',
    };
  }

  const tool = tools.find((item) => item.id === page);
  if (!tool) {
    return {
      title: isEn ? 'NOVIP Free Campus Toolkit' : 'NOVIP 大学生免费工具箱',
      description: isEn
        ? `Free online student utilities without VIP subscriptions. Explore all ${PUBLIC_TOOL_COUNT} tools.`
        : HOME_DESCRIPTION,
      canonical: SITE_URL + '/',
      robots: 'index,follow',
    };
  }

  const toolMeta = dict.tools[page];
  const custom = TOOL_SEO_META[page as ToolID];
  const toolName = toolMeta?.name || tool.name;
  const toolTask = toolMeta?.task || tool.task;
  const toolNote = toolMeta?.note || toolNotes[page as ToolID] || (isEn ? 'Runs locally in browser memory with zero uploads.' : '无需强制登录，无下载水印，文件优先在浏览器本地处理。');

  const title = isEn
    ? `${toolName} | NOVIP Free Campus Tools`
    : custom?.title || `${tool.name}｜NOVIP 大学生免费工具`;
  const description = isEn
    ? `NOVIP ${toolName}: ${toolTask}. ${toolNote}`
    : custom?.description || `NOVIP ${tool.name}：${tool.task}。${toolNotes[page as ToolID] || '无需强制登录，无下载水印，文件优先在浏览器本地处理。'}`;

  return {
    title,
    description,
    canonical: SITE_URL + (tool.path.startsWith('/tools/') || tool.path === '/nav' || tool.path === '/verify' ? tool.path : '/'),
    robots: 'index,follow',
  };
}

export function applyPageSeo(page: SeoPage, doc: Document = document, lang: Language = getLanguage()) {
  const seo = pageSeo(page, lang);
  doc.title = seo.title;
  doc.documentElement.lang = lang;
  const meta = (attribute: 'name' | 'property', key: string, value: string) => {
    let element = doc.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = doc.createElement('meta');
      element.setAttribute(attribute, key);
      doc.head.appendChild(element);
    }
    element.content = value;
  };
  meta('name', 'description', seo.description);
  meta('name', 'robots', seo.robots);
  meta('property', 'og:title', seo.title);
  meta('property', 'og:description', seo.description);
  meta('property', 'og:url', seo.canonical);
  let canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (seo.canonical) {
    if (!canonical) {
      canonical = doc.createElement('link');
      canonical.rel = 'canonical';
      doc.head.appendChild(canonical);
    }
    canonical.href = seo.canonical;
  } else {
    canonical?.remove();
  }
}
