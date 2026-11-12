import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName} from 'pdf-lib';
import {
  WATERMARK_DEFAULTS,
  WATERMARK_LIMITS,
  addWatermark,
  hexToRgb,
  normalizeWatermarkOptions,
  planTilePoints,
} from '../src/tools/watermark-core';

// 1x1 透明 PNG：Node 环境没有 Canvas，用它验证 pdf-lib 叠加流程本身。
const TINY_PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
));

async function makePdf(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [width, height] of sizes) doc.addPage([width, height]);
  return doc.save();
}

test('hexToRgb 接受带 # 与不带 # 的六位颜色', () => {
  assert.deepEqual(hexToRgb('#c9232c'), {r: 201, g: 35, b: 44});
  assert.deepEqual(hexToRgb('FFFFFF'), {r: 255, g: 255, b: 255});
  assert.throws(() => hexToRgb('#fff'), /6 位十六进制/);
  assert.throws(() => hexToRgb('red'), /6 位十六进制/);
  assert.throws(() => hexToRgb('#12345g'), /6 位十六进制/);
});

test('normalizeWatermarkOptions 规范化并拒绝越界参数', () => {
  const normalized = normalizeWatermarkOptions({
    text: '  仅供报名使用  ',
    mode: 'tile',
    fontSize: 36.4,
    opacity: 0.184,
    rotate: -30.6,
    color: 'C9232C',
    range: ' 1-3, 5 ',
  });
  assert.equal(normalized.text, '仅供报名使用');
  assert.equal(normalized.fontSize, 36);
  assert.equal(normalized.opacity, 0.18);
  assert.equal(normalized.rotate, -31);
  assert.equal(normalized.color, '#c9232c');
  assert.equal(normalized.range, '1-3, 5');

  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, text: '   '}), /请先输入水印文字/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, text: '水'.repeat(WATERMARK_LIMITS.maxTextLength + 1)}), /最多 40 个字符/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, fontSize: 9}), /字号/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, fontSize: 121}), /字号/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, opacity: 0.01}), /透明度/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, opacity: 1}), /透明度/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, rotate: 91}), /旋转角度/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, color: '#12'}), /6 位十六进制/);
  assert.throws(() => normalizeWatermarkOptions({...WATERMARK_DEFAULTS, text: 'a\u0001b'}), /控制字符/);
  // 未知排布方式回落到密铺，而不是抛出与用户无关的类型错误。
  assert.equal(normalizeWatermarkOptions({...WATERMARK_DEFAULTS, mode: 'weird' as never}).mode, 'tile');
});

test('planTilePoints 覆盖整页、错行排列且结果有限', () => {
  const points = planTilePoints(595, 842, 200, 60, 40, 40);
  assert.ok(points.length >= 8, `平铺点过少：${points.length}`);
  for (const point of points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= -400 && point.x <= 1000);
    assert.ok(point.y >= -200 && point.y <= 1200);
  }
  const rows = new Map<number, number[]>();
  for (const point of points) {
    const key = Math.round(point.y);
    rows.set(key, [...(rows.get(key) ?? []), point.x]);
  }
  assert.ok(rows.size >= 2);
  // 相邻两行起始点错开半步，而不是完全对齐。
  const [first, second] = [...rows.values()];
  assert.notEqual(Math.min(...first), Math.min(...second));

  assert.throws(() => planTilePoints(0, 100, 10, 10, 1, 1), /页面尺寸无效/);
  assert.throws(() => planTilePoints(100, 100, 0, 10, 1, 1), /文字尺寸无效/);
  assert.throws(() => planTilePoints(595, 842, 1, 1, 0, 0), /平铺数量过多/);
});

test('addWatermark 只改指定页面并输出可再次打开的 PDF', async () => {
  const input = await makePdf([[595, 842], [595, 842], [842, 595]]);
  const calls: {width: number; height: number}[] = [];
  const result = await addWatermark(input, {...WATERMARK_DEFAULTS, range: '2'}, async (request) => {
    calls.push({width: request.width, height: request.height});
    return TINY_PNG;
  });
  assert.equal(result.pageCount, 3);
  assert.equal(result.markedPages, 1);
  assert.equal(result.overlayVariants, 1);
  assert.equal(calls.length, 1);
  assert.equal(Math.round(calls[0].width), 595);

  const output = await PDFDocument.load(result.bytes, {updateMetadata: false});
  assert.equal(output.getPageCount(), 3);
  // 第 1、3 页不应出现本工具新增的图像资源；第 2 页必须有 XObject 图像。
  const hasImage = output.getPages().map((page) => {
    const resources = page.node.Resources();
    return !!resources?.has(PDFName.of('XObject'));
  });
  assert.deepEqual(hasImage, [false, true, false]);
});

test('addWatermark 相同页面尺寸只渲染一次水印图', async () => {
  const input = await makePdf([[595, 842], [595, 842]]);
  let calls = 0;
  const result = await addWatermark(input, {...WATERMARK_DEFAULTS}, async () => {
    calls++;
    return TINY_PNG;
  });
  assert.equal(result.markedPages, 2);
  assert.equal(calls, 1);
  assert.equal(result.overlayVariants, 1);
});

test('addWatermark 对非 PDF、空文件和非法页码给出中文错误', async () => {
  await assert.rejects(() => addWatermark(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), {...WATERMARK_DEFAULTS}, async () => TINY_PNG), /不是PDF|PDF/);
  const input = await makePdf([[595, 842], [595, 842]]);
  await assert.rejects(() => addWatermark(input, {...WATERMARK_DEFAULTS, range: '9'}, async () => TINY_PNG), /超出范围/);
  await assert.rejects(() => addWatermark(input, {...WATERMARK_DEFAULTS, range: 'x-y'}, async () => TINY_PNG), /格式|页码/);
  await assert.rejects(() => addWatermark(input, {...WATERMARK_DEFAULTS, text: ''}, async () => TINY_PNG), /请先输入水印文字/);
});
