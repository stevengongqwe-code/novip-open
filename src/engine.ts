import {drawPen} from './pen';
import type {PersonalFont} from './local-fonts';

export type Paper =
  | 'college-notebook'
  | 'lined'
  | 'cornell'
  | 'kraft'
  | 'stationery'
  | 'grid'
  | 'english'
  | 'exam-sheet'
  | 'blank'
  | 'redlined'
  | 'manuscript-red'
  | 'manuscript-black'
  | 'cream'
  | 'dotted'
  | 'experiment'
  | 'custom';

export type FontId =
  | 'custom'
  | 'chill'
  | 'klee'
  | 'chenyu'
  | 'yozai'
  | 'kuaile'
  | 'xiaolai'
  | 'jason1'
  | 'jason2'
  | 'jason8'
  | 'zhimang'
  | 'longcang'
  | 'liujian'
  | 'wenkai'
  | 'mashan';

export interface Settings {
  paper: Paper;
  size: 'A4' | 'B5' | 'A3';
  landscape: boolean;
  background?: HTMLImageElement;
  font: FontId;
  personalFonts?: PersonalFont[];
  penVariation: number;
  fontSize: number;
  lineHeight: number;
  spacing: number;
  margin: number;
  naturalness: number;
  seed: number;
  ink: string;
  offsetX?: number;
  offsetY?: number;
}

export const PAGE_W = 794, PAGE_H = 1123;

export const defaults: Settings = {
  paper: 'college-notebook',
  size: 'A4',
  landscape: false,
  font: 'chill',
  penVariation: 65,
  fontSize: 26,
  lineHeight: 42,
  spacing: 1,
  margin: 62,
  naturalness: 50,
  seed: 7,
  ink: '#1a1a1a',
  offsetX: 0,
  offsetY: 0
};

export const fontNames: Record<FontId, string> = {
  custom: 'PaperPen Personal',
  chill: 'ChillZhuo',
  klee: 'Klee One',
  chenyu: 'ChenYuluoyan',
  yozai: 'Yozai',
  kuaile: 'ZCOOL KuaiLe',
  xiaolai: 'Xiaolai SC',
  jason1: 'JasonHandwriting1',
  jason2: 'JasonHandwriting2',
  jason8: 'JasonHandwriting8p',
  zhimang: 'Zhi Mang Xing',
  longcang: 'Long Cang',
  liujian: 'Liu Jian Mao Cao',
  wenkai: 'LXGW WenKai',
  mashan: 'Ma Shan Zheng'
};

export const fontLabels: Record<FontId, string> = {
  custom: '我的个人字库',
  chill: '寒蝉手拙 · 随性中性笔',
  klee: '克利手写 · 清秀铅笔硬笔',
  chenyu: '辰宇落雁 · 细笔随写',
  yozai: '悠哉日常 · 柔和手写',
  kuaile: '站酷快乐 · 青春活力体',
  xiaolai: '小赖手写 · 圆润随写',
  jason1: '清松 1 · 原子笔圆润',
  jason2: '清松 2 · 原子笔清秀',
  jason8: '清松 8 · 原子笔随性',
  zhimang: '志莽行书 · 灵动连笔',
  longcang: '龙藏行书 · 洒脱行书',
  liujian: '刘建毛草 · 潇洒速记',
  wenkai: '文楷规范 · 规整字帖',
  mashan: '马善政 · 毛笔书法'
};

export const paperLabels: Record<Paper, string> = {
  'college-notebook': '大学软面抄 · 胶装横线本',
  lined: '经典横线纸 · 简约清新',
  cornell: '康奈尔笔记纸 · 课堂复习',
  kraft: '复古牛皮纸 · 做旧质感',
  stationery: '高校信笺 · 红头公函纸',
  grid: '极简方格纸 · 草稿演算',
  english: '英语四线格 · 考研四六级',
  'exam-sheet': '期末答题纸 · 密封装订线',
  blank: '纯白复印纸 · 打印纸',
  redlined: '红线信纸 · 经典双框',
  'manuscript-red': '红格稿纸 · 400 字',
  'manuscript-black': '黑格稿纸 · 400 字',
  cream: '护眼米黄纸 · 柔和温润',
  dotted: '点阵手帐纸 · 极简点阵',
  experiment: '实验报告纸 · 通用自绘',
  custom: '我的纸张照片（自定义上传）'
};

export function dimensions(s: Settings) {
  const sizes = { A4: [210, 297], B5: [176, 250], A3: [297, 420] };
  let [mmW, mmH] = sizes[s.size];
  if (s.landscape) [mmW, mmH] = [mmH, mmW];
  return { mmW, mmH, width: Math.round((mmW * 96) / 25.4), height: Math.round((mmH * 96) / 25.4) };
}

