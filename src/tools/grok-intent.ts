/**
 * grok-intent.ts
 * NOVIP 秒懂大白话 · 智能意图直达解析器（灵感源自 xAI Grok 的自然语言直接求解与零黑话理念）
 *
 * 核心设计：
 * 1. 0 外部 API 依赖、0 个人数据上传：全部 NLP 模式匹配与意图推断在本地毫秒级执行；
 * 2. 聚焦大一零基础学生痛点：无论输入多么口语化（如“老师发了PPT怎么把图存下来”、“照片是红色的学校要蓝底”），均能精准提炼痛点并直达工具；
 * 3. 给出 Grok 风格的清晰解法建议、主副工具组合拳与保姆级 3 步指南。
 */

import { tools, type ToolID } from './registry';

export interface GrokIntentResult {
  matched: boolean;
  intentKey: string;
  title: string;
  userDilemma: string;
  solution: string;
  primaryToolId: ToolID;
  primaryToolName: string;
  secondaryToolId?: ToolID;
  secondaryToolName?: string;
  actionLabel: string;
  stepGuide: [string, string, string];
  grokTip: string;
}

interface IntentPattern {
  key: string;
  title: string;
  keywords: string[];
  userDilemma: string;
  solution: string;
  primaryToolId: ToolID;
  secondaryToolId?: ToolID;
  actionLabel: string;
  stepGuide: [string, string, string];
  grokTip: string;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    key: 'ai-assistant',
    title: 'NOVIP AI 智能工具向导与学业咨询',
    keywords: [
      'ai', 'ai助手', '人工智能', '向导', '问问', '不知道用什么工具', '帮我找工具',
      '智能推荐', '学业助手', '大学助手', '智能问答', '帮帮我'
    ],
    userDilemma: '任务很繁琐不知道该用什么工具，或者想找针对大学生的步骤方案',
    solution: '向 NOVIP AI 助手直接描述你的学习或文件难题，秒速获取免费工具直达与实操指南。',
    primaryToolId: 'ai',
    secondaryToolId: 'wishes',
    actionLabel: '直达 AI 助手开始对话',
    stepGuide: [
      '第 1 步：点击直达打开「NOVIP AI 助手」对话界面。',
      '第 2 步：向 AI 描述你的作业、证件照、PDF 或期末算绩点等具体需求。',
      '第 3 步：查看智能推荐的 1-2-3 实操步骤与免充值工具，一键打开。',
    ],
    grokTip: '纯端侧极速智能，响应零延迟，对话内容仅保存在本地设备中。',
  },
  {
    key: 'ppt-extract',
    title: '课件图片提取与原图导出',
    keywords: [
      'ppt', '课件', '幻灯片', '图片', '原图', '截图', '提取图片', '提图', '存图', '保存图片',
      '老师发', '课件图', '课件里的照片', '幻灯片里的图', '不用截图'
    ],
    userDilemma: '老师发来的课件里有很多图，一张张手动截图既费时又模糊',
    solution: '直接选择课件文件，网站会自动提取课件内的所有高清原图并打包。',
    primaryToolId: 'ppt-extract',
    secondaryToolId: 'images',
    actionLabel: '前往提取课件原图',
    stepGuide: [
      '点击选择老师发来的 PPT 课件',
      '等待提取完成，勾选你需要的图片',
      '点击下载，单张保存或一键打包'
    ],
    grokTip: '从课件媒体层提取出来的图片是原始分辨率，远比在电脑或手机上直接屏幕截图清晰得多。',
  },
  {
    key: 'photo-resize',
    title: '报名照剪裁与压缩 100KB',
    keywords: [
      '照片', '报名照', '证件照', '100k', '100kb', '像素', '一寸', '二寸', '太大了', '太大',
      '压缩照片', '教务', '考公', '四六级', '报名', '体检照', '准考证照片'
    ],
    userDilemma: '学校或考试报名系统要求证件照小于 100KB 或特定尺寸，手头照片传不上去',
    solution: '上传现有照片，一键选择常用一寸/二寸或自定义尺寸，自动压到 100KB 以内。',
    primaryToolId: 'photo',
    secondaryToolId: 'background',
    actionLabel: '前往剪裁与压缩照片',
    stepGuide: [
      '上传你的现有正面照片',
      '选择报名的规格（如一寸、二寸或教务系统）',
      '预览效果并点击保存，生成合规照片'
    ],
    grokTip: '系统默认智能保留人脸细节，不用担心缩小文件大小会导致照片模糊看不清。',
  },
  {
    key: 'photo-background',
    title: '证件照快速抠图与换底色',
    keywords: [
      '换底', '红底', '蓝底', '白底', '底色', '抠图', '背景', '改背景', '换背景',
      '红变蓝', '蓝变白', '白变蓝', '红底变蓝底', '去背景'
    ],
    userDilemma: '手头只有红底或生活照，但报名急需蓝底或白底正面照',
    solution: '在浏览器本地智能识别人物边缘，一秒切换为纯白、深蓝、天蓝或纯红底色。',
    primaryToolId: 'background',
    secondaryToolId: 'photo',
    actionLabel: '前往一键抠图换底',
    stepGuide: [
      '选择你要更换底色的照片',
      '点击你需要的底色（纯白 / 蓝底 / 红底）',
      '检查边缘并点击保存到手机相册'
    ],
    grokTip: '处理在浏览器本地完成，你的私人肖像照片绝不会被传到外部服务器，安全防泄露。',
  },
  {
    key: 'timetable-sync',
    title: '课程表导入手机日历与上课提醒',
    keywords: [
      '课表', '课程表', '日历', '上课提醒', '提醒', '单双周', '导入日历', '苹果日历',
      '日程', '开学课表', '下周课程', '排课', '教室', '课前提醒'
    ],
    userDilemma: '纸质课表容易忘带，学校教务系统查课表太麻烦，总是怕迟到或走错教室',
    solution: '输入一次课程，导出标准日历文件，直接同步到 iPhone / 安卓系统日历，课前自动提醒。',
    primaryToolId: 'timetable',
    secondaryToolId: 'leave-helper',
    actionLabel: '前往制作智能日历课表',
    stepGuide: [
      '填入开学日期与周课表（可一键载入示例修改）',
      '设置单周/双周及上课教室与时间',
      '导出日历文件，在手机日历中打开即可一键导入'
    ],
    grokTip: '导入系统原生自带日历后，完全不需要常驻第三方后台 App，既省电又准时弹窗提醒。',
  },
  {
    key: 'material-collect',
    title: '班委收大作业与查谁没交',
    keywords: [
      '收作业', '收材料', '谁没交', '核对名单', '名单', '交齐', '缺交', '催交',
      '体检表', '报名表', '班长', '学委', '团支书', '收集', '重命名'
    ],
    userDilemma: '班群里几十上百个同学发来文件，文件名乱七八糟，很难统计到底谁还没交',
    solution: '粘贴班级名单和收到文件，秒出未交人员名单与催交通知文本，并可一键规范重命名。',
    primaryToolId: 'material-collector',
    secondaryToolId: 'file-organizer',
    actionLabel: '前往智能核对收发名单',
    stepGuide: [
      '把班级名单粘贴到左侧文本框',
      '把收到的全班作业文件拖入右侧',
      '立刻查看谁还没交，并一键复制催交名单'
    ],
    grokTip: '还能一键按【学号-姓名-大作业.docx】标准格式打包改名，交由授课老师绝不挨批。',
  },
  {
    key: 'references-format',
    title: '学术参考文献一键生成与国标排版',
    keywords: [
      '参考文献', '引用', 'gb/t', '7714', '知网', '论文', '引文', '大作业', '文献格式',
      '标点符号', '文献', '期刊', '论文查重', '排版'
    ],
    userDilemma: '期末论文参考文献格式严格，手动调整作者、标点、出版年和方括号极易出错',
    solution: '粘贴论文题目、知网导出格式或 DOI，自动换算为标准的 GB/T 7714 国标文献格式。',
    primaryToolId: 'references',
    secondaryToolId: 'docx-check',
    actionLabel: '前往一键规范参考文献',
    stepGuide: [
      '选择文献类型（期刊/学位论文/图书/网页）',
      '填入题名和作者，或直接粘贴知网引文串',
      '点击生成并一键复制到你的 Word 论文末尾'
    ],
    grokTip: '国标 GB/T 7714 对英文标点后的半角空格有严格要求，本工具已自动做好了间距校准。',
  },
  {
    key: 'docx-compare',
    title: '论文与文档双版本差异对比',
    keywords: [
      '对比', '比较', '改动', '差异', '修改了什么', '修改处', '查重对比', '新旧版本',
      '两篇论文', '两份word', 'diff', '文字比对'
    ],
    userDilemma: '导师给改了论文或发回了第二版，不知道具体修改了哪几句文字',
    solution: '粘贴新旧两份正文，以红绿高亮清晰呈现删除、增加与改动的每一处字句。',
    primaryToolId: 'compare',
    secondaryToolId: 'docx-check',
    actionLabel: '前往双版本差异比对',
    stepGuide: [
      '左边粘贴旧版本文本，右边粘贴新修改文本',
      '点击开始比对，绿色为新增，红色为删除',
      '清晰查看修改记录，心中有数'
    ],
    grokTip: '建议在向老师提交最终版或查重修改降重时使用，可以快速复盘每段文字的调整幅度。',
  },
  {
    key: 'pdf-watermark-privacy',
    title: '身份证与证书防盗打水印',
    keywords: [
      '水印', '加水印', '身份证水印', '防盗', '仅供', '仅供报名使用', '防冒用',
      '防止滥用', '证件加水印', '安全水印', '打水印'
    ],
    userDilemma: '上传身份证、学生证或成绩单给第三方，担心被不法分子冒用贷款或认证',
    solution: '为证件图片或 PDF 加上密铺半透明文字水印（如“仅供 2026 考级报名使用，他用无效”）。',
    primaryToolId: 'image-watermark',
    secondaryToolId: 'pdf-watermark',
    actionLabel: '前往给证件添加防盗水印',
    stepGuide: [
      '上传你的身份证或证书照片',
      '输入水印文字与用途（如“仅供某某评优审核”）',
      '调整透明度与旋转角度，点击下载保存'
    ],
    grokTip: '密铺水印能有效破坏自动识别与二次转卖，且全流程在手机内存完成，杜绝二次泄密。',
  },
  {
    key: 'pdf-crop-margins',
    title: 'PDF 课件与试卷一键切白边',
    keywords: [
      '去白边', '切白边', '白边', '裁剪', 'pdf太小', '平板看pdf', '平板做笔记',
      '打印省墨', 'pdf裁剪', '边距太宽', '四周空白'
    ],
    userDilemma: '课件 PDF 四周大片无用空白，导入 iPad / 手机阅读或打印时文字很小看不清',
    solution: '拖拽边框快速裁剪四周边距，放大正文阅读区域，平板做笔记与打印都更舒适。',
    primaryToolId: 'pdf-crop',
    secondaryToolId: 'files',
    actionLabel: '前往给 PDF 裁剪白边',
    stepGuide: [
      '选择你要裁剪的 PDF 电子文档',
      '拖动上下左右裁切线，圈定文字主体',
      '点击导出，生成无多余白边的高清 PDF'
    ],
    grokTip: '裁掉四周 2-3 厘米空白后，在平板竖屏阅读时文字会自动放大 30% 以上，看得更轻松。',
  },
  {
    key: 'finance-loan',
    title: '房贷月供与利息借款计算',
    keywords: [
      '利息', '月供', '房贷', '分期', '借款', '按揭', '等额本息', '等额本金',
      '提前还款', '算利息', '复利', '单利', '每年还多少', '每月还多少'
    ],
    userDilemma: '借款或分期还款时，合同上的利息计算复杂，算不清到底多付了多少利息',
    solution: '输入本金、年利率和期限，一键对比等额本息与等额本金，清晰列出每月还款清单与总利息。',
    primaryToolId: 'finance',
    secondaryToolId: 'cost',
    actionLabel: '前往测算月供与还款明细',
    stepGuide: [
      '填入贷款本金（如 10 万元）与年利率',
      '选择贷款年限或期数',
      '查看每月月供与还款计划表，可下载 CSV 保存'
    ],
    grokTip: '等额本金总利息较少但前期压力大，等额本息每月金额固定。本工具能一键模拟提前还款省下的利息。',
  },
  {
    key: 'stitch-long-image',
    title: '截图与长图智能拼接',
    keywords: [
      '拼图', '拼长图', '长图', '拼接', '多张图拼一张', '截图拼接', '聊天记录拼接',
      '横向拼接', '纵向拼接', '长截图'
    ],
    userDilemma: '多张聊天记录、课件重点或活动海报，一张张发给别人很零碎',
    solution: '选择多张图片，自动统一宽度并纵向无缝拼成长图，原画质导出。',
    primaryToolId: 'stitch',
    secondaryToolId: 'images',
    actionLabel: '前往拼接生成高清长图',
    stepGuide: [
      '选择要拼接的多张图片（支持拖拽排序）',
      '选择纵向拼长图或横向并排',
      '预览无缝拼接效果，点击一键保存'
    ],
    grokTip: '单张图片输出限制在 8000 万像素以内，在保证极致清晰度的同时避免微信发送时卡顿。',
  },
  {
    key: 'ocr-extract-text',
    title: '图片表格提取文字 (OCR)',
    keywords: [
      '文字识别', '提取文字', '图片文字', 'ocr', '手写识别', '打字太慢',
      '图片转文字', '抄书', '读书笔记', '板书', '照片转文字'
    ],
    userDilemma: '老师黑板板书、书本段落或纸质通知想变成可以复制修改的电子文字',
    solution: '上传照片，纯本地浏览器识别中英文字符，直接复制结果，不耗费任何字数额度。',
    primaryToolId: 'ocr',
    secondaryToolId: 'text',
    actionLabel: '前往提取照片中的文字',
    stepGuide: [
      '上传拍摄的板书、书页或截图照片',
      '等待本地引擎识别文字完成',
      '一键复制结果，可直接粘贴进 Word 或微信'
    ],
    grokTip: '纯本地端侧离线识别，不用注册账号、没有每天免费 5 次的限制，更不会泄露私密文件。',
  },
  {
    key: 'ppt-generate',
    title: '期末大作业与答辩 PPT 智能生成',
    keywords: ['ppt生成', '做ppt', '答辩ppt', '开题ppt', '课件制作', 'pptx生成', '大作业汇报ppt', '路演ppt'],
    userDilemma: '马上要开题或期末答辩汇报，还没做 PPT 或者排版不知道怎么组织',
    solution: '选择大学生高频场景（答辩、课程大作业、文献汇报），在线微调大纲一键生成精美排版的 PPTX 文档。',
    primaryToolId: 'ppt-generate',
    secondaryToolId: 'course',
    actionLabel: '前往生成答辩 PPTX 文稿',
    stepGuide: [
      '第 1 步：选择开题答辩、课程大作业或竞赛路演预设大纲。',
      '第 2 步：切换深空黑或典雅学术蓝风格，微调每一页核心要点与作者信息。',
      '第 3 步：点击生成并下载标准 16:9 PPTX，直接用 Office / WPS 打开放映。',
    ],
    grokTip: '完全基于 PptxGenJS 本地渲染，排版规整无水印，可自由二次修改。',
  },
  {
    key: 'pdf-form',
    title: 'PDF 奖助学金与假条审批表填写签字',
    keywords: ['pdf填表', 'pdf表格填写', 'pdf签名', 'pdf签字', '奖学金申请表', '缓考申请', '请假表', '社团表'],
    userDilemma: '学校发来的申请表 PDF 无法直接打字，或者需要个人手写电子签名后提交',
    solution: '提供标准高校 A4 审批格式，在线直接填报信息并在手写签名板完成签字，导出即交。',
    primaryToolId: 'pdf-form',
    secondaryToolId: 'leave-helper',
    actionLabel: '前往在线填表与手写签字',
    stepGuide: [
      '第 1 步：选择奖学金审批、缓考申请或离校请假单等模板。',
      '第 2 步：在各项目栏输入学号、姓名与申请理由，在右侧虚线框内手写签字。',
      '第 3 步：点击生成并下载标准 A4 审批 PDF，可直接打印或微信交表。',
    ],
    grokTip: '电子签名背景自动透明化无缝贴合表单，告别打印拍照再回传的折腾。',
  },
  {
    key: 'image-compress',
    title: '考研/学信网/四六级照片精准压缩 ≤ 100KB',
    keywords: ['精准压缩', '限制100kb', '图片太大了', '学信网照片太大了', '考研照片小于100kb', '限制kb', 'squoosh', '照片压缩'],
    userDilemma: '报名系统提示图片必须小于 100KB 或 50KB，普通压缩要么压坏画质要么仍超标',
    solution: 'Squoosh 级端侧二分算法，自动逼近指定目标 KB，配有双视口滑块实时肉眼核验细节。',
    primaryToolId: 'image-compress',
    secondaryToolId: 'photo',
    actionLabel: '前往精准压缩到指定 KB',
    stepGuide: [
      '第 1 步：上传需要压缩的照片或扫描件。',
      '第 2 步：选择「标准 ≤ 100KB」或「严格 ≤ 50KB」目标限制。',
      '第 3 步：拖动中央分割线对比原图与压缩后画质，一键保存合规新照片。',
    ],
    grokTip: '二分收敛算法在保障文件体积严格达标的同时，最大化保留脸部与文字清晰度。',
  },
  {
    key: 'flowchart',
    title: '毕业论文与课设流程图 / 时序图 / ER图',
    keywords: ['流程图', 'mermaid', '时序图', '架构图', 'er图', '算法图', '画流程图', '甘特图'],
    userDilemma: '论文或实验报告需要绘制专业算法流程图、TCP握手图或数据库表结构，专业软件太复杂还收费',
    solution: '基于 Mermaid 12 极速渲染，内置登录业务流、二分分治、TCP握手与教务 ER 图模板，一键导出矢量 SVG。',
    primaryToolId: 'flowchart',
    secondaryToolId: 'course',
    actionLabel: '前往绘制并导出流程图',
    stepGuide: [
      '第 1 步：选择适合你的高校预设图表模板。',
      '第 2 步：在左侧微调节点文字与判断分支，右侧实时更新。',
      '第 3 步：点击导出高清矢量 SVG（插入 Word/LaTeX 论文无限放大不模糊）。',
    ],
    grokTip: '矢量 SVG 是学术论文排版首选，同时支持一键导出 2x 高清 PNG。',
  },
  {
    key: 'media-converter',
    title: '网课音视频转 MP3 / 提取音频 / 制作动态 GIF',
    keywords: ['音视频转换', '提取音频', '视频转音频', '视频提取mp3', '网课录音', '转mp3', '转wav', '视频转gif', 'gif制作'],
    userDilemma: '想把网课录屏提取成 MP3 音频边走边听复习，或者想截取视频精彩片段做成动图放进报告',
    solution: '纯端侧 Web Audio 与 Canvas 引擎，支持 MP4/WebM/MOV -> MP3/WAV 提取与高画质动图 GIF 导出。',
    primaryToolId: 'media-converter',
    secondaryToolId: 'files',
    actionLabel: '前往处理音视频文件',
    stepGuide: [
      '第 1 步：拖入网课录屏或录音文件。',
      '第 2 步：选择「提取纯音频转 MP3」或「视频截取转动图 GIF」。',
      '第 3 步：设置码率或时间区间，点击开始转换直接下载。',
    ],
    grokTip: '全在本地内存运算，不用上传几百兆网课视频到第三方服务器，极度省流量保隐私。',
  },
  {
    key: 'web-to-apk',
    title: '网站转安卓 APK 安装包 / PWA 一键打包',
    keywords: ['apk', '安卓', '打包', '网站转app', '做个app', '生成apk', '安装包', 'pwabuilder', 'bubblewrap', 'pwa转apk', '网站转apk', '做安卓app'],
    userDilemma: '自己做了网页作品、博客或常用校园网站，想装到安卓手机桌面上像 App 一样用，但不会写原生 Android 代码',
    solution: '输入网址并挑选图标，浏览器本地一键注入配置并完成数字签名，生成货真价实可安装的 .apk 安装包。',
    primaryToolId: 'web-to-apk',
    secondaryToolId: 'developer',
    actionLabel: '前往一键生成安卓 APK',
    stepGuide: [
      '第 1 步：输入你的网站或博客 HTTPS 链接，设置应用名称。',
      '第 2 步：选择或上传应用桌面图标，配置横竖屏与全屏沉浸开关。',
      '第 3 步：点击一键生成并签名，直接下载 .apk 传输到手机安装。',
    ],
    grokTip: '纯端侧数字签名技术，零服务器中转与隐私风险，手机侧载安装即用。',
  },
];

