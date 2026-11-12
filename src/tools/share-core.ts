import {tools, type ToolID} from './registry';
import {enUS} from '../i18n/locales/en-US';
import {zhCN} from '../i18n/locales/zh-CN';

export const SITE_URL = 'https://novip.site';

/**
 * 39 个工具的一句话核心卖点（针对大学做作业、报名、排版、计算痛点）
 */
export const TOOL_PITCHES: Record<string, string> = {
  // 核心急救与高频
  'photo-check': '报名照片一键体检尺寸与KB，智能合规修复不求人',
  'pdf-compress': 'PDF重采样无损压缩瘦身，变大自动拦截不收费',
  'pdf-merge-split': '课件论文多份拼装与按页提取，不限页数纯本地',
  'files': 'Word/PPT/图片与PDF本地互转，无水印不排队',
  'handwrite': '中文多页真实手写字迹，作业救急一键导出',
  'references': 'GB/T 7714 参考文献自动规范化，论文排版降重必备',
  'sheets': '多份班级报名表合并对齐，学号不丢失纯本地处理',
  'college-nav': '学信网/研招网/四六级等常用官方入口汇总直达',

  // PDF 专属工具
  'pdf-page-number': 'PDF任意位置加页码，自定义字号与跳过封面无限制',
  'pdf-crop': 'PDF统一裁剪页边距去白边，纯前端保留原稿',
  'pdf-watermark': 'PDF叠加中文防盗用水印，全页密铺防止材料被盗用',
  'privacy': 'PDF作者元数据清理脱敏，提交论文盲审前抹去隐私',
  'batch-pdf': '多个PDF批量提取页面与转图，逐项下载不排队',

  // 图片与报名
  'photo': '报名照片一键裁剪480×640与压缩到100KB，考研考公必备',
  'color-picker': '图片点击快速取色，HEX/RGB/HSL即拷与主色分析',
  'stitch': '2–10张图片无损长图拼接，自由设置边距无平台水印',
  'images': '批量图片压缩与格式转换，改尺寸PNG/JPG/WebP一键打包',
  'background': '手动涂抹抠图换底色，红蓝白底证件照随心换',
  'ocr': '图片文字离线OCR识别，中英文截图一键提取文字',
  'materials': '报名材料格式尺寸自查，对齐官方报名通知',
  'scan': '扫描件增强变清晰，调整黑白对比度与灰度滤镜',

  // 学习写作与办公
  'leave-helper': '给导员/老师得体请假助手，微信正式当面三版话术',
  'material-collector': '班级材料收集名单核对，自动查谁没交导出核对表',
  'file-organizer': '作业文件批量重命名，智能编号与重名避让打包ZIP',
  'docx-check': 'DOCX论文格式排版检查，查标题字号与页边距',
  'compare': '文档两两对比查重，快速查看文字修改增删差异',
  'resume': '大学生免费求职简历，三款清新模板无水印导出',
  'course': '课程设计任务规划与报告提纲，快速整理答辩PPT',
  'ppt': 'PPTX幻灯片图片压缩瘦身，体积太大交作业急救',

  // 数据与计算
  'table-clean': 'Excel/CSV数据快速清洗去重，不传服务器保护隐私',
  'lab': '理工科实验数据计算与线性拟合，吸光度曲线快速出图',
  'grades': '期末考分反推与学分绩点GPA计算，保研留学算分',
  'cost': '会员软件单次成本与全网免费替代方案',
  'developer': '纯本地开发与文本工具箱，免登录离线计算保护代码',
  'timestamp': 'Unix时间戳秒/毫秒互转，自动识别纯本地计算',
  'text': '作业论文统计字数与去空行去重，纯本地实时预览',
  'finance': '等额本息/本金房贷月供与利息计算，不上传资产',
  'health': 'BMI与体脂率/每日热量估算，健康参考本地保护',
  'wishes': '拒绝工具付费墙许愿池，告诉我们你想免费用什么',
};

export const DEFAULT_PITCH = '纯本地免费急救工具箱，免登录、无水印、不上传文件。';

/**
 * 获取指定工具的一句话核心卖点
 */
export function getToolPitch(toolId: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  if (lang === 'en-US') {
    return enUS.tools[toolId]?.task || 'Privacy-first campus utility: 100% in-browser, no upload, zero watermarks.';
  }
  return TOOL_PITCHES[toolId] || DEFAULT_PITCH;
}

/**
 * 获取指定工具的标准直达链接（不使用任何第三方短链）
 */
export function getToolUrl(toolId: string): string {
  const t = tools.find((item) => item.id === toolId);
  if (!t) return SITE_URL;
  if (t.path.startsWith('/')) return SITE_URL + t.path;
  return `${SITE_URL}/${t.path}`;
}

/**
 * 一键复制的分享文案生成
 * 规范、真诚、不包含垃圾营销词，直戳大学生痛点
 */
