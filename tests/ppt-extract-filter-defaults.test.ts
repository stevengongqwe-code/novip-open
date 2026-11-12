import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createSampleCoursewarePptx,
  filterExtractedImages,
  inspectPptImages,
  PPT_EXTRACT_FILTER_DEFAULTS,
  type ExtractedPptMedia,
} from '../src/tools/ppt-extract-core';

// PPT 图片提取筛选默认值契约：
// PPT_EXTRACT_FILTER_DEFAULTS 是 PptExtract.tsx 筛选控件的初始值与重置值，
// 也是 filterExtractedImages 的缺省行为口径。注意实现细节：filterExtractedImages
// 只从该常量读取 deduplicate 一项，minEdgePx/minBytes/slideFilter 的回落用的是
// 字面量 0/0/'all'——本文件用“无参调用 ≡ 传入默认值 ≡ 传入 {}”锁定两者不得漂移。
describe('ppt-extract-core 筛选默认值契约', () => {
  it('字面值逐项锁定：去重开、最小边长 0、最小字节 0、全部幻灯片', () => {
    assert.deepEqual(PPT_EXTRACT_FILTER_DEFAULTS, {
      deduplicate: true,
      minEdgePx: 0,
      minBytes: 0,
      slideFilter: 'all',
    });
  });

  it('键恰好 4 个，无多余键', () => {
    assert.deepEqual(Object.keys(PPT_EXTRACT_FILTER_DEFAULTS).sort(), [
      'deduplicate',
      'minBytes',
      'minEdgePx',
      'slideFilter',
    ]);
  });

  it('取值域：去重为布尔、边长与字节为非负整数、页码筛选为 all', () => {
    assert.equal(typeof PPT_EXTRACT_FILTER_DEFAULTS.deduplicate, 'boolean');
    assert.equal(Number.isInteger(PPT_EXTRACT_FILTER_DEFAULTS.minEdgePx), true);
    assert.equal(Number.isInteger(PPT_EXTRACT_FILTER_DEFAULTS.minBytes), true);
    assert.ok(PPT_EXTRACT_FILTER_DEFAULTS.minEdgePx >= 0);
    assert.ok(PPT_EXTRACT_FILTER_DEFAULTS.minBytes >= 0);
    assert.equal(PPT_EXTRACT_FILTER_DEFAULTS.slideFilter, 'all');
  });

  it('默认即“不过滤”：去重后保留全部 3 张唯一支持图片，排除重复副本', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const out = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS});
    assert.deepEqual(
      out.map((item) => item.fileName),
      ['image1.png', 'logo_badge.png', 'diagram.svg'],
    );
  });

  it('无参调用与传入默认值结果一致', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const noOpts = filterExtractedImages(res.items);
    const withDefaults = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS});
    assert.deepEqual(
      noOpts.map((item) => item.id),
      withDefaults.map((item) => item.id),
    );
  });

  it('传入空对象与传入默认值结果一致（锁定函数内字面回落与常量不漂移）', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const empty = filterExtractedImages(res.items, {});
    const withDefaults = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS});
    assert.deepEqual(
      empty.map((item) => item.id),
      withDefaults.map((item) => item.id),
    );
  });

  it('默认值不被筛选调用改动', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const before = JSON.stringify(PPT_EXTRACT_FILTER_DEFAULTS);
    filterExtractedImages(res.items, PPT_EXTRACT_FILTER_DEFAULTS);
    assert.equal(JSON.stringify(PPT_EXTRACT_FILTER_DEFAULTS), before);
  });

  it('去重开关覆盖默认：deduplicate=false 时重复副本回到结果', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const out = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, deduplicate: false});
    assert.equal(out.length, 4);
    assert.ok(out.some((item) => item.fileName === 'logo_badge_copy.png'));
  });

  it('最小边长边界：96px 恰好通过、97px 排除两张 96px 校徽', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const at96 = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, minEdgePx: 96});
    assert.equal(at96.length, 3);
    const at97 = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, minEdgePx: 97});
    assert.deepEqual(
      at97.map((item) => item.fileName),
      ['image1.png', 'diagram.svg'],
    );
  });

  it('最小字节边界：233B 恰好通过、234B 排除两张 233B 校徽', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const at233 = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, minBytes: 233});
    assert.equal(at233.length, 3);
    const at234 = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, minBytes: 234});
    assert.deepEqual(
      at234.map((item) => item.fileName),
      ['image1.png', 'diagram.svg'],
    );
  });

  it('零宽高图片不受最小边长过滤（宽高守卫）', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const zeroDim: ExtractedPptMedia = {
      ...res.items[0],
      id: 'x-zero',
      fileName: 'nodim.png',
      width: 0,
      height: 0,
      isDuplicate: false,
    };
    const out = filterExtractedImages([zeroDim], {...PPT_EXTRACT_FILTER_DEFAULTS, minEdgePx: 200});
    assert.deepEqual(
      out.map((item) => item.fileName),
      ['nodim.png'],
    );
  });

  it('不支持格式的图片在默认条件下仍被排除', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const unsupported: ExtractedPptMedia = {
      ...res.items[0],
      id: 'x-unsupported',
      fileName: 'broken.bin',
      supported: false,
    };
    assert.equal(filterExtractedImages([unsupported], {...PPT_EXTRACT_FILTER_DEFAULTS}).length, 0);
  });

  it('页码筛选覆盖默认：第 2 页两张、不存在的第 99 页零张、all 全量', () => {
    const res = inspectPptImages(createSampleCoursewarePptx());
    const slide2 = filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, slideFilter: 2});
    assert.deepEqual(
      slide2.map((item) => item.fileName),
      ['logo_badge.png', 'diagram.svg'],
    );
    assert.equal(
      filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, slideFilter: 99}).length,
      0,
    );
    assert.equal(
      filterExtractedImages(res.items, {...PPT_EXTRACT_FILTER_DEFAULTS, slideFilter: 'all'}).length,
      3,
    );
  });

  it('空列表在默认条件下返回空列表', () => {
    assert.deepEqual(filterExtractedImages([], {...PPT_EXTRACT_FILTER_DEFAULTS}), []);
    assert.deepEqual(filterExtractedImages([]), []);
  });
});
