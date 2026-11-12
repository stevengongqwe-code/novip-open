/**
 * ai-core.ts
 * NOVIP AI 核心推理与学业场景深度求解引擎
 *
 * 核心设计准则：
 * 1. 拒绝机械空洞的搜索框式回显，针对大学生实际痛点给出真诚、专业、可落地的保姆级解法；
 * 2. 真实计算与文案起草：期末成绩反推直接算分，请假/答辩/参考文献直接起草可复制的草稿；
 * 3. 多轮上下文理解（Multi-Turn Dialogue）：支持基于历史对话推导追问；
 * 4. 纯端侧零外部成本、零数据外泄，不伪造真实 AI，诚实标识端侧专家推理。
 */

import { tools, PUBLIC_TOOL_COUNT, type ToolID } from './registry';
import { TOOL_BEGINNER_GUIDES } from './beginner-guides';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiQueryResult {
  reply: string;
  matchedToolIds: ToolID[];
  draftTitle?: string;
  draftContent?: string;
  followUps?: string[];
  calcBreakdown?: string;
}

// 帮助函数：格式化推荐工具步骤
function formatToolSteps(toolId: ToolID): string {
  const guide = TOOL_BEGINNER_GUIDES[toolId];
  if (!guide || !guide.steps?.length) return '';
  return `**推荐操作步骤**：\n${guide.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n💡 *提示*：${guide.saveTip}`;
}