export function generateShareCopy(toolId: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const isEn = lang === 'en-US';
  const tool = tools.find((t) => t.id === toolId);
  const name = isEn ? (enUS.tools[toolId]?.name || tool?.name || 'NOVIP Tool') : (tool?.name || 'NOVIP 实用工具');
  const pitch = getToolPitch(toolId, lang);
  const url = getToolUrl(toolId);

  if (isEn) {
    return [
      `[NOVIP] Campus Utility: ${name}`,
      `✨ Feature: ${pitch}`,
      `🔒 Privacy: 100% in-browser local processing, zero upload, no login, watermark-free`,
      `👉 Instant Access: ${url}`,
    ].join('\n');
  }

  return [
    `【NOVIP】大学做作业/报名前救急：${name}`,
    `✨ 卖点：${pitch}`,
    `🔒 优势：纯浏览器本地内存处理、不上传论文与个人文件、免登录无水印`,
    `👉 电脑/手机直达：${url}`,
  ].join('\n');
}

/**
 * 文本折行辅助函数
 */
function wrapLines(
  ctx: {measureText?: (text: string) => {width: number}},
  text: string,
  maxWidth: number
): string[] {
  if (!ctx.measureText) return [text];
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    const candidate = current + char;
    if (ctx.measureText(candidate).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * 绘制圆角矩形辅助函数（兼容低版本环境）
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * 使用纯本地 Canvas 渲染分享卡片
 * 尺寸：640 x 360 px
 * 元素：NOVIP 标识 + 工具名 + 一句话卖点 + 网址 + 隐私承诺
 */
export function renderShareCard(
  canvas: {getContext: (type: '2d') => CanvasRenderingContext2D | null; width: number; height: number},
  toolId: string,
  lang: 'zh-CN' | 'en-US' = 'zh-CN'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isEn = lang === 'en-US';
  const w = canvas.width || 640;
  const h = canvas.height || 360;

  const tool = tools.find((t) => t.id === toolId);
  const toolName = isEn ? (enUS.tools[toolId]?.name || tool?.name || 'NOVIP Campus Tool') : (tool?.name || 'NOVIP 大学生免费工具');
  const pitch = getToolPitch(toolId, lang);
  const url = getToolUrl(toolId);

  // 1. 卡片背景：现代商业质感深邃色背景
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  // 微弱环境光弧
  if (ctx.createRadialGradient) {
    const radial = ctx.createRadialGradient(80, 60, 10, 80, 60, 320);
    radial.addColorStop(0, 'rgba(239, 68, 68, 0.18)');
    radial.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);
  }

  // 卡片外边框
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 1, 1, w - 2, h - 2, 12);
  ctx.stroke();

  // 2. 顶部品牌栏：NOVIP 品牌红标 + 标语
  ctx.save();
  ctx.fillStyle = '#c9232c';
  drawRoundedRect(ctx, 32, 28, 76, 26, 6);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('NOVIP', 44, 46);

  // 标语
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(isEn ? 'Campus Privacy-First Toolkit' : '大学生免费急救工具箱', 118, 46);

  // 右上角特色徽章
  const badgeWidth = isEn ? 168 : 144;
  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, w - badgeWidth - 32, 28, badgeWidth, 26, 13);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText(isEn ? 'No Login · Watermark-Free' : '免登录 · 无水印 · 本地', w - badgeWidth - 20, 45);
  ctx.restore();

  // 3. 核心内容区域：工具名 + 一句话卖点
  ctx.save();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(toolName, 32, 108);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '14px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  const pitchLines = wrapLines(ctx, pitch, w - 64);
  let pitchY = 140;
  for (const line of pitchLines.slice(0, 2)) {
    ctx.fillText(line, 32, pitchY);
    pitchY += 22;
  }
  ctx.restore();

  // 4. 三大大学生承诺特征卡片
  ctx.save();
  const badges = isEn
    ? [
        {icon: '⚡', label: '100% In-Browser Memory'},
        {icon: '🔒', label: 'Zero Cloud Upload'},
        {icon: '🆓', label: '100% Free & No Login'},
      ]
    : [
        {icon: '⚡', label: '纯本地内存运算'},
        {icon: '🔒', label: '文件不上传云端'},
        {icon: '🆓', label: '无需充值免登录'},
      ];
  const bWidth = 180;
  const badgeGap = 16;
  const startX = 32;
  const badgeY = 210;

  badges.forEach((b, i) => {
    const bx = startX + i * (bWidth + badgeGap);
    ctx.fillStyle = '#1e293b';
    drawRoundedRect(ctx, bx, badgeY, bWidth, 36, 8);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${b.icon} ${b.label}`, bx + 10, badgeY + 23);
  });
  ctx.restore();

  // 5. 底部信息栏：分割线 + 网址
  ctx.save();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 276);
  ctx.lineTo(w - 32, 276);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillText(isEn ? 'Instant access on desktop & mobile' : '电脑与手机浏览器即开即用', 32, 312);

  ctx.fillStyle = '#60a5fa';
  ctx.font = 'bold 14px "SF Mono", Menlo, Consolas, monospace';
  const displayUrl = url.replace(/^https?:\/\//, '');
  const urlMetrics = ctx.measureText ? ctx.measureText(displayUrl).width : 220;
  ctx.fillText(displayUrl, w - 32 - urlMetrics, 312);
  ctx.restore();
}

/**
 * 生成并导出分享卡片为 PNG Blob
 */
export async function generateShareCardBlob(toolId: string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持 Canvas 渲染');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;

  renderShareCard(canvas, toolId, lang);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error(lang === 'en-US' ? 'Failed to export share card' : '卡片导出失败'));
      }
    }, 'image/png');
  });
}
