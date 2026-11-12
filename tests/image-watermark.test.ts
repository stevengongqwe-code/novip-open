import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_WATERMARK_DEFAULTS,
  POSITION_LABELS,
  adaptiveUnitScale,
  buildWatermarkPreset,
  buildWatermarkedFileName,
  computeAnchorPosition,
  contrastStrokeColor,
  drawImageWatermarkOnContext,
  formatTodayDate,
  normalizeImageWatermarkOptions,
  planImageWatermarkTiles,
  resolveOutputMime,
  validateWatermarkUpload,
} from '../src/tools/image-watermark-core';

describe('image-watermark-core 单元测试', () => {
  it('按中国标准时间（UTC+8）格式化日期，跨日边界准确', () => {
    // UTC 2026-10-27 18:30 -> 北京时间 2026-10-28 02:30
    assert.equal(formatTodayDate(new Date('2026-10-27T18:30:00Z')), '2026-10-28');
    // UTC 2026-12-31 16:05 -> 北京时间 2027-01-01 00:05
    assert.equal(formatTodayDate(new Date('2026-12-31T16:05:00Z')), '2027-01-01');
  });

  it('校验并规范化水印参数，支持预设与纯 Logo 模式', () => {
    const normalized = normalizeImageWatermarkOptions({
      ...IMAGE_WATERMARK_DEFAULTS,
      text: '  仅供教资报名审核使用  ',
      subText: '2026-10-28',
      fontSize: 33.6,
      opacity: 0.246,
      rotate: -29.8,
      color: 'C9232C',
      gapX: 1.456,
      gapY: 2.044,
    });
    assert.equal(normalized.text, '仅供教资报名审核使用');
    assert.equal(normalized.subText, '2026-10-28');
    assert.equal(normalized.fontSize, 34);
    assert.equal(normalized.opacity, 0.25);
    assert.equal(normalized.rotate, -30);
    assert.equal(normalized.color, '#c9232c');
    assert.equal(normalized.gapX, 1.46);
    assert.equal(normalized.gapY, 2.04);

    // 纯 Logo 模式（无主文字、无副标题，但启用了已上传的 Logo）
    const logoOnly = normalizeImageWatermarkOptions(
      {text: '', subText: '', includeLogo: true, logoScale: 15},
      true,
    );
    assert.equal(logoOnly.includeLogo, true);
    assert.equal(logoOnly.text, '');

    // 5 套校园预设均可正常通过规范化
    for (const id of ['id-card', 'copy-verify', 'homework', 'corner-date', 'center-stamp'] as const) {
      const preset = normalizeImageWatermarkOptions(buildWatermarkPreset(id, '2026-10-28'));
      assert.ok(preset.text.length > 0);
    }
  });

  it('拒绝非法的水印文字与越界参数', () => {
    assert.throws(() => normalizeImageWatermarkOptions({text: '   ', subText: ''}, false), /请先输入水印文字/);
    assert.throws(() => normalizeImageWatermarkOptions({text: '含控制符\u0007'}), /控制字符/);
    assert.throws(() => normalizeImageWatermarkOptions({text: '水'.repeat(61)}), /最多 60 个字符/);
    assert.throws(() => normalizeImageWatermarkOptions({subText: '副'.repeat(41)}), /最多 40 个字符/);
    assert.throws(() => normalizeImageWatermarkOptions({fontSize: 8}), /字号需为/);
    assert.throws(() => normalizeImageWatermarkOptions({opacity: 0.01}), /透明度需在/);
    assert.throws(() => normalizeImageWatermarkOptions({rotate: 120}), /旋转角度需在/);
    assert.throws(() => normalizeImageWatermarkOptions({color: '#12345'}), /6 位十六进制/);
    assert.throws(() => normalizeImageWatermarkOptions({gapX: 0.2}), /水平间距系数/);
    assert.throws(() => normalizeImageWatermarkOptions({margin: 25}), /边距比例/);
    assert.throws(() => normalizeImageWatermarkOptions({logoScale: 80}), /Logo 大小比例/);
    assert.throws(() => normalizeImageWatermarkOptions({quality: 0.2}), /导出图片质量/);
  });

  it('校验批量上传文件数量、大小与像素上限', () => {
    validateWatermarkUpload([
      {name: 'id-front.jpg', size: 1024 * 500, width: 1920, height: 1080},
      {name: 'id-back.png', size: 1024 * 800, width: 4000, height: 3000},
    ]);

    assert.throws(() => validateWatermarkUpload([]), /至少选择 1 张/);
    assert.throws(
      () => validateWatermarkUpload(Array.from({length: 21}, (_, i) => ({name: `${i}.png`, size: 1024}))),
      /单次最多处理 20 张/,
    );
    assert.throws(() => validateWatermarkUpload([{name: 'empty.png', size: 0}]), /空文件/);
    assert.throws(
      () => validateWatermarkUpload([{name: 'huge.png', size: 26 * 1024 * 1024}]),
      /超过单张 25MB/,
    );
    assert.throws(
      () =>
        validateWatermarkUpload(
          Array.from({length: 5}, (_, i) => ({name: `big-${i}.png`, size: 22 * 1024 * 1024})),
        ),
      /总大小超过 100MB/,
    );
    assert.throws(
      () => validateWatermarkUpload([{name: 'wide.png', size: 1024, width: 13000, height: 1000}]),
      /单边超过 12000px/,
    );
    assert.throws(
      () => validateWatermarkUpload([{name: 'mega.png', size: 1024, width: 9000, height: 8000}]),
      /总像素超过 6400 万/,
    );
  });

  it('计算九宫格定位坐标与错位密铺点阵', () => {
    for (const pos of POSITION_LABELS) {
      const pt = computeAnchorPosition(1000, 800, 200, 80, pos.id, 4);
      assert.ok(pt.x >= 100 && pt.x <= 900, `${pos.id} x=${pt.x} 越界`);
      assert.ok(pt.y >= 40 && pt.y <= 760, `${pos.id} y=${pt.y} 越界`);
    }
    const topLeft = computeAnchorPosition(1000, 800, 200, 80, 'top-left', 5);
    const bottomRight = computeAnchorPosition(1000, 800, 200, 80, 'bottom-right', 5);
    const center = computeAnchorPosition(1000, 800, 200, 80, 'center', 5);
    assert.ok(topLeft.x < center.x && center.x < bottomRight.x);
    assert.ok(topLeft.y < center.y && center.y < bottomRight.y);

    const tiles = planImageWatermarkTiles(1200, 900, 220, 60, -30, 1.4, 2.0);
    assert.ok(tiles.length >= 6 && tiles.length <= 800);
    assert.equal(adaptiveUnitScale(2000, 1500), 1.5);
  });

  it('自动计算反色描边、输出 MIME 与防重名文件名', () => {
    const darkHalo = contrastStrokeColor('#ffffff', 0.8);
    const lightHalo = contrastStrokeColor('#c9232c', 0.25);
    assert.ok(darkHalo.startsWith('rgba(24,24,27,'), `浅色文字应配深色描边: ${darkHalo}`);
    assert.ok(lightHalo.startsWith('rgba(255,255,255,'), `深色/红色文字应配浅色描边: ${lightHalo}`);

    assert.deepEqual(resolveOutputMime('image/jpeg', 'keep'), {mime: 'image/jpeg', ext: 'jpg'});
    assert.deepEqual(resolveOutputMime('image/webp', 'keep'), {mime: 'image/webp', ext: 'webp'});
    assert.deepEqual(resolveOutputMime('image/png', 'keep'), {mime: 'image/png', ext: 'png'});
    assert.deepEqual(resolveOutputMime('image/png', 'jpeg'), {mime: 'image/jpeg', ext: 'jpg'});

    const used = new Set<string>();
    assert.equal(buildWatermarkedFileName('身份证正面.jpg', 'jpg', used), '身份证正面-加水印.jpg');
    assert.equal(buildWatermarkedFileName('身份证正面.png', 'jpg', used), '身份证正面-加水印-2.jpg');
  });

  it('在 2D 上下文上正确绘制密铺、九宫格与正中水印（含副标题与 Logo）', () => {
    const calls: string[] = [];
    const mockCtx = {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineJoin: 'round',
      textAlign: 'center',
      textBaseline: 'middle',
      globalAlpha: 1,
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      translate: () => calls.push('translate'),
      rotate: () => calls.push('rotate'),
      measureText: (txt: string) => ({width: txt.length * 18}),
      fillText: (txt: string) => calls.push(`fill:${txt}`),
      strokeText: (txt: string) => calls.push(`stroke:${txt}`),
      drawImage: () => calls.push('drawLogo'),
    } as unknown as CanvasRenderingContext2D;

    const fakeLogo = {width: 120, height: 60} as unknown as CanvasImageSource & {width: number; height: number};
    const opts = normalizeImageWatermarkOptions(
      {
        ...IMAGE_WATERMARK_DEFAULTS,
        text: '仅供报名审核使用',
        subText: '2026-10-28',
        includeLogo: true,
        layout: 'grid',
        position: 'bottom-right',
      },
      true,
    );

    const gridRes = drawImageWatermarkOnContext(mockCtx, 1000, 800, opts, fakeLogo);
    assert.equal(gridRes.stampCount, 1);
    assert.ok(calls.includes('drawLogo'), '应绘制 Logo');
    assert.ok(calls.includes('stroke:仅供报名审核使用'), '应绘制主文字描边');
    assert.ok(calls.includes('fill:仅供报名审核使用'), '应绘制主文字填充');
    assert.ok(calls.includes('fill:2026-10-28'), '应绘制副标题日期');

    const tileRes = drawImageWatermarkOnContext(
      mockCtx,
      1000,
      800,
      {...opts, layout: 'tile'},
      fakeLogo,
    );
    assert.ok(tileRes.stampCount > 4, '密铺模式应绘制多处水印');
  });
});
