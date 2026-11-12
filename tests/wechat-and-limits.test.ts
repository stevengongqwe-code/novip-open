import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {isWeChat, isIOS, isMobileDevice} from '../src/tools/wechat-core';
import {searchTools} from '../src/tools/search-core';
import {tools} from '../src/tools/registry';
import {PDF_MERGE_SPLIT_LIMITS} from '../src/tools/pdf-merge-split-core';
import {PDF_PAGE_NUMBER_LIMITS} from '../src/tools/pdf-page-number-core';
import {PDF_CROP_LIMITS} from '../src/tools/pdf-crop-core';
import {PDF_COMPRESS_LIMITS} from '../src/tools/pdf-compress-core';
import {WATERMARK_LIMITS} from '../src/tools/watermark-core';

describe('微信环境与移动端判定 (wechat-core)', () => {
  const UA_WECHAT_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x1800302b) NetType/WIFI Language/zh_CN';
  const UA_WECHAT_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S9280 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 MicroMessenger/8.0.47.2560(0x28002f51) Process/tools NetType/WIFI Language/zh_CN';
  const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const UA_CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

  it('正确识别微信 iOS 与 Android 内置浏览器', () => {
    assert.equal(isWeChat(UA_WECHAT_IOS), true);
    assert.equal(isWeChat(UA_WECHAT_ANDROID), true);
  });

  it('普通浏览器不误判为微信', () => {
    assert.equal(isWeChat(UA_SAFARI_IOS), false);
    assert.equal(isWeChat(UA_CHROME_MAC), false);
    assert.equal(isWeChat(''), false);
  });

  it('正确识别 iOS 与移动设备', () => {
    assert.equal(isIOS(UA_WECHAT_IOS), true);
    assert.equal(isIOS(UA_SAFARI_IOS), true);
    assert.equal(isIOS(UA_WECHAT_ANDROID), false);
    assert.equal(isIOS(UA_CHROME_MAC), false);

    assert.equal(isMobileDevice(UA_WECHAT_IOS), true);
    assert.equal(isMobileDevice(UA_WECHAT_ANDROID), true);
    assert.equal(isMobileDevice(UA_SAFARI_IOS), true);
    assert.equal(isMobileDevice(UA_CHROME_MAC), false);
  });
});

describe('入口一致性与搜索别名权重 (search-core & registry)', () => {
  it('搜索「合并拆分」优先且首位指向专属 pdf-merge-split 工具', () => {
    const res = searchTools('合并拆分');
    assert.ok(res.length > 0, '搜索合并拆分应有结果');
    assert.equal(res[0].id, 'pdf-merge-split', '首位必须是 PDF 合并与拆分');
    assert.equal(res[0].path, '/tools/pdf-merge-split');
  });

  it('搜索「pdf合并」「pdf拆分」「合并pdf」「拆分pdf」首位均指向专属 pdf-merge-split', () => {
    for (const q of ['pdf合并', 'pdf拆分', '合并pdf', '拆分pdf', 'pdf拼接', 'pdf提取页面', '按页拆分', 'pdf提取', 'pdf删页', '删页', '提取页']) {
      const res = searchTools(q);
      assert.ok(res.length > 0, `搜索 ${q} 应有结果`);
      assert.equal(res[0].id, 'pdf-merge-split', `搜索 ${q} 首位必须是 pdf-merge-split`);
    }
  });

  it('格式转换关键词（pdf转word、格式转换、pdf转ppt、pdf压缩）正确命中 files', () => {
    const wordRes = searchTools('pdf转word');
    assert.ok(wordRes.some(t => t.id === 'files'), 'pdf转word 应命中 files');

    const fmtRes = searchTools('格式转换');
    assert.ok(fmtRes.some(t => t.id === 'files'), '格式转换 应命中 files');

    const compRes = searchTools('pdf压缩');
    assert.ok(compRes.some(t => t.id === 'files'), 'pdf压缩 应命中 files');

    const compRes2 = searchTools('压缩pdf');
    assert.ok(compRes2.some(t => t.id === 'files'), '压缩pdf 应命中 files');
  });

  it('注册表中文案已标明 files 与 pdf-merge-split 的差异', () => {
    const filesTool = tools.find(t => t.id === 'files')!;
    const mergeSplitTool = tools.find(t => t.id === 'pdf-merge-split')!;

    assert.ok(filesTool.task.includes('大文件合并拆分建议使用专属工具') || filesTool.task.includes('专属工具'), 'files 工具文案应引导大文件使用专属工具');
    assert.ok(mergeSplitTool.name.includes('合并与拆分'));
  });
});

describe('PDF 工具真实上限常量对齐', () => {
  it('PDF 合并拆分：单文件 100MB 极限、50MB 推荐、200MB 总队列、1000 页', () => {
    assert.equal(PDF_MERGE_SPLIT_LIMITS.maxSingleBytes, 100 * 1024 * 1024);
    assert.equal(PDF_MERGE_SPLIT_LIMITS.recommendedBytes, 50 * 1024 * 1024);
    assert.equal(PDF_MERGE_SPLIT_LIMITS.maxTotalBytes, 200 * 1024 * 1024);
    assert.equal(PDF_MERGE_SPLIT_LIMITS.maxPages, 1000);
    assert.equal(PDF_MERGE_SPLIT_LIMITS.maxFiles, 50);
  });

  it('PDF 加页码：50MB 上限、500 页', () => {
    assert.equal(PDF_PAGE_NUMBER_LIMITS.maxBytes, 50 * 1024 * 1024);
    assert.equal(PDF_PAGE_NUMBER_LIMITS.maxPages, 500);
  });

  it('PDF 裁剪：50MB 上限、500 页', () => {
    assert.equal(PDF_CROP_LIMITS.maxBytes, 50 * 1024 * 1024);
    assert.equal(PDF_CROP_LIMITS.maxPages, 500);
  });

  it('PDF 加水印：50MB 上限、300 页', () => {
    assert.equal(WATERMARK_LIMITS.maxBytes, 50 * 1024 * 1024);
    assert.equal(WATERMARK_LIMITS.maxPages, 300);
  });

  it('PDF 压缩：100MB 极限、50MB 推荐、200MB 总限、200 页', () => {
    assert.equal(PDF_COMPRESS_LIMITS.maxSingleBytes, 100 * 1024 * 1024);
    assert.equal(PDF_COMPRESS_LIMITS.recommendedBytes, 50 * 1024 * 1024);
    assert.equal(PDF_COMPRESS_LIMITS.maxTotalBytes, 200 * 1024 * 1024);
    assert.equal(PDF_COMPRESS_LIMITS.maxPages, 200);
  });
});