export function manuscript(s: Settings) {
  return s.paper.startsWith('manuscript');
}

export function manuscriptGrid(s: Settings) {
  const { width, height } = dimensions(s),
    cell = Math.min((width - 2 * s.margin) / 20, (height - 2 * s.margin) / 20);
  return { cell, left: (width - cell * 20) / 2, top: s.margin + Math.max(0, (height - 2 * s.margin - cell * 20) * 0.25) };
}

export function writingSize(s: Settings) {
  return manuscript(s) ? Math.min(s.fontSize, manuscriptGrid(s).cell * 0.7) : s.fontSize;
}

export interface Glyph {
  char: string;
  x: number;
  y: number;
  angle: number;
  sx: number;
  sy: number;
  skew: number;
  alpha: number;
  pressure: number;
  index: number;
}

export interface Page {
  glyphs: Glyph[];
}

export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function graphemes(text: string): string[] {
  return Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text), x => x.segment);
}

const closing = /^[，。！？；：、）》】」』〕〉”’…,.!?;:%]$/u;

export function layout(text: string, s: Settings, measure: (char: string, index?: number) => number): Page[] {
  const chars = graphemes(text.replace(/\r\n?/g, '\n').replace(/\t/g, '    '));
  const rand = rng(s.seed),
    a = s.naturalness / 100;
  const { width: pageW, height: pageH } = dimensions(s),
    fontSize = writingSize(s);

  // Layout bounds based on paper style
  let startX = s.margin;
  let topOffset = 0;
  let bottomPadding = 6;
  let rightMargin = s.margin + 6;

  if (s.paper === 'cornell') {
    startX = s.margin + 175; // cue area reserved on left
    bottomPadding = 115; // summary area reserved at bottom
  } else if (s.paper === 'exam-sheet') {
    startX = s.margin + 52; // binding zone reserved on left
    topOffset = 55; // header info reserved
  } else if (s.paper === 'college-notebook') {
    topOffset = 18; // date & header reserved
  } else if (s.paper === 'stationery') {
    topOffset = 26; // letterhead banner reserved
    bottomPadding = 28; // footer page number reserved
  } else if (s.paper === 'experiment') {
    topOffset = 80;
  }

  const pages: Page[] = [{ glyphs: [] }];
  let x = startX,
    y = s.margin + s.fontSize + topOffset,
    page = pages[0],
    line = 0;
  const right = pageW - rightMargin,
    bottom = pageH - s.margin - bottomPadding;

  if (manuscript(s)) {
    const { cell, left, top } = manuscriptGrid(s);
    let col = 0,
      row = 0;
    function advance() {
      col = 0;
      row++;
      if (row === 20) {
        row = 0;
        page = { glyphs: [] };
        pages.push(page);
      }
    }
    chars.forEach((char, index) => {
      if (char === '\n') {
        advance();
        return;
      }
      if (col === 20) advance();
      const fitted = Math.min((measure(char, index) * fontSize) / s.fontSize, cell * 0.82);
      page.glyphs.push({
        char,
        x: left + col * cell + (cell - fitted) / 2 + (rand() - 0.5) * cell * 0.045 * a,
        y: top + row * cell + cell * 0.5 + fontSize * 0.36 + (rand() - 0.5) * fontSize * 0.1 * a,
        angle: (rand() - 0.5) * 0.075 * a,
        sx: 1 + (rand() - 0.5) * 0.1 * a,
        sy: 1 + (rand() - 0.5) * 0.1 * a,
        skew: (rand() - 0.5) * 0.08 * a,
        alpha: 1 - rand() * 0.14 * a,
        pressure: rand() * fontSize * 0.01 * a,
        index
      });
      col++;
    });
    while (pages.length > 1 && !pages.at(-1)!.glyphs.length) pages.pop();
    return pages;
  }

  function nextLine() {
    x = startX;
    line++;
    y += s.lineHeight * (1 + (rand() - 0.5) * 0.035 * a);
    if (y + s.fontSize * 0.25 > bottom) {
      page = { glyphs: [] };
      pages.push(page);
      y = s.margin + s.fontSize + topOffset;
      line = 0;
    }
  }

  chars.forEach((char, index) => {
    if (char === '\n') {
      nextLine();
      return;
    }
    const isPunc = closing.test(char) || /^[，。！？；：、）》】」』〕〉”’…,.!?;:]$/u.test(char);
    const measured = measure(char, index);
    const width =
      s.paper === 'grid'
        ? s.fontSize + s.spacing
        : isPunc
          ? Math.max(measured * 0.62, s.fontSize * 0.32) + s.spacing
          : Math.max(measured, s.fontSize * 0.25) + s.spacing;

    // Reserve room for following punctuation so it cannot become a line's first character.
    const next = chars[index + 1],
      reserve = next && closing.test(next) ? (s.paper === 'grid' ? s.fontSize + s.spacing : measure(next, index + 1) * 0.65 + s.spacing) : 0;

    if (x > startX && x + width + reserve > right) nextLine();

    // Natural human writing flow: low-frequency gentle line wave + micro stroke jitter
    const lineWave = Math.sin(line * 1.5 + index * 0.04) * 0.85 * a;
    const charJitter = (rand() - 0.5) * Math.max(s.spacing, s.fontSize * 0.08) * a;
    const baseline = y + lineWave + charJitter;

    page.glyphs.push({
      char,
      x: x + (rand() - 0.5) * 1.4 * a,
      y: Math.min(baseline, bottom - s.fontSize * 0.3),
      angle: a ? ((rand() - 0.5) * 0.042 + Math.sin(index * 0.08) * 0.012) * a : 0,
      sx: 1 + (rand() - 0.5) * 0.08 * a,
      sy: 1 + (rand() - 0.5) * 0.095 * a,
      skew: ((rand() - 0.5) * 0.05 + 0.012) * a,
      alpha: 1 - rand() * 0.14 * a,
      pressure: rand() * s.fontSize * 0.01 * a,
      index
    });
    x += width;
  });

  while (pages.length > 1 && !pages[pages.length - 1].glyphs.length) pages.pop();
  return pages;
}