/**
 * 意图求解器：对用户口语化查询做深度语义意图解析
 */
export function resolveGrokIntent(query: string): GrokIntentResult | null {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return null;

  let bestMatch: IntentPattern | null = null;
  let maxScore = 0;

  for (const pattern of INTENT_PATTERNS) {
    let score = 0;
    for (const kw of pattern.keywords) {
      if (q === kw) {
        score += 15;
      } else if (q.includes(kw)) {
        score += kw.length >= 3 ? 6 : 3;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestMatch = pattern;
    }
  }

  // 门槛要求：至少命中核心特征词
  if (!bestMatch || maxScore < 5) return null;

  const primaryTool = tools.find((t) => t.id === bestMatch.primaryToolId);
  const secondaryTool = bestMatch.secondaryToolId
    ? tools.find((t) => t.id === bestMatch.secondaryToolId)
    : undefined;

  return {
    matched: true,
    intentKey: bestMatch.key,
    title: bestMatch.title,
    userDilemma: bestMatch.userDilemma,
    solution: bestMatch.solution,
    primaryToolId: bestMatch.primaryToolId,
    primaryToolName: primaryTool?.name || bestMatch.title,
    secondaryToolId: secondaryTool?.id,
    secondaryToolName: secondaryTool?.name,
    actionLabel: bestMatch.actionLabel,
    stepGuide: bestMatch.stepGuide,
    grokTip: bestMatch.grokTip,
  };
}
