import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync, zipSync} from 'fflate';
import {
  buildExtractedImageName,
  buildExtractedImagesZip,
  createSampleCoursewarePptx,
  filterExtractedImages,
  fingerprintBytes,
  inspectPptImages,
  sniffImageMeta,
} from '../src/tools/ppt-extract-core';

describe('ppt-extract-core 单元测试', () => {
  it('纯字节嗅探 PNG / JPEG / GIF / SVG 格式与像素尺寸', () => {
    // PNG 640x480
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(png.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);
    assert.deepEqual(sniffImageMeta(png, 'pic.png'), {
      format: 'png',
      mime: 'image/png',
      ext: 'png',
      width: 640,
      height: 480,
      supported: true,
    });

    // JPEG 800x600 (FF D8 + FF C0 length=11 precision=8 height=600 width=800)
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0x58, 0x03, 0x20, 0x01, 0x01, 0x11, 0x00]);
    const jpgMeta = sniffImageMeta(jpg, 'photo.jpg');
    assert.equal(jpgMeta.format, 'jpeg');
    assert.equal(jpgMeta.width, 800);
    assert.equal(jpgMeta.height, 600);
    assert.equal(jpgMeta.supported, true);

    // GIF 320x240
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
    const gifMeta = sniffImageMeta(gif, 'anim.gif');
    assert.equal(gifMeta.format, 'gif');
    assert.equal(gifMeta.width, 320);
    assert.equal(gifMeta.height, 240);

    // SVG viewBox
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768"></svg>');
    const svgMeta = sniffImageMeta(svg, 'chart.svg');
    assert.equal(svgMeta.format, 'svg');
    assert.equal(svgMeta.width, 1024);
    assert.equal(svgMeta.height, 768);
  });

  it('解析示例 PPTX：正确统计幻灯片页数、关联图片页码并识别重复校徽', () => {
    const sample = createSampleCoursewarePptx();
    const res = inspectPptImages(sample);
    assert.equal(res.slideCount, 3);
    assert.equal(res.supportedCount, 4);
    assert.equal(res.duplicateCount, 1);
    assert.equal(res.uniqueSupportedCount, 3);

    const chart = res.items.find((i) => i.fileName === 'image1.png');
    assert.ok(chart);
    assert.deepEqual(chart.slides, [1, 3], 'image1.png 应同时关联第 1 页和第 3 页');

    const badge = res.items.find((i) => i.fileName === 'logo_badge.png');
    assert.ok(badge);
    assert.deepEqual(badge.slides, [1, 2], '去重后的校徽应合并第 1 页和第 2 页的引用');

    const badgeCopy = res.items.find((i) => i.fileName === 'logo_badge_copy.png');
    assert.ok(badgeCopy);
    assert.equal(badgeCopy.isDuplicate, true);
    assert.equal(badgeCopy.duplicateOf, 'logo_badge.png');
  });

  it('按去重、最小像素与幻灯片页码筛选，并打包输出含 CSV 清单的合法 ZIP', () => {
    const sample = createSampleCoursewarePptx();
    const res = inspectPptImages(sample);

    const uniqueAll = filterExtractedImages(res.items, {deduplicate: true});
    assert.equal(uniqueAll.length, 3);

    const withDups = filterExtractedImages(res.items, {deduplicate: false});
    assert.equal(withDups.length, 4);

    // 过滤短边小于 200px 的小图标（排除 96x96 的 logo_badge.png）
    const largeOnly = filterExtractedImages(res.items, {deduplicate: true, minEdgePx: 200});
    assert.equal(largeOnly.length, 2);

    // 仅看第 2 页幻灯片
    const slide2Only = filterExtractedImages(res.items, {deduplicate: true, slideFilter: 2});
    assert.equal(slide2Only.length, 2);

    // 打包 ZIP 并解压验证
    const zipBytes = buildExtractedImagesZip(uniqueAll, '大物实验课件.pptx');
    const unzipped = unzipSync(zipBytes);
    const fileNames = Object.keys(unzipped);
    assert.ok(fileNames.includes('P01-image1.png'));
    assert.ok(fileNames.includes('P02-diagram.svg'));
    assert.ok(fileNames.includes('大物实验课件-图片提取清单.csv'));

    const csvText = new TextDecoder().decode(unzipped['大物实验课件-图片提取清单.csv']);
    assert.match(csvText, /P01-image1\.png/);
    assert.match(csvText, /第1页\/第3页/);
  });

  it('拒绝空文件、非 PPTX 与不安全路径', () => {
    assert.throws(() => inspectPptImages(new Uint8Array(0)), /有效的 \.pptx/);
    assert.throws(() => inspectPptImages(new Uint8Array([1, 2, 3, 4])), /无法解压/);
    const fakeZip = zipSync({'hello.txt': new Uint8Array([65, 66])});
    assert.throws(() => inspectPptImages(fakeZip), /缺少 presentation\.xml/);
    assert.equal(buildExtractedImageName({fileName: 'img 1.png', ext: 'png', slides: [5]} as never, 0), 'P05-img_1.png');
    assert.notEqual(fingerprintBytes(new Uint8Array([1, 2, 3])), fingerprintBytes(new Uint8Array([1, 2, 4])));
  });
});