export function solveAiQuery(query: string, history: AiChatMessage[] = []): AiQueryResult {
  const q = query.trim().toLowerCase();
  const compact = q.replace(/[\s，。！？?!,.\-_/\\+]/g, '');

  // 1. 问候与身份
  if (/^(你好|嗨|哈喽|hello|hi|hey|您好|早上好|下午好|晚上好)$/.test(compact)) {
    return {
      reply: '你好！我是 **NOVIP AI 助手**。我是专为大学生打造的本地学业与文件难题智能向导。\n\n你可以向我咨询任何学习与大学琐事：\n- 🎓 **考证报名**：四六级/考研证件照规格、压到100KB以内、红底换蓝底\n- 📝 **学业论文**：开题报告与答辩PPT大纲、GB/T 7714 参考文献排版、Mermaid流程图\n- 📈 **成绩课表**：平时分反推期末需考多少分、GPA绩点换算、开学课表导入手机日历\n- ✉️ **校园事务**：生病找辅导员请假措辞起草、班长收作业自动核对谁没交、奖学金申请表免打印手写签字\n- 🛠️ **实用数字工具**：多份PDF合并加页码、网课录音提取MP3、个人网页一键打包安卓APK\n\n直接告诉我你的具体难题，我为你秒速出具专属解法与操作指引！',
      matchedToolIds: ['files', 'photo', 'timetable', 'grades'],
      followUps: [
        '四六级照片480×640怎么改，还要压缩到100KB以内？',
        '生病找辅导员和老师请假，怎么委婉礼貌措辞？',
        '平时成绩占40%考了75分，期末要考多少分才能上85？',
        '毕业论文参考文献怎么按 GB/T 7714-2015 规范排版？',
      ],
    };
  }

  if (/(你是谁|你是什么|介绍(一下)?你自己|你是干(什么|啥)的|whoareyou)/i.test(compact)) {
    return {
      reply: `我是 **NOVIP AI**，面向中国大学生的本地智能工具向导。\n\n- 🛡️ **纯端侧极速智能**：所有问题直接在浏览器处理，响应零延迟，不上传个人隐私；\n- 💰 **零花冤枉钱**：全站收录 ${PUBLIC_TOOL_COUNT} 款实用免充值工具，无会员、无水印、无需登录；\n- 🎯 **手把手引导**：针对具体场景拆解 1-2-3 步简单操作，直达工具页面。`,
      matchedToolIds: ['cost', 'wishes'],
      followUps: [
        'NOVIP 都有哪些好用的免费工具？',
        '为什么商业软件几兆的文件转格式都要收几十块？',
        '我想提一个关于免付费工具的建议。',
      ],
    };
  }

  if (/(novip|no\s?vip|这个网站|你们网站|你的网站)/i.test(q) && /(什么|介绍|做什么|干什么|收费|免费|定位|口号|是谁)/.test(q)) {
    return {
      reply: `NOVIP（No VIP）是专门面向中国大学生的免费在线工具站，口号是**「大学生，别花冤枉钱。」**\n\n我们拒绝商业软件动辄几十块的开卡套路，提供包括网站一键生成安卓APK、A4证件复印拼版、报名照规范制作、PDF填表与合并、PPT大纲生成、流程图制作、音视频转MP3、手写生成、Excel汇总、免水印简历与大学生官方导航等 ${PUBLIC_TOOL_COUNT} 款高频工具。所有功能均可免费在浏览器直接使用！`,
      matchedToolIds: ['cost', 'college-nav', 'wishes'],
      followUps: [
        '四六级照片怎么修改尺寸和压缩？',
        '多份 PDF 怎么按顺序合并在一起？',
        '考研和四六级常用官网导航在哪里？',
      ],
    };
  }

  // 2. 建议与许愿
  if (/(建议|反馈|报错|bug|许愿|希望增加|能不能增加|付费墙|恶心|收费套路)/.test(q)) {
    return {
      reply: `已为你整理好**功能许愿 / 痛点反馈草稿**（可直接复制，前往功能许愿池提交）：\n\n- **反馈类型**：遇到商业软件付费墙 / 新功能建议\n- **痛点描述**：${q.slice(0, 300)}\n- **期望效果**：希望 NOVIP 提供纯前端、免费无水印的对应功能\n- **设备环境**：浏览器直接运行\n\n点击下方卡片即可直达许愿池，作者会持续迭代！`,
      matchedToolIds: ['wishes', 'cost'],
      draftTitle: 'NOVIP 功能许愿与痛点反馈草稿',
      draftContent: `【NOVIP 功能需求反馈】\n遇到收费问题：${q.slice(0, 200)}\n期望体验：希望提供纯前端、零服务器上传、免会员的免费在线替代工具\n环境：手机/电脑系统浏览器`,
      followUps: [
        '查看其他常见的商业软件免费替代方案',
        '直接前往功能许愿池提交需求',
      ],
    };
  }

  // 3. 检查多轮追问上下文 (History Context)
  const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant')?.content || '';

  // 追问请假天数或补充理由
  if (lastAssistantMsg.includes('请假') && /(发烧|感冒|生病|两天|三天|半天|医院|挂号|点滴|复诊|看病|家里有事|回家|面试)/.test(q)) {
    const days = q.includes('三天') ? '3 天' : q.includes('两天') ? '2 天' : q.includes('半天') ? '半天' : '1 天';
    const reason = q.includes('发烧') ? '高烧不退（体温约 38.5℃）' : q.includes('医院') ? '身体严重不适需前往医院检查' : '突发身体急性不适';
    return {
      reply: `已根据你的最新情况更新了请假文案（已按请假 **${days}**、原因 **${reason}** 调整）：\n\n包含微信直发版与正式书面审批版，措辞诚恳且明确了后续补交材料和补课方案，可直接复制发送！`,
      matchedToolIds: ['leave-helper', 'pdf-form'],
      draftTitle: `更新版请假措辞（${days} · ${reason}）`,
      draftContent: `【微信速发版】\n导员好，我是 [专业班级] 的 [姓名]。因昨晚起 ${reason}，经校医/医院初步诊断需服药并卧床静养，医生建议休养 ${days}。因此特向您请假 ${days}（自 X月X日 至 X月X日）。请假期间所缺的 [课程名称] 课程笔记和作业，我已向学习委员报备并会及时借同学的补上。纸质假条和就诊单据我返校后第一时间补交。望导员批准，感谢您的关心，给您添麻烦了！\n\n【正式审批表事由】\n本人因 ${reason}，遵医嘱需就医休养 ${days}。特申请事假/病假 ${days}（X月X日至X月X日）。本人承诺请假期间遵纪守法，离校保持通讯畅通，回校后立即办理销假手续。`,
      followUps: [
        '请假审批需要导员签字盖章，怎么用手机电子签名生成 PDF？',
        '销假时需要带哪些医院材料？',
      ],
    };
  }

  // 追问成绩平时分与占比
  if ((lastAssistantMsg.includes('平时') || lastAssistantMsg.includes('期末') || lastAssistantMsg.includes('绩点')) && /(\d+)/.test(q)) {
    const numMatch = q.match(/(\d+)/);
    const val = numMatch ? parseInt(numMatch[1], 10) : 50;
    const isWeight = q.includes('%') || (val <= 70 && val >= 20);
    const weight = isWeight ? val : 40;
    const regularScore = isWeight ? 75 : val;
    const target = 85;
    const regularWeight = weight / 100;
    const examWeight = 1 - regularWeight;
    const needed = ((target - regularScore * regularWeight) / examWeight).toFixed(1);

    return {
      reply: `已为你重新换算最新成绩模型：\n\n- **计算公式**：\`总评 = 平时分 × ${weight}% + 期末卷面 × ${100 - weight}%\`\n- **假设目标**：总评达到 **${target}分**（约 3.7+ 绩点）\n- **平时成绩**：按 ${regularScore} 分测算\n- **期末卷面要求**：需考到 **${needed} 分** 即可达成目标！\n\n如果你的目标是稳妥及格（60分），期末卷面只需考到 **${Math.max(0, parseFloat(((60 - regularScore * regularWeight) / examWeight).toFixed(1)))} 分** 即可不挂科。`,
      matchedToolIds: ['grades', 'timetable'],
      calcBreakdown: `目标${target}分反推公式：(${target} - ${regularScore}×${regularWeight}) / ${examWeight} = ${needed}分`,
      followUps: [
        '如果期末考 90 分，总评绩点能拿到多少？',
        '学校 4.0 绩点和 5.0 绩点怎么换算？',
        '复习周怎么把课程表导出到手机日历？',
      ],
    };
  }

  // 4. 深度学业场景求解引擎 (Domain Problem Solvers)

  // 场景 A: 请假与高校师生沟通
  if (/(请假|假条|辅导员|导员|发给老师|生病|看病|发烧|回家|缺勤|逃课|旷课|补假|销假)/.test(q)) {
    const isSick = /(病|发烧|感冒|胃痛|医院|挂号|点滴|急性|身体)/.test(q);
    const defaultReason = isSick ? '突发发烧感冒（体温较高，遵医嘱需服药休养）' : '家中有紧急私事需离校返家处理';

    return {
      reply: `为你推荐 **请假条草稿助手**：填写请假事由与对象，生成微信、正式、当面三版文字，按需修改后自行发送。工具不代发消息，也不保证请假获批。\n\n针对大学请假痛点，已为你起草好 **3 版成熟得体的请假文案**（高校辅导员与任课老师高度认可版式，直接复制微调即可发）：\n\n${formatToolSteps('leave-helper')}`,
      matchedToolIds: ['leave-helper', 'pdf-form'],
      draftTitle: '辅导员与任课老师得体请假文案草稿',
      draftContent: `【版本一：发给辅导员（微信/短信速发版）】
导员好，我是 [专业班级] 的 [姓名]（学号：[学号]）。
因为今天 [${defaultReason}]，目前身体非常不适，医生建议卧床休息，因此明天（X月X日）前两节 [课程名称] 课无法前往教室上课。
我已经向学习委员报备，课后会借同学的课堂笔记和课件认真补上进度。特向您请假半天/一天，病假审批材料和就医单据返校后我第一时间为您补齐。望您批准，给您添麻烦了！

【版本二：发给任课老师（尊重且负责版）】
[姓]老师您好，打扰您了！我是选修您 [课程名称] 课的学生 [姓名]（学号 [学号]）。
非常抱歉，因 [${defaultReason}]，明天上午的课程我无法到堂听讲。我已经拜托同组的 [同学姓名] 帮我记录课堂重点，课后会全力补齐作业。特提前向您报备请假，期末平时成绩我会加倍努力，望老师批准！

【版本三：高校正式审批表（假条事由标准格式）】
事由：本人因 [${defaultReason}]，经诊断需休养治疗。特申请病假/事假 [X] 天（自 2026年X月X日 至 2026年X月X日）。请假期间离校去向：[宿舍/家中]，联系方式保持畅通。本人承诺按期返校并办理销假手续。`,
      followUps: [
        '如果辅导员要求带公章的请假审批单，怎么免打印手写电子签名？',
        '突发高烧请假，后续销假要提供什么凭证？',
        '怎么委婉向任课老师借课件 PPT？',
      ],
    };
  }

  // 场景 B: 成绩、平时分、GPA 与挂科及格线
  if (/(绩点|gpa|及格|挂科|平时分|平时成绩|期末考多少|考多少分|保研|分期反推|算分)/.test(q)) {
    // 智能提取数字
    let regScore = 70;
    let weight = 40;
    let target = 85;

    const scoreMatch = q.match(/(平时[分成绩]?|考了)\s*[:：=为]?\s*(\d+)/);
    if (scoreMatch) regScore = parseInt(scoreMatch[2], 10);

    const weightMatch = q.match(/(占比|权重|占)\s*[:：=为]?\s*(\d+)%?/);
    if (weightMatch) weight = parseInt(weightMatch[2], 10);

    const targetMatch = q.match(/(目标|想考|总评|上|拿)\s*[:：=为]?\s*(\d+)/);
    if (targetMatch) target = parseInt(targetMatch[2], 10);
    else if (q.includes('及格') || q.includes('不挂科')) target = 60;
    else if (q.includes('保研') || q.includes('优秀')) target = 90;

    const wReg = weight / 100;
    const wExam = 1 - wReg;
    const finalNeeded = ((target - regScore * wReg) / wExam).toFixed(1);
    const passNeeded = Math.max(0, parseFloat(((60 - regScore * wReg) / wExam).toFixed(1)));

    return {
      reply: `为你推荐 **期末成绩与GPA反推**：输入平时成绩、考试权重、目标分数，或课程成绩与学分计算GPA。绩点规则由你设置，还需核对学校最低分及其他规定。\n\n**实时反推结果**：\n- 当前平时分 **${regScore}** 分（按 **${weight}%** 占比测算，已锁定 **${(regScore * wReg).toFixed(1)}** 分卷面贡献）；\n- 🎯 若要达到目标 **${target}** 分（保研/优秀），期末卷面需要考 **${finalNeeded} 分**；\n- 🛡️ 若要稳过及格线（60分不挂科），期末卷面只需考 **${passNeeded} 分**！\n\n${formatToolSteps('grades')}`,
      matchedToolIds: ['grades', 'timetable'],
      calcBreakdown: `计算公式：期末目标分 = (期望总评 - 平时分 × 平时权重) / 期末权重 = (${target} - ${regScore} × ${wReg}) / ${wExam} = ${finalNeeded}分`,
      followUps: [
        '如果期末考了 80 分，换算成 4.0 绩点是多少？',
        '开学课程表怎么一键导出到手机日历？',
        '缓考后成绩会注明缓考字样影响保研吗？',
      ],
    };
  }

  // 场景 C: 证件照、报名照与照片换底色/压缩规格 (四六级、考研、教资、蓝底一寸)
  if (/(证件照|报名照|480|640|100kb|寸照|一寸|二寸|四六级照片|考研照片|考公照片|学信网|换底色|红底|蓝底|白底|底色|一寸照)/.test(q)) {
    const isOneInchBlue = /(蓝底|蓝|一寸|寸照)/.test(q);
    const specDesc = q.includes('二寸') ? '二寸（413 × 579 像素）' : q.includes('四六级') ? '四六级标准（144 × 192 或 480 × 640 像素）' : '标准一寸（295 × 413 像素）';
    const colorDesc = q.includes('白') ? '考试纯白底' : q.includes('红') ? '标准正红底' : '标准天蓝底';

    return {
      reply: `为你推荐 **报名照片尺寸助手**（已支持一站式换底色、改尺寸与锁 100KB，无需在多个工具间来回折腾）：\n\n**帮你整理好的 3 步保姆级操作**：\n1. **选底色与尺寸**：点击下方推荐工具，直接选择目标底色（如 **${colorDesc}**）与目标尺寸（如 **${specDesc}**）；\n2. **选你的照片**：点击上传你的日常照片或自拍（或者点「载入示例照片试试」先看效果），手指拖动调整头部在画面正中间；\n3. **体积自动锁在 100KB 内**：系统已默认帮你设置好最常用的 **≤ 100KB** 上限，点击「生成并下载照片」，手机上直接长按生成的照片选「保存到手机」即可存入相册！\n\n*提示：如果照片背景特别复杂需要精细修发丝，页面里还贴心提供了「去手动涂抹换底色」按钮，修完一键带回，照片不会丢失！*\n\n${formatToolSteps('photo')}`,
      matchedToolIds: ['photo', 'image-compress', 'background'],
      followUps: [
        '四六级照片提示不能超过 100KB，怎么无损压缩？',
        '怎么在微信里把做好的照片直接保存到手机相册？',
        '给身份证照片加上「仅供考试审核使用」防盗水印怎么弄？',
      ],
    };
  }

  // 场景 C2: 照片太大了传不上去 / 图片精准压缩
  if (/(照片太大了|图片太大了|文件太大|压缩照片|压照片|压缩到100kb|缩小照片|小于100kb|压图片)/.test(q)) {
    return {
      reply: `手机拍照文件太大（经常 3MB~8MB）导致学校教务系统、四六级或研招网提示「文件超过 100KB 上传失败」？\n\n**最简单的两种解决办法**：\n- **如果是证件照/报名照**：直接打开 **「报名照片尺寸助手」**，选择 100KB 限制，上传后自动帮你裁成标准尺寸并严格锁定在 100KB 以内；\n- **如果是普通截图或作业照片**：直接打开 **「图片精准压缩 (Squoosh对比)」**，拖动滑块锁定 100KB，双视口可以肉眼对比压缩前后的清晰度，保证不糊！\n\n*所有压缩均在你的手机本地完成，绝不上传到任何服务器，隐私百分之百安全！*`,
      matchedToolIds: ['image-compress', 'photo'],
      followUps: [
        '做一张蓝底一寸报名照怎么弄？',
        '多张作业图片怎么拼成一张长图？',
        '怎么在手机相册里查看照片是几 KB？',
      ],
    };
  }

  // 场景 C3: 微信长按保存与下载疑难解答
  if (/(微信|保存到相册|怎么下载|下载不了|长按保存|下载没反应|安卓微信)/.test(q)) {
    return {
      reply: `📱 **在手机或微信里顺畅保存文件的专属技巧**：\n\n1. **保存图片/照片/长图**：\n   页面生成出预览图后，**直接用手指长按图片 1 秒钟**，在弹出的系统菜单里选择「**保存到手机**」或「**存储图像**」，照片就会直接存进你的手机相册，这是最快最稳的方法！\n\n2. **下载 PDF 文档 / ZIP 压缩包**：\n   微信内置浏览器有时会拦截直接下载。如果点击下载按钮没有反应，请点击微信界面右上角的「**···**」三个点，选择「**在浏览器打开**」（苹果手机用 Safari，安卓手机用自带浏览器），再次点击下载就能顺畅保存到手机里啦！`,
      matchedToolIds: ['photo', 'files', 'image-compress'],
      followUps: [
        '做一张标准的蓝底一寸照片',
        '多份 PDF 合并成一个文件怎么做？',
        '手写生成器怎么导出打印清晰的 PDF？',
      ],
    };
  }

  // 场景 C4: 身份证/学生证正反面 A4 拼版打印与防盗水印
  if (/(身份证|学生证|驾驶证|证件复印|复印件|证件拼版|正反面|A4打印|A4排版)/.test(q) && /(复印|打印|排版|正反面|拼版|防盗|水印|a4)/i.test(q)) {
    return {
      reply: `为你推荐 **A4 证件拼版复印打印助手**（100% 纯端侧计算，绝不上传个人身份证隐私）：\n\n**3 步生成标准 A4 证件复印件**：\n1. **拍正反面**：分别拍照或上传身份证的正反两面（或者先点「载入示例证件」直接体验）；\n2. **选版式与水印**：自动等比例按二代身份证 85.6×54mm 真实物理尺寸排版到 A4 纸（推荐「经典上下居中」），可勾选开启「仅供评奖评优核验使用」半透明防盗水印，并开启「黑白复印」自动滤除拍照灰暗阴影；\n3. **导出打印**：点击「导出标准 A4 打印 PDF」或「保存 300DPI 高清图片」；打印时嘱咐打印店老板选「实际大小/100%比例」，打印出的卡片尺子量出来分毫不差！\n\n${formatToolSteps('id-card-layout')}`,
      matchedToolIds: ['id-card-layout', 'image-watermark', 'photo'],
      followUps: [
        '身份证复印件怎么加防盗水印防借贷冒用？',
        '打印店打印证件复印件怎么避免尺寸变形变大？',
        '做一张标准的蓝底一寸报名照',
      ],
    };
  }

  // 场景 D: 答辩 PPT、开题报告大纲与汇报
  if (/(ppt|答辩|开题|开题报告|做ppt|ppt大纲|毕业设计|中期检查|演示文稿|汇报)/.test(q)) {
    return {
      reply: `为你推荐 **PPT 大纲与演示文稿生成**：选择答辩或作业汇报预设，自定义大纲要点与视觉主题，生成并下载标准 16:9 宽屏 PPTX 演示文稿；可在 Microsoft PowerPoint 或 WPS 中二次编辑。\n\n针对高校学术答辩（开题/大作业/毕业设计），已为你起草 **标准学术汇报 6 页核心骨架**：\n\n${formatToolSteps('ppt-generate')}`,
      matchedToolIds: ['ppt-generate', 'flowchart', 'ppt-extract'],
      draftTitle: '高校学术汇报 PPT 黄金 6 页大纲框架',
      draftContent: `【第 1 页：封面与选题】
- 主标题：[你的毕业论文 / 课程设计题目]
- 副标题：基于 [核心方法/技术] 的设计与实现
- 汇报人：[姓名] | 指导老师：[导师姓名] | 专业班级：[专业]

【第 2 页：选题背景与研究痛点（1.5 分钟）】
- 行业/学术现状：当前面临的核心问题与技术瓶颈
- 研究价值：为什么做这项研究？能解决什么实际难题？

【第 3 页：国内外研究现状与文献综述（1 分钟）】
- 主流算法 / 经典方案优缺点对比
- 本文切入点：与现有方案相比的核心差异

【第 4 页：系统架构与核心技术路线（3 分钟 · 重点）】
- 总体方案设计图（配合 Mermaid 架构流程图展开）
- 关键算法公式推导 / 业务时序逻辑
- 关键技术攻关与技术选型理由

【第 5 页：实验验证与阶段性成果（2 分钟）】
- 实验环境、测试数据集与指标对比（准确率/时延/性能）
- 界面演示 / 实物样机展示截图

【第 6 页：工作总结与下一步展望（0.5 分钟）】
- 已完成的核心创新工作归纳
- 毕业去向与未来待改进方向
- 致谢：感谢答辩组各位评审老师批评指正！`,
      followUps: [
        '如何用 Mermaid 快速画出技术路线图插入 PPT？',
        '老师发来的 PPT 课件里有很多图，怎么免截图批量提取高清原图？',
        'PPT体积太大微信发不出去怎么瘦身压缩？',
      ],
    };
  }

  // 场景 E: 毕业论文参考文献排版 (GB/T 7714-2015/2025)
  if (/(参考文献|引用|gb\/t|知网|gbt7714|题录|著录|apa|mla|文后参考文献)/.test(q)) {
    return {
      reply: `为你推荐 **GB/T 7714 参考文献格式化**：粘贴每行一条的题录或手工填写字段，按 GB/T 7714—2025 / 2015 格式化并逐条校验，确认后复制或导出 TXT。工具只处理已支持的结构，不联网补造题录，提交前请对照原文与学校规范核对。\n\n**GB/T 7714 顺序编码制核心避坑要点**：\n1. **标点半角**：所有标点符号（包括逗号、句号、冒号、括号）在文后著录中统一使用**英文半角字符**，句号后带空格；\n2. **作者标注**：作者不超过 3 人的全部列出；超过 3 人的仅列前 3 人，其后加“, 等”或“, et al.”；\n3. **文献类型标识**：期刊文章为 \`[J]\`，专著图书为 \`[M]\`，学位论文为 \`[D]\`，会议论文为 \`[C]\`，在线网络资源为 \`[EB/OL]\`。\n\n${formatToolSteps('references')}`,
      matchedToolIds: ['references', 'docx-check', 'thesis-check'],
      draftTitle: 'GB/T 7714 标准著录样式参考对照表',
      draftContent: `[1] 期刊论文规范示例：
张伟, 李娜, 王强, 等. 基于深度学习的高校排课算法优化研究[J]. 计算机学报, 2024, 47(5): 1024-1035.

[2] 英文期刊示例：
Vaswani A, Shazeer N, Parmar N, et al. Attention is all you need[J]. Advances in Neural Information Processing Systems, 2017, 30: 5998-6008.

[3] 硕博学位论文示例：
刘洋. 基于移动 Web 的高校协同作业系统设计与实现[D]. 北京: 清华大学, 2023.

[4] 专著图书示例：
陈浩. 大学生学术论文写作与规范实用教程[M]. 北京: 高等教育出版社, 2022: 45-50.`,
      followUps: [
        '如何排查毕业论文 DOCX 格式中的标题字号与行距错误？',
        '知网导出的 Refworks 格式怎么转成 GB/T 7714？',
        '两篇论文查重前怎么逐行对比文字差异？',
      ],
    };
  }

  // 场景 F: 班级收作业、材料收集与名单对齐
  if (/(收作业|名单|谁没交|催交|班长|学委|学号|收材料|汇总作业|核对名单)/.test(q)) {
    return {
      reply: `为你推荐 **班级材料收集与名单对齐**：导入名单与收到的文件，自动匹配后人工修正歧义，再导出核对表与整理ZIP。匹配结果需要你逐项核对。\n\n**班干部免头疼收集三步法**：\n1. **准备全班名单**：把辅导员给的花名册（学号、姓名）直接粘贴或导入；\n2. **批量拖入收到文件**：无论同学交的是 \`张伟_大作业.pdf\` 还是微信保存的乱码文件名，算法自动智能模糊提取姓名学号；\n3. **秒出催交清单**：一键生成“未交名单”群公告，并可一键把已交文件全部重命名为规范格式并打包导出 ZIP！\n\n${formatToolSteps('material-collector')}`,
      matchedToolIds: ['material-collector', 'file-organizer', 'sheets'],
      draftTitle: '班委催交作业群发通知模版',
      draftContent: `【作业催交提醒】
同学们好！[课程名称] 的 [大作业/实验报告名称] 截止时间为今晚 23:59。
截至目前，系统核对尚有以下同学未收到材料：
[未交同学姓名清单]
请尚未提交的同学尽快按「学号_姓名_作业名」格式发送至群相册/学委邮箱。如有已提交但被漏记的同学，请私聊学委凭发送截图补录。感谢大家配合！`,
      followUps: [
        '如何把几十个人的不同 Excel 表格按列名自动合成一张大表？',
        '收上来的文件怎么批量去除序号并重新规范编号？',
      ],
    };
  }

  // 场景 G: PDF 综合处理（合并、拆分、加页码、手写签字、去白边、水印）
  if (/(pdf|合并pdf|pdf合并|pdf加页码|pdf页码|pdf签字|pdf填表|pdf水印|pdf去白边|pdf裁剪)/.test(q)) {
    const isWatermark = /(水印|防盗|泄密)/.test(q);
    const isPageNum = /(页码|编号|加页码)/.test(q);
    const isSign = /(签字|签名|填表|手写)/.test(q);

    let primeId: ToolID = 'files';
    if (isWatermark) primeId = 'pdf-watermark';
    else if (isPageNum) primeId = 'pdf-page-number';
    else if (isSign) primeId = 'pdf-form';

    return {
      reply: `为你推荐 **${tools.find(t => t.id === primeId)?.name}**：${tools.find(t => t.id === primeId)?.task}\n\n**PDF 大学生高频处理指南**：\n- 📄 **合并与拆分**：多份实验报告、大作业附录按顺序拖入即可直接合成一个完整 PDF；\n- 🔢 **加九宫格页码**：支持跳过封面和目录，直接从正文开始编排页码，可自由调节毫米边距；\n- ✍️ **免打印手写电子签名**：内置 Canvas 签名板，在手机或平板上用手指手写签名，直接生成可打印交表的 A4 盖章审批件；\n- 🛡️ **安全与隐私**：所有 PDF 在浏览器本地内存处理，刷新即清空，绝不上传云端！\n\n${formatToolSteps(primeId)}`,
      matchedToolIds: [primeId, 'files', 'pdf-page-number'],
      followUps: [
        'PDF 加页码怎么跳过第一页封面？',
        '奖学金申请表怎么在线填写并手写签字？',
        'PDF去白边打印怎么调边距省纸张？',
      ],
    };
  }

  // 场景 H: Mermaid 流程图、架构图与时序图
  if (/(流程图|mermaid|时序图|er图|架构图|类图|甘特图|图表)/.test(q)) {
    return {
      reply: `为你推荐 **流程图与架构图制作**：基于 Mermaid 语法极速渲染业务流程图、算法分治图、TCP握手时序图与数据库 ER 图，支持一键导出高清矢量 SVG 与 2x PNG。\n\n**为什么推荐用 Mermaid 做学术图表？**\n- 纯文本即图表：直接写代码就能自动排版，省去手动拖拽连线对不齐的痛苦；\n- 矢量 SVG 导出：导出到论文 Word 或 LaTeX 中，无论放大多少倍都不会模糊失真！\n\n已为你准备好一段可以直接运行的**学生选课系统业务流程图**模板：\n\n${formatToolSteps('flowchart')}`,
      matchedToolIds: ['flowchart', 'course'],
      draftTitle: 'Mermaid 经典业务流程图语法模板',
      draftContent: `graph TD
    Start([学生登录系统]) --> Auth{账号密码验证}
    Auth -- 失败 --> ShowErr[提示错误并重试] --> Start
    Auth -- 成功 --> CheckRole{用户身份判断}
    
    CheckRole -- 学生 --> ViewCourses[浏览可选课程列表]
    CheckRole -- 教师 --> ManageGrades[录入平时与期末成绩]
    
    ViewCourses --> Select[提交选课申请]
    Select --> CapacityCheck{课程容量是否已满?}
    CapacityCheck -- 满额 --> WaitList[进入候补队列]
    CapacityCheck -- 未满 --> EnrollSuccess[选课成功写入数据库]
    
    EnrollSuccess --> End([流程结束])`,
      followUps: [
        '如何画算法流程图（如二分查找、快速排序）？',
        'TCP 三次握手和四次挥手的 Mermaid 时序图怎么写？',
        '数据库 ER 实体关系图代码怎么写？',
      ],
    };
  }

  // 场景 I: 网站打包安卓 APK (Web To APK)
  if (/(apk|安卓|打包|网站转app|做个app|生成apk|安装包|bubblewrap|pwabuilder|pwa)/.test(q)) {
    return {
      reply: `为你推荐 **网站一键生成安卓 APK**：输入任意网址，自定义应用名称、图标与包名，一键在浏览器本地构建并签名可直接在安卓手机安装的 APK 安装包；同步提供 PWA 配置清单与 Android Studio 源码工程打包。\n\n**核心特性**：\n- 纯浏览器本地基于 ChromeOS 打包签名技术完成 RSA X.509 签名，**零服务器构建费、零网络外泄**；\n- 支持配置全屏沉浸式体验、下拉刷新与缩放行为；\n- 同时导出标准 PWA 套件与完整 Android Studio Gradle 源码工程！\n\n${formatToolSteps('web-to-apk')}`,
      matchedToolIds: ['web-to-apk', 'developer'],
      draftTitle: '安卓手机侧载安装指南（华为/小米/OPPO/vivo）',
      draftContent: `【生成的 APK 手机安装说明】
1. 华为鸿蒙系统：弹出纯净模式提醒时，点击「了解风险」-> 勾选后选择「继续安装」；
2. 小米澎湃/MIUI：弹出风险检测提示时，验证锁屏密码或指纹，选择「允许单次安装」；
3. OPPO/vivo：在系统安装器中开启「允许来自此来源的应用」后即可直接运行；
4. 电脑端：可使用 adb install 或 Android 模拟器直接拖入安装测试。`,
      followUps: [
        '网页转 APK 后怎么实现离线缓存可用？',
        '如何使用 Android Studio 打开导出的 Gradle 源码工程？',
        '生成的 APK 怎么在桌面显示自定义图标？',
      ],
    };
  }

  // 场景 J: 音视频转换与网课录音提取 MP3
  if (/(音频|视频|mp3|网课录音|提取音频|视频转音频|视频转gif|gif|截取音频)/.test(q)) {
    return {
      reply: `为你推荐 **音视频转换与音频提取**：网课视频想提取成 MP3 音频复习、录音转换格式或视频截取制作动态 GIF？浏览器本地极速处理，保护隐私不耗流量。\n\n**大学生实用场景**：\n- 🎧 **网课录屏提取音频**：把老师几百分钟的 MP4/WebM 视频转成纯音频 MP3，通勤路上边走边听复习；\n- ✂️ **音频精确截取**：拖动时间轴裁剪掉冗长前奏，只保留核心讲解部分；\n- 🎞️ **动图 GIF 制作**：截取实验关键步骤或演讲视频片段，制作免播放器直接在 Word/PPT 播放的动图！\n\n${formatToolSteps('media-converter')}`,
      matchedToolIds: ['media-converter', 'image-compress'],
      followUps: [
        '导出的 GIF 文件太大怎么压缩到 5MB 以内？',
        'MP3 码率选择 128kbps 还是 192kbps 音质更均衡？',
        '视频提取音频在本地运算会不会消耗手机流量？',
      ],
    };
  }

  // 场景 K: 借贷、利息与分期防坑 (Finance & Anti-Scam)
  if (/(分期|利息|月供|房贷|还款|等额本息|等额本金|复利|借钱|花呗|白条|年化)/.test(q)) {
    return {
      reply: `为你推荐 **月供与利息计算器**：等额本息/等额本金月供、总利息与逐月还款表，以及单利/复利估算。金额按分计算，不含手续费、保险与 LPR 浮动，仅供估算。\n\n**大学生防范利息陷阱关键常识**：\n- ⚠️ **“表面手续费”不等于真实年化利率**：分期时标称“每期只需 0.5% 手续费”，由于本金在逐月递减但每期手续费按全额计算，其真实年化利率（APR）往往高达 **10%~12%**，几乎是表面费率的 2 倍！\n- 📊 **等额本息 vs 等额本金**：等额本息每月还款固定、前期利息多；等额本金每月本金固定、总利息更少但前期压力大；\n- 🚫 **警惕校园网贷**：切勿向未受监管的平台借款，遇到收费软件不要开贵价连续包月！\n\n${formatToolSteps('finance')}`,
      matchedToolIds: ['finance', 'cost'],
      followUps: [
        '分期 12 个月手续费 0.6% 真实年化到底是多少？',
        'WPS 会员收费太贵有哪些免费替代工具？',
        '怎么计算复利收益与单利收益的差距？',
      ],
    };
  }

  // 场景 L: 课程表与开学作息 (Timetable)
  if (/(课表|课程表|排课|单双周|日历|上课提醒|走错教室|wakeup)/.test(q)) {
    return {
      reply: `为你推荐 **大学课程表与日历导出**：设置学期开始日期、教学周数和节次时间，添加课程（支持单周、双周、自定义周次），自动生成周课表并提示时间冲突；可导出 .ics 导入 Apple / Google 日历并设置课前 5–30 分钟提醒。课表只保存在当前浏览器，不上传，可导出备份。\n\n**开学实用技巧**：\n- 📅 **导出到系统日历**：导出 \`.ics\` 文件后，iPhone 或安卓手机点击即可将全学期课程写入系统日历；\n- ⏰ **课前智能提醒**：日历会自动在每节课前 15 分钟弹窗提醒教室与课程名，彻底避免早八走错教学楼！\n\n${formatToolSteps('timetable')}`,
      matchedToolIds: ['timetable', 'grades'],
      followUps: [
        '如何设置单周和双周交替上课？',
        '导出的 .ics 文件怎么导入 iPhone 自带日历？',
        '课表数据换了手机怎么备份和恢复？',
      ],
    };
  }

  // 5. 全局语义打分与多维度关联匹配 (Semantic Matcher Fallback)
  const scored = tools
    .filter(t => t.id !== 'ai')
    .map(tool => {
      let score = 0;
      const name = tool.name.toLowerCase();
      const task = tool.task.toLowerCase();
      const group = tool.group.toLowerCase();

      if (name.includes(q)) score += 40;
      if (task.includes(q)) score += 20;
      if (group.includes(q)) score += 10;

      const tokens = q.split(/[\s,，、。！？?!/\\+]+/g).filter(x => x.length >= 2);
      for (const token of tokens) {
        if (name.includes(token)) score += 15;
        if (task.includes(token)) score += 8;
      }

      // 别名加分
      const ALIAS_MAP: Partial<Record<ToolID, string[]>> = {
        photo: ['480', '640', '100kb', '寸照', '证件照', '报名照', '学信网', '准考证'],
        files: ['pdf', 'word', '合并', '拆分', '互转', '格式转换'],
        'image-watermark': ['水印', '防盗', '身份证', '学生证', '打水印'],
        'pdf-watermark': ['pdf水印', '文档水印', '密铺'],
        grades: ['绩点', 'gpa', '及格', '期末', '保研', '算分'],
        timetable: ['课表', '课程表', '单双周', '日历', '上课'],
        'leave-helper': ['请假', '假条', '辅导员', '缺勤'],
        'material-collector': ['收作业', '名单', '谁没交', '学号'],
        references: ['参考文献', '引用', 'gb/t', '知网'],
        handwrite: ['手写', '字迹', '抄写', '检讨书'],
        sheets: ['excel', '表格', '多表', '合并表'],
        'ppt-generate': ['ppt', '答辩', '开题', '大纲'],
        'pdf-form': ['填表', '签字', '电子签名', '奖学金'],
        'image-compress': ['压缩', 'squoosh', '压大小', '50kb', '100kb'],
        flowchart: ['流程图', 'mermaid', '架构图', '时序图'],
        'media-converter': ['音频', 'mp3', '录音', 'gif', '转换'],
        'web-to-apk': ['apk', '安卓', '打包', 'app'],
        ocr: ['ocr', '文字识别', '提取文字', '图片转文字'],
      };

      for (const [tid, aliases] of Object.entries(ALIAS_MAP)) {
        if (tool.id === tid && aliases.some(a => q.includes(a))) {
          score += 45;
        }
      }

      return { tool, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const topTools = scored.slice(0, 3).map(x => x.tool);
    const primary = topTools[0];
    const stepsFormatted = formatToolSteps(primary.id);

    let reply = `为你推荐 **${primary.name}**：${primary.task}\n\n`;
    if (stepsFormatted) {
      reply += `${stepsFormatted}\n\n`;
    }

    if (topTools.length > 1) {
      reply += `💡 **搭配协同工具**：你还可以搭配使用 ${topTools.slice(1).map(t => `**${t.name}**（${t.group}）`).join('、')}，全流程在本地浏览器即可闭环解决。`;
    }

    return {
      reply,
      matchedToolIds: topTools.map(t => t.id as ToolID),
      followUps: [
        `如何使用 ${primary.name} 导出处理结果？`,
        '文件在浏览器处理会不会泄漏个人隐私？',
        '遇到处理异常或者格式不支持怎么办？',
      ],
    };
  }

  // 6. 兜底回答（带有大学生活真诚指引与分类探索）
  return {
    reply: `已收到你的需求：「${query}」。\n\n当前 NOVIP 工具库收录了 ${PUBLIC_TOOL_COUNT} 款面向大学生的免充值工具（包括网站一键生成安卓APK、A4证件拼版打印、PDF 格式转换、四六级寸照、大学课表、请假助手、Excel合并、参考文献格式化等）。\n\n**常见解决方向建议**：\n- 🎓 **如果是格式难题**：请尝试描述文件扩展名（如 PDF、DOCX、PPTX、XLSX、MP4、JPG）；\n- 📝 **如果是作业或生活难题**：可直接提问如“期末算绩点”、“给辅导员请假”、“大作业合并PDF”；\n- 💡 **如果确实未收录对应工具**：你可以前往 **功能许愿池** 提交你的需求，作者会持续开发上线纯前端免费版！`,
    matchedToolIds: ['wishes', 'cost', 'college-nav'],
    followUps: [
      '四六级报名照片480×640怎么压缩到100KB？',
      '生病找辅导员和任课老师请假怎么委婉措辞？',
      '毕业论文参考文献怎么按 GB/T 7714 排版？',
    ],
  };
}
