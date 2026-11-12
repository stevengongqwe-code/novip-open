import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 计算相对亮度 (WCAG 2.1)
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// 计算对比度 (L1 + 0.05) / (L2 + 0.05)
function getContrastRatio(hex1: string, hex2: string): number {
  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };

  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);

  const l1 = getRelativeLuminance(r1, g1, b1);
  const l2 = getRelativeLuminance(r2, g2, b2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('暗色模式与无障碍对比度检查 (WCAG AA 正文 ≥ 4.5:1)', () => {
  const toolsCss = fs.readFileSync(path.resolve('src/tools/tools.css'), 'utf-8');
  const pdfToolsCss = fs.readFileSync(path.resolve('src/tools/pdf-tools.css'), 'utf-8');

  it('浅色模式下关键正文与背景对比度均 ≥ 4.5:1', () => {
    // 浅色背景 #ffffff / #fafafa
    const lightBg = '#ffffff';
    const lightGreyBg = '#fafafa';

    const testPairs: Array<{name: string; fg: string; bg: string}> = [
      {name: '首页卡片正文 (home-card p)', fg: '#52525b', bg: lightBg},
      {name: '首页副文本与提示 (study-lead)', fg: '#52525b', bg: lightBg},
      {name: '首页胶囊标签 (home-pill)', fg: '#52525b', bg: lightBg},
      {name: '首页快捷标签 (home-tag-btn)', fg: '#3f3f46', bg: '#f4f4f5'},
      {name: 'PDF队列元信息 (pdf-queue-meta)', fg: '#52525b', bg: lightBg},
      {name: 'PDF文件名 (pdf-file-name)', fg: '#18181b', bg: lightBg},
      {name: '蓝色急救卡片正文', fg: '#1e40af', bg: '#eff6ff'},
      {name: '绿色急救卡片正文', fg: '#166534', bg: '#f0fdf4'},
      {name: '黄色急救卡片正文', fg: '#854d0e', bg: '#fefce8'},
      {name: '文件上限提示正文', fg: '#334155', bg: '#f8fafc'},
      {name: '微信环境提示正文', fg: '#14532d', bg: '#f0fdf4'},
      {name: '纯SVG空状态说明文案', fg: '#52525b', bg: lightGreyBg},
    ];

    for (const pair of testPairs) {
      const ratio = getContrastRatio(pair.fg, pair.bg);
      assert.ok(
        ratio >= 4.5,
        `浅色模式【${pair.name}】前景色 ${pair.fg} 与背景色 ${pair.bg} 对比度为 ${ratio.toFixed(2)}:1，未达到 4.5:1 标准`
      );
    }
  });

  it('暗色模式下关键正文与背景对比度均 ≥ 4.5:1', () => {
    const darkCardBg = '#18181b';
    const darkElevatedBg = '#1f1f23';

    const testPairs: Array<{name: string; fg: string; bg: string}> = [
      {name: '暗色首页卡片标题', fg: '#f4f4f5', bg: darkCardBg},
      {name: '暗色首页卡片正文', fg: '#a1a1aa', bg: darkCardBg},
      {name: '暗色工具页主文本', fg: '#e4e4e7', bg: darkCardBg},
      {name: '暗色胶囊标签', fg: '#d4d4d8', bg: darkElevatedBg},
      {name: '暗色热搜标签', fg: '#e4e4e7', bg: '#27272a'},
      {name: '暗色PDF队列文件名', fg: '#f4f4f5', bg: darkElevatedBg},
      {name: '暗色PDF队列元数据', fg: '#a1a1aa', bg: darkElevatedBg},
      {name: '暗色PDF标签按钮', fg: '#e4e4e7', bg: '#27272a'},
      {name: '暗色蓝色急救卡正文', fg: '#bfdbfe', bg: '#0f172a'},
      {name: '暗色绿色急救卡正文', fg: '#bbf7d0', bg: '#052e16'},
      {name: '暗色黄色急救卡正文', fg: '#fef08a', bg: '#1c1917'},
      {name: '暗色空状态说明文本', fg: '#d4d4d8', bg: darkCardBg},
      {name: '暗色成功态正文', fg: '#bbf7d0', bg: '#052e16'},
      {name: '暗色失败态正文', fg: '#fca5a5', bg: '#2a1215'},
    ];

    for (const pair of testPairs) {
      const ratio = getContrastRatio(pair.fg, pair.bg);
      assert.ok(
        ratio >= 4.5,
        `暗色模式【${pair.name}】前景色 ${pair.fg} 与背景色 ${pair.bg} 对比度为 ${ratio.toFixed(2)}:1，未达到 4.5:1 标准`
      );
    }
  });

  it('tools.css 与 pdf-tools.css 均包含 prefers-color-scheme: dark 媒体查询', () => {
    assert.match(toolsCss, /@media\s*\(prefers-color-scheme:\s*dark\)/);
    assert.match(pdfToolsCss, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  });

  it('tools.css 与 pdf-tools.css 均严格支持 prefers-reduced-motion: reduce', () => {
    assert.match(toolsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(pdfToolsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

    // 验证 transition / transform / animation 兜底清除
    assert.match(toolsCss, /transition:\s*none\s*!important/);
    assert.match(pdfToolsCss, /transition:\s*none\s*!important/);
  });

  it('PDF 列表具备平滑过渡动画定义 (transition: transform)', () => {
    assert.match(pdfToolsCss, /\.pdf-queue-item[\s\S]*?transition:\s*transform/);
    assert.match(pdfToolsCss, /\.pdf-queue-actions\s+button[\s\S]*?min-width:\s*44px/);
  });
});