export function drawPage(
  canvas: HTMLCanvasElement,
  page: Page,
  s: Settings,
  scale: number,
  fontFor: (char: string, index?: number) => string
) {
  const { width, height } = dimensions(s),
    fontSize = writingSize(s);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('当前浏览器不支持画布，请使用最新版 Chrome。');

  c.scale(scale, scale);

  // 1. Natural Paper Tones
  const paperBg: Record<Paper, string> = {
    blank: '#ffffff',
    lined: '#faf8f5',
    'college-notebook': '#faf7f0',
    cornell: '#fafaf9',
    kraft: '#ebd9bc',
    stationery: '#fdfcf9',
    grid: '#fcfcfc',
    english: '#fcfbfa',
    'exam-sheet': '#faf8f5',
    redlined: '#fffefa',
    'manuscript-red': '#fcfaf6',
    'manuscript-black': '#fcfaf6',
    cream: '#f6eedc',
    dotted: '#faf8f4',
    experiment: '#f8faf8',
    custom: '#ffffff'
  };

  c.fillStyle = paperBg[s.paper] || '#ffffff';
  c.fillRect(0, 0, width, height);

  if (s.paper === 'custom' && s.background) {
    c.drawImage(s.background, 0, 0, width, height);
  }

  // 2. Procedural Paper Fiber / Texture Layer (for authentic physical realism)
  if (['kraft', 'college-notebook', 'cream', 'stationery'].includes(s.paper)) {
    const pr = rng(s.seed * 41 + 107);
    const count = s.paper === 'kraft' ? 240 : 75;
    c.save();
    for (let i = 0; i < count; i++) {
      const fx = pr() * width;
      const fy = pr() * height;
      const flen = 3 + pr() * (s.paper === 'kraft' ? 14 : 7);
      const fangle = pr() * Math.PI;
      c.strokeStyle = s.paper === 'kraft' ? (pr() > 0.5 ? '#b89f7c' : '#8a6e50') : '#d8cfbe';
      c.lineWidth = 0.4 + pr() * 0.35;
      c.globalAlpha = s.paper === 'kraft' ? 0.12 + pr() * 0.16 : 0.04 + pr() * 0.06;
      c.beginPath();
      c.moveTo(fx, fy);
      c.lineTo(fx + Math.cos(fangle) * flen, fy + Math.sin(fangle) * flen);
      c.stroke();
    }
    c.restore();
  }

  // 3. Subtle Lighting Falloff (Vignette)
  const vig = c.createLinearGradient(0, 0, 0, height);
  vig.addColorStop(0, 'rgba(0,0,0,0.016)');
  vig.addColorStop(0.06, 'rgba(0,0,0,0)');
  vig.addColorStop(0.94, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.024)');
  c.fillStyle = vig;
  c.fillRect(0, 0, width, height);

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };

  // 4. Paper-Specific Ruling & Guides
  if (manuscript(s)) {
    const { cell, left, top } = manuscriptGrid(s);
    c.strokeStyle = s.paper === 'manuscript-red' ? '#bc5656' : '#60666a';
    c.lineWidth = 0.8;
    for (let i = 0; i <= 20; i++) {
      line(left + i * cell, top, left + i * cell, top + 20 * cell);
      line(left, top + i * cell, left + 20 * cell, top + i * cell);
    }
    c.lineWidth = 1.5;
    c.strokeRect(left, top, 20 * cell, 20 * cell);
  } else if (s.paper === 'college-notebook') {
    // College Softcover Notebook (大学软面抄)
    c.font = '12px system-ui, -apple-system, sans-serif';
    c.fillStyle = '#7a8c9e';
    c.fillText('NO. ___________        DATE: 20___ / ___ / ___        WEATHER: ☀️  ⛅  🌧️', s.margin, s.margin + 4);

    // Left vertical margin line in red
    c.strokeStyle = '#e06c75';
    c.lineWidth = 1.0;
    line(s.margin - 12, s.margin - 16, s.margin - 12, height - s.margin);

    // Ruled horizontal lines in soothing notebook blue
    c.strokeStyle = '#bed6ed';
    c.lineWidth = 0.65;
    const top = s.margin + s.fontSize * 0.32 + 18;
    for (let y = top; y < height - s.margin; y += s.lineHeight) {
      line(s.margin - 12, y, width - s.margin, y);
    }
  } else if (s.paper === 'cornell') {
    // Cornell Notes Paper (康奈尔笔记法)
    const cueX = s.margin + 160;
    const summaryY = height - s.margin - 100;
    c.strokeStyle = '#94a3b8';
    c.lineWidth = 1.0;
    line(cueX, s.margin - 10, cueX, summaryY);
    line(s.margin, summaryY, width - s.margin, summaryY);

    c.font = 'bold 11px system-ui, -apple-system, sans-serif';
    c.fillStyle = '#64748b';
    c.fillText('CUE · 关键词 / 提示区', s.margin + 6, s.margin + 4);
    c.fillText('NOTES · 课堂主笔记区', cueX + 16, s.margin + 4);
    c.fillText('SUMMARY · 本页核心反思与总结', s.margin + 6, summaryY + 22);

    c.strokeStyle = '#e2e8f0';
    c.lineWidth = 0.55;
    for (let y = s.margin + 28; y < summaryY - 8; y += s.lineHeight) {
      line(cueX, y, width - s.margin, y);
    }
  } else if (s.paper === 'kraft') {
    // Vintage Kraft Paper (复古牛皮纸)
    c.strokeStyle = '#aa9174';
    c.lineWidth = 0.7;
    const top = s.margin + s.fontSize * 0.32;
    for (let y = top; y < height - s.margin; y += s.lineHeight) {
      line(s.margin, y, width - s.margin, y);
    }
  } else if (s.paper === 'stationery') {
    // University Letterhead (高校信笺)
    c.strokeStyle = '#cf3232';
    c.lineWidth = 1.6;
    line(s.margin, s.margin - 14, width - s.margin, s.margin - 14);
    c.lineWidth = 0.7;
    line(s.margin, s.margin - 10, width - s.margin, s.margin - 10);

    c.font = 'bold 14px "Songti SC", SimSun, serif';
    c.fillStyle = '#cf3232';
    c.textAlign = 'center';
    c.fillText('【 高 等 院 校 专 用 信 笺 】', width / 2, s.margin - 22);
    c.textAlign = 'left';

    c.strokeStyle = '#d66363';
    c.lineWidth = 0.65;
    const top = s.margin + s.fontSize * 0.32 + 26;
    for (let y = top; y < height - s.margin - 16; y += s.lineHeight) {
      line(s.margin, y, width - s.margin, y);
    }
    line(s.margin, top, s.margin, height - s.margin - 16);
    line(width - s.margin, top, width - s.margin, height - s.margin - 16);

    c.font = '11px "Songti SC", serif';
    c.fillStyle = '#a83232';
    c.fillText('第 ＿＿ 页 · 共 ＿＿ 页', width - s.margin - 120, height - s.margin + 12);
  } else if (s.paper === 'english') {
    // English 4-Line Grid (英语四线三格)
    const top = s.margin + s.fontSize * 0.32;
    for (let y = top; y < height - s.margin; y += s.lineHeight) {
      const h = s.fontSize * 0.8;
      c.strokeStyle = '#a0b8d0';
      c.lineWidth = 0.55;
      line(s.margin, y - h, width - s.margin, y - h);
      c.strokeStyle = '#b0c4d8';
      c.setLineDash([3, 3]);
      line(s.margin, y - h * 0.5, width - s.margin, y - h * 0.5);
      c.setLineDash([]);
      c.strokeStyle = '#d96060';
      c.lineWidth = 0.75;
      line(s.margin, y, width - s.margin, y);
      c.strokeStyle = '#a0b8d0';
      c.lineWidth = 0.55;
      line(s.margin, y + h * 0.35, width - s.margin, y + h * 0.35);
    }
  } else if (s.paper === 'exam-sheet') {
    // Exam Answer Sheet (期末大作业答题纸)
    const sealX = s.margin + 36;
    c.strokeStyle = '#8c8c8c';
    c.setLineDash([4, 4]);
    line(sealX, s.margin, sealX, height - s.margin);
    c.setLineDash([]);

    c.save();
    c.translate(s.margin + 12, height / 2);
    c.rotate(-Math.PI / 2);
    c.font = '12px system-ui, sans-serif';
    c.fillStyle = '#7a7a7a';
    c.textAlign = 'center';
    c.fillText('密 封 线 内 不 要 答 题 · 装 订 线', 0, 0);
    c.restore();

    c.font = '13px system-ui, sans-serif';
    c.fillStyle = '#333333';
    c.fillText('课程：________________  姓名：____________  学号：____________  成绩：________', sealX + 16, s.margin + 14);
    c.strokeStyle = '#999';
    c.lineWidth = 0.8;
    line(sealX + 10, s.margin + 28, width - s.margin, s.margin + 28);

    c.strokeStyle = '#cad5e0';
    c.lineWidth = 0.65;
    for (let y = s.margin + 62; y < height - s.margin; y += s.lineHeight) {
      line(sealX + 10, y, width - s.margin, y);
    }
  } else if (s.paper === 'dotted') {
    c.fillStyle = '#bfc9c8';
    for (let y = s.margin; y < height - s.margin; y += s.lineHeight)
      for (let x = s.margin; x < width - s.margin; x += s.lineHeight) {
        c.beginPath();
        c.arc(x, y, 0.85, 0, Math.PI * 2);
        c.fill();
      }
  } else if (['lined', 'grid', 'redlined', 'cream', 'experiment'].includes(s.paper)) {
    const step = s.paper === 'grid' ? s.fontSize + s.spacing : s.lineHeight,
      top = s.margin + s.fontSize * 0.32 + (s.paper === 'experiment' ? 80 : 0);
    c.strokeStyle = s.paper === 'grid' ? '#d5dfe1' : s.paper === 'redlined' ? '#bf7777' : '#cad9d5';
    c.lineWidth = 0.65;
    for (let y = top; y < height - s.margin; y += step) line(s.margin, y, width - s.margin, y);
    if (s.paper === 'grid') for (let x = s.margin; x <= width - s.margin; x += step) line(x, top, x, height - s.margin);
    if (s.paper === 'redlined') {
      c.lineWidth = 1.1;
      line(s.margin, top, width - s.margin, top);
      line(s.margin, top, s.margin, height - s.margin);
      line(width - s.margin, top, width - s.margin, height - s.margin);
    }
  }

  if (s.paper === 'experiment') {
    c.font = '16px system-ui';
    c.fillStyle = '#567061';
    c.fillText('实验名称：________________    日期：____________', s.margin, s.margin + 20);
    c.fillText('姓名：____________    班级：____________', s.margin, s.margin + 52);
  }

  // 5. Inking with Realistic Ink Bleed & Fiber Absorption
  c.translate(Math.max(-15, Math.min(15, s.offsetX ?? 0)), Math.max(-15, Math.min(15, s.offsetY ?? 0)));
  c.fillStyle = s.ink;
  c.textBaseline = 'alphabetic';

  // Liquid ink bleed on paper fibers
  c.shadowColor = s.ink;
  c.shadowBlur = Math.max(0.4, Math.min(1.2, fontSize * 0.035));

  for (const g of page.glyphs) {
    c.save();
    c.translate(g.x, g.y);
    c.rotate(g.angle);
    c.transform(g.sx, 0, g.skew, g.sy, 0, 0);
    c.globalAlpha = g.alpha;
    const family = fontFor(g.char, g.index);
    if (s.penVariation > 0 && s.naturalness > 0) {
      drawPen(c, g.char, family, fontSize, s.ink, (s.seed * 65537 + g.index * 131 + g.char.codePointAt(0)!) | 0, s.penVariation / 100);
    } else {
      c.font = `${fontSize}px "${family}"`;
      c.fillText(g.char, 0, 0);
    }
    c.restore();
  }

  c.shadowBlur = 0;
}
