import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {tools} from '../src/tools/registry';
import {
  DEFAULT_PITCH,
  TOOL_PITCHES,
  getToolPitch,
  generateShareCopy,
  renderShareCard,
  SITE_URL,
} from '../src/tools/share-core';

/**
 * share-core DEFAULT_PITCH 回退契约。
 * 背景（2026-11-09 探针实测）：registry 62 个工具，TOOL_PITCHES 只有 39 条专用卖点，
 * 其余工具分享时全部回退到同一句 DEFAULT_PITCH（分享文案 + 分享卡片均走这句）。
 * 本文件只锁回退契约，不改生产代码；专用卖点数量用动态计算锁定，不写死 39/62，
 * 新增工具配了专用卖点或新工具加入回退集时测试仍应通过。
 */
describe('share-core DEFAULT_PITCH 回退契约', () => {
  it('DEFAULT_PITCH 逐字锁定', () => {
    assert.equal(DEFAULT_PITCH, '纯本地免费急救工具箱，免登录、无水印、不上传文件。');
  });

  it('DEFAULT_PITCH 包含四项公开承诺', () => {
    assert.ok(DEFAULT_PITCH.includes('纯本地'), '应承诺纯本地');
    assert.ok(DEFAULT_PITCH.includes('免登录'), '应承诺免登录');
    assert.ok(DEFAULT_PITCH.includes('无水印'), '应承诺无水印');
    assert.ok(DEFAULT_PITCH.includes('不上传文件'), '应承诺不上传文件');
  });

  it('TOOL_PITCHES 的 key 全部是真实 registry 工具 id，无死 key', () => {
    const ids = new Set(tools.map((t) => t.id));
    for (const key of Object.keys(TOOL_PITCHES)) {
      assert.ok(ids.has(key), `TOOL_PITCHES 含已不存在的工具 id: ${key}`);
    }
  });

  it('全部专用卖点非空，且没有一条与 DEFAULT_PITCH 雷同', () => {
    for (const [id, pitch] of Object.entries(TOOL_PITCHES)) {
      assert.ok(pitch && pitch.length > 5, `工具 ${id} 专用卖点缺失或太短: ${pitch}`);
      assert.notEqual(pitch, DEFAULT_PITCH, `工具 ${id} 的专用卖点与默认卖点雷同，回退将无意义`);
    }
  });

  it('getToolPitch 对每个专用 key 返回该工具的专用卖点', () => {
    for (const [id, pitch] of Object.entries(TOOL_PITCHES)) {
      assert.equal(getToolPitch(id), pitch, `工具 ${id} 应返回专用卖点`);
    }
  });

  it('getToolPitch 对未知 id 严格等于 DEFAULT_PITCH（不是近似文案）', () => {
    assert.equal(getToolPitch('unknown-non-existent-tool'), DEFAULT_PITCH);
    assert.equal(getToolPitch(''), DEFAULT_PITCH);
  });

  it('getToolPitch 对全部无专用卖点的 registry 工具严格等于 DEFAULT_PITCH', () => {
    const fallbackIds = tools.filter((t) => !(t.id in TOOL_PITCHES)).map((t) => t.id);
    assert.ok(fallbackIds.length > 0, '应存在回退到默认卖点的工具，否则本契约无意义');
    for (const id of fallbackIds) {
      assert.equal(getToolPitch(id), DEFAULT_PITCH, `工具 ${id} 无专用卖点，应严格回退到 DEFAULT_PITCH`);
    }
  });

  it('回退集合恰好是 registry 与 TOOL_PITCHES 的差集', () => {
    const fallbackIds = tools.filter((t) => !(t.id in TOOL_PITCHES)).map((t) => t.id);
    const dedicatedIds = Object.keys(TOOL_PITCHES);
    assert.equal(
      fallbackIds.length + dedicatedIds.length,
      tools.length,
      '专用 + 回退应恰好覆盖全部 registry 工具，无遗漏无重叠'
    );
    assert.equal(
      new Set([...fallbackIds, ...dedicatedIds]).size,
      tools.length,
      '专用与回退集合不应有交集'
    );
  });

  it('全部 registry 工具经 getToolPitch 都拿到非空卖点', () => {
    for (const tool of tools) {
      const pitch = getToolPitch(tool.id);
      assert.ok(pitch && pitch.length > 5, `工具 ${tool.id} 拿到的卖点缺失或太短: ${pitch}`);
    }
  });

  it('generateShareCopy（无专用卖点工具）卖点行逐字是 DEFAULT_PITCH', () => {
    const fallbackId = tools.find((t) => !(t.id in TOOL_PITCHES))!.id;
    const copy = generateShareCopy(fallbackId);
    assert.ok(copy.includes(`✨ 卖点：${DEFAULT_PITCH}`), `无专用卖点工具 ${fallbackId} 的分享文案卖点行应逐字是 DEFAULT_PITCH`);
  });

  it('generateShareCopy（未知 id）用默认工具名 + DEFAULT_PITCH + 站点首页链接', () => {
    const copy = generateShareCopy('unknown-non-existent-tool');
    assert.ok(copy.includes('NOVIP 实用工具'), '未知工具应回退到默认工具名');
    assert.ok(copy.includes(`✨ 卖点：${DEFAULT_PITCH}`), '未知工具卖点行应逐字是 DEFAULT_PITCH');
    assert.ok(copy.includes(SITE_URL), '未知工具直达链接应回退到站点首页');
    assert.ok(!copy.includes('undefined'), '未知工具文案不应出现 undefined');
  });

  it('generateShareCopy（有专用卖点工具）卖点行是专用卖点且不含 DEFAULT_PITCH', () => {
    const copy = generateShareCopy('pdf-compress');
    assert.ok(copy.includes(`✨ 卖点：${TOOL_PITCHES['pdf-compress']}`), '专用卖点工具应使用专用卖点');
    assert.ok(!copy.includes(DEFAULT_PITCH), '专用卖点工具的文案不应混入默认卖点');
  });

  it('generateShareCopy（无专用卖点工具）直达链接是 SITE_URL + 注册路径', () => {
    const tool = tools.find((t) => !(t.id in TOOL_PITCHES))!;
    const copy = generateShareCopy(tool.id);
    assert.ok(copy.includes(`${SITE_URL}${tool.path}`), `无专用卖点工具 ${tool.id} 的直达链接应为 SITE_URL + 注册路径`);
  });

  it('renderShareCard（无专用卖点工具）在卡片上绘制 DEFAULT_PITCH', () => {
    const filledTexts: string[] = [];
    const gradient = {addColorStop() {}};
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      fillRect() {},
      save() {},
      restore() {},
      beginPath() {},
      roundRect() {},
      moveTo() {},
      lineTo() {},
      arcTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      fillText(text: string) { filledTexts.push(String(text)); },
      measureText() { return {width: 200}; },
      createRadialGradient() { return gradient; },
    };
    const mockCanvas = {
      getContext: (type: string) => (type === '2d' ? (mockCtx as unknown as CanvasRenderingContext2D) : null),
      width: 640,
      height: 360,
    };
    const fallbackId = tools.find((t) => !(t.id in TOOL_PITCHES))!.id;
    renderShareCard(mockCanvas, fallbackId);
    assert.ok(
      filledTexts.some((t) => t.includes(DEFAULT_PITCH)),
      `无专用卖点工具 ${fallbackId} 的分享卡片应绘制 DEFAULT_PITCH`
    );
  });
});
