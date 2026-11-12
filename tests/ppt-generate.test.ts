import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PPT_THEMES,
  PPT_SCENARIOS,
  generatePptxBlob,
  type PptDeck,
  type PptThemeId,
  type PptScenarioId,
} from '../src/tools/ppt-generate-core.ts';

test('NOVIP PPT 生成核心引擎 · 主题与大纲预设完整性', () => {
  const themeIds: PptThemeId[] = ['apple-dark', 'academic-navy', 'modern-teal', 'warm-charcoal'];
  for (const id of themeIds) {
    const theme = PPT_THEMES[id];
    assert.ok(theme, `主题 ${id} 必须存在`);
    assert.equal(theme.id, id);
    assert.ok(/^[0-9A-Fa-f]{6}$/.test(theme.bgColor), `背景色应为合法 6 位 Hex: ${theme.bgColor}`);
    assert.ok(/^[0-9A-Fa-f]{6}$/.test(theme.primaryColor), `主色调应为合法 6 位 Hex: ${theme.primaryColor}`);
  }

  const scenarioIds: PptScenarioId[] = ['thesis', 'project', 'paper', 'competition'];
  for (const sId of scenarioIds) {
    const scenario = PPT_SCENARIOS[sId];
    assert.ok(scenario, `大纲预设 ${sId} 必须存在`);
    const deck = scenario.defaultDeck();
    assert.ok(deck.title.length > 0, '标题不可为空');
    assert.ok(deck.slides.length >= 4, `演示文稿页数应至少 4 页，当前: ${deck.slides.length}`);
    assert.equal(deck.slides[0].layout, 'title', '第一页应为标题页');
  }
});

test('NOVIP PPT 生成核心引擎 · 真实生成 PPTX 二进制文档', async () => {
  const deck: PptDeck = PPT_SCENARIOS.thesis.defaultDeck();
  const blob = await generatePptxBlob(deck);
  assert.ok(blob instanceof Blob, '输出应为合法 Blob 对象');
  assert.ok(blob.size > 1000, `生成的 PPTX 大小应大于 1KB，实际大小: ${blob.size} 字节`);
  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'MIME 类型应为标准 PPTX'
  );

  // 验证压缩包格式：PPTX 是 zip 结构，前 4 字节应为 PK (0x50, 0x4B, 0x03, 0x04)
  const buffer = await blob.arrayBuffer();
  const header = new Uint8Array(buffer.slice(0, 4));
  assert.equal(header[0], 0x50); // P
  assert.equal(header[1], 0x4b); // K
  assert.equal(header[2], 0x03);
  assert.equal(header[3], 0x04);
});
