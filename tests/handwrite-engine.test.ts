import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fontNames,
  fontLabels,
  paperLabels,
  defaults,
  layout,
  drawPage,
  type FontId,
  type Paper,
  type Settings
} from '../src/engine';

describe('手写生成器 V2 真实手写体与多样纸张核心测试', () => {
  it('1. 包含 14 款高质量手写字体并正确映射字体名称与展示标签', () => {
    const expectedFonts: FontId[] = [
      'chill',
      'klee',
      'chenyu',
      'yozai',
      'kuaile',
      'xiaolai',
      'jason1',
      'jason2',
      'jason8',
      'zhimang',
      'longcang',
      'liujian',
      'wenkai',
      'mashan',
      'custom'
    ];

    for (const id of expectedFonts) {
      assert.ok(fontNames[id], `字体 ${id} 必须在 fontNames 中注册`);
      assert.ok(fontLabels[id], `字体 ${id} 必须在 fontLabels 中有中文标签`);
    }

    assert.equal(fontLabels.zhimang, '志莽行书 · 灵动连笔');
    assert.equal(fontLabels.klee, '克利手写 · 清秀铅笔硬笔');
    assert.equal(fontLabels.liujian, '刘建毛草 · 潇洒速记');
    assert.equal(fontLabels.kuaile, '站酷快乐 · 青春活力体');
  });

  it('2. 包含 16 款大学生与学习生活手绘纸张样式', () => {
    const expectedPapers: Paper[] = [
      'college-notebook',
      'lined',
      'cornell',
      'kraft',
      'stationery',
      'grid',
      'english',
      'exam-sheet',
      'blank',
      'redlined',
      'manuscript-red',
      'manuscript-black',
      'cream',
      'dotted',
      'experiment',
      'custom'
    ];

    for (const p of expectedPapers) {
      assert.ok(paperLabels[p], `纸张 ${p} 必须在 paperLabels 中注册`);
    }

    assert.equal(paperLabels['college-notebook'], '大学软面抄 · 胶装横线本');
    assert.equal(paperLabels.cornell, '康奈尔笔记纸 · 课堂复习');
    assert.equal(paperLabels.kraft, '复古牛皮纸 · 做旧质感');
    assert.equal(paperLabels.stationery, '高校信笺 · 红头公函纸');
    assert.equal(paperLabels['exam-sheet'], '期末答题纸 · 密封装订线');
    assert.equal(paperLabels.english, '英语四线格 · 考研四六级');
  });

  it('3. 康奈尔笔记纸自动在左侧预留 Cue 提示区、底部预留总结区', () => {
    const s: Settings = { ...defaults, paper: 'cornell' };
    const pages = layout('康奈尔笔记核心概念测试\n第一行主笔记记录\n第二行笔记记录', s, () => 24);

    assert.ok(pages.length > 0, '排版结果至少生成 1 页');
    const firstGlyph = pages[0].glyphs[0];
    // Cornell notes start x at s.margin + 175
    assert.ok(
      firstGlyph.x >= s.margin + 170,
      `康奈尔主笔记左起始位置应为 ${s.margin + 175} 左右，实际为 ${firstGlyph.x}`
    );
  });

  it('4. 期末答题纸自动在左侧预留密封线与题头学号姓名区', () => {
    const s: Settings = { ...defaults, paper: 'exam-sheet' };
    const pages = layout('第一大题：论述当代大学生学业规划。\n回答要点一：制定可量化目标。', s, () => 24);

    assert.ok(pages.length > 0);
    const firstGlyph = pages[0].glyphs[0];
    assert.ok(
      firstGlyph.x >= s.margin + 50,
      `期末答题纸左起始位置应预留密封装订线，实际为 ${firstGlyph.x}`
    );
    assert.ok(
      firstGlyph.y >= s.margin + s.fontSize + 50,
      `期末答题纸首行 Y 应在课程学号姓名栏下方，实际为 ${firstGlyph.y}`
    );
  });

  it('5. 大学软面抄与高校信笺顶部预留抬头与日期区', () => {
    const notebookSettings: Settings = { ...defaults, paper: 'college-notebook' };
    const nbPages = layout('今天在图书馆自习，微风不燥。', notebookSettings, () => 24);
    assert.ok(nbPages[0].glyphs[0].y > notebookSettings.margin + notebookSettings.fontSize + 10);

    const letterSettings: Settings = { ...defaults, paper: 'stationery' };
    const letterPages = layout('尊敬的老师：您好！此致敬礼。', letterSettings, () => 24);
    assert.ok(letterPages[0].glyphs[0].y > letterSettings.margin + letterSettings.fontSize + 20);
  });

  it('6. 中文标点弹性挤压排版，杜绝标点过大空洞假感', () => {
    const s: Settings = { ...defaults, spacing: 2 };
    let measureCalls = 0;
    const pages = layout('测试，内容。', s, (char) => {
      measureCalls++;
      return 24;
    });

    assert.ok(pages.length > 0);
    assert.equal(pages[0].glyphs.length, 6);
    // 标点符号占用宽度应合理收敛
    const comma = pages[0].glyphs[2];
    const afterComma = pages[0].glyphs[3];
    const diff = afterComma.x - comma.x;
    assert.ok(diff < 26, `标点后字符间距不应过宽，当前为 ${diff}`);
  });

  it('7. 画布 drawPage 正常执行各真实纸张绘制与真实墨晕阴影且无异常抛出', () => {
    // Mock canvas context
    const createMockCanvas = () => {
      const c = {
        scale: () => {},
        fillRect: () => {},
        drawImage: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        strokeRect: () => {},
        arc: () => {},
        fill: () => {},
        fillText: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        transform: () => {},
        setLineDash: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        shadowColor: '',
        shadowBlur: 0,
        textBaseline: '',
        textAlign: ''
      };
      return {
        width: 794,
        height: 1123,
        getContext: () => c
      } as unknown as HTMLCanvasElement;
    };

    const papersToTest: Paper[] = [
      'college-notebook',
      'cornell',
      'kraft',
      'stationery',
      'english',
      'exam-sheet',
      'cream',
      'lined',
      'blank'
    ];

    for (const paper of papersToTest) {
      const canvas = createMockCanvas();
      const s: Settings = { ...defaults, paper, penVariation: 0 };
      const page = {
        glyphs: [
          { char: '学', x: 70, y: 100, angle: 0, sx: 1, sy: 1, skew: 0, alpha: 1, pressure: 0.1, index: 0 },
          { char: '习', x: 96, y: 100, angle: 0, sx: 1, sy: 1, skew: 0, alpha: 1, pressure: 0.1, index: 1 }
        ]
      };

      assert.doesNotThrow(() => {
        drawPage(canvas, page, s, 1, () => 'ChillZhuo');
      }, `绘制纸张 ${paper} 时不应抛出错误`);
    }
  });
});
