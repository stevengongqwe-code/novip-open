import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (container: Element) => {render: (node: unknown) => void; unmount: () => void};
let PDFDocument: typeof import('pdf-lib').PDFDocument;
let StandardFonts: typeof import('pdf-lib').StandardFonts;
let PdfCompress: () => unknown;
let dom: import('jsdom').JSDOM;

import {
  COMPRESS_TIERS,
  PDF_COMPRESS_LIMITS,
  assertPdfBytes,
  calculateSavings,
  compressPdf,
  compressedPdfName,
  formatBytes,
  inspectPdf,
  optimizePdfStructure,
} from '../src/tools/pdf-compress-core';
import {searchTools} from '../src/tools/search-core';
import {tools} from '../src/tools/registry';

const downloads: {blob: Blob; name: string}[] = [];

async function settle(ms = 80) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

async function waitFor(check: () => boolean, message: string, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (check()) return;
    await settle(50);
  }
  assert.ok(check(), message);
}

function buttonIn(root: ParentNode, text: string) {
  const found = [...root.querySelectorAll('button')].find(item => (item.textContent ?? '').includes(text));
  assert.ok(found, `找不到按钮：${text}`);
  return found as HTMLButtonElement;
}

async function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {value: [file], configurable: true});
  await act(async () => {
    input.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
  });
}

async function makePdfFile(name = '待压缩课件.pdf', pages = 2): Promise<{bytes: Uint8Array; file: File}> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page content line ${i + 1}`, {x: 40, y: 300, size: 14, font});
  }
  const bytes = await doc.save();
  const file = new dom.window.File([bytes], name, {type: 'application/pdf'}) as unknown as File;
  return {bytes, file};
}

before(async () => {
  const {JSDOM} = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
  (globalThis as Record<string, unknown>).Blob = dom.window.Blob;
  (globalThis as Record<string, unknown>).File = dom.window.File;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  Object.defineProperty(dom.window.URL, 'createObjectURL', {
    value: (blob: Blob) => {
      downloads.push({blob, name: ''});
      return `blob:fake-compress-${downloads.length}`;
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'revokeObjectURL', {value: () => undefined, configurable: true});
  (globalThis as Record<string, unknown>).URL = dom.window.URL;

  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    const anchor = this as unknown as HTMLAnchorElement;
    if (downloads.length && anchor.download) {
      downloads[downloads.length - 1].name = anchor.download;
    }
    return originalClick.call(this);
  };

  React = (await import('react')).default;
  ({act} = await import('react'));
  ({createRoot} = await import('react-dom/client'));
  ({PDFDocument, StandardFonts} = await import('pdf-lib'));
  PdfCompress = (await import('../src/tools/PdfCompress')).default;
});

after(() => {
  downloads.length = 0;
});

describe('PDF 压缩核心逻辑 (pdf-compress-core)', () => {
  it('上限常量定义合理并与产品规范对齐', () => {
    assert.equal(PDF_COMPRESS_LIMITS.recommendedBytes, 50 * 1024 * 1024);
    assert.equal(PDF_COMPRESS_LIMITS.maxSingleBytes, 100 * 1024 * 1024);
    assert.equal(PDF_COMPRESS_LIMITS.maxTotalBytes, 200 * 1024 * 1024);
    assert.equal(PDF_COMPRESS_LIMITS.maxPages, 200);
    assert.equal(PDF_COMPRESS_LIMITS.maxPixelsPerPage, 16_000_000);
  });

  it('档位定义涵盖轻度/推荐/极限与无损优化', () => {
    assert.ok(COMPRESS_TIERS.light, '应有轻度压缩');
    assert.ok(COMPRESS_TIERS.recommended, '应有推荐压缩');
    assert.ok(COMPRESS_TIERS.extreme, '应有极限压缩');
    assert.ok(COMPRESS_TIERS.lossless, '应有无损结构优化');

    assert.equal(COMPRESS_TIERS.light.isLossy, true);
    assert.equal(COMPRESS_TIERS.recommended.isLossy, true);
    assert.equal(COMPRESS_TIERS.extreme.isLossy, true);
    assert.equal(COMPRESS_TIERS.lossless.isLossy, false);

    assert.equal(COMPRESS_TIERS.light.dpi, 150);
    assert.equal(COMPRESS_TIERS.recommended.dpi, 120);
    assert.equal(COMPRESS_TIERS.extreme.dpi, 96);
  });

  it('空文件或过小文件抛出明确中文错误', () => {
    assert.throws(() => assertPdfBytes(new Uint8Array(0)), /文件为空或不是有效PDF/);
    assert.throws(() => assertPdfBytes(new Uint8Array([1, 2, 3])), /文件太小/);
  });

  it('缺少 %PDF- 头的坏文件报错', () => {
    const badBytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.throws(() => assertPdfBytes(badBytes), /缺少 %PDF- 文件头/);
  });

  it('超过 100MB 极限上限报错', () => {
    const fakeHuge = new Uint8Array(101 * 1024 * 1024);
    assert.throws(
      () => assertPdfBytes(fakeHuge),
      /超过 100MB 极限上限/
    );
  });

  it('inspectPdf 正常提取页数与字节', async () => {
    const {bytes} = await makePdfFile('test.pdf', 3);
    const summary = await inspectPdf(bytes);
    assert.equal(summary.pageCount, 3);
    assert.equal(summary.byteLength, bytes.length);
  });

  it('辅助函数：formatBytes 与 compressedPdfName 与 calculateSavings', () => {
    assert.equal(formatBytes(500), '1 KB');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1048576), '1.00 MB');
    assert.equal(formatBytes(5242880), '5.00 MB');

    assert.equal(compressedPdfName('课件.pdf'), '课件-已压缩.pdf');
    assert.equal(compressedPdfName('document'), 'document-已压缩.pdf');

    const reduced = calculateSavings(1000, 600);
    assert.equal(reduced.isSaved, true);
    assert.equal(reduced.savedBytes, 400);
    assert.equal(reduced.percent, 40);

    const grown = calculateSavings(1000, 1200);
    assert.equal(grown.isSaved, false);
    assert.equal(grown.savedBytes, 0);
    assert.equal(grown.percent, 0);
  });

  it('正常无损压缩（tier: lossless）：结构优化且可再次解析', async () => {
    const {bytes} = await makePdfFile('lossless.pdf', 2);
    const res = await compressPdf(bytes, {tier: 'lossless'});
    assert.equal(res.tier, 'lossless');
    assert.equal(res.isLossy, false);
    assert.equal(res.pageCount, 2);
    assert.ok(res.bytes instanceof Uint8Array);

    const reloaded = await PDFDocument.load(res.bytes);
    assert.equal(reloaded.getPageCount(), 2);
  });

  it('正常有损重采样压缩（注入 rasterizer）：计算节省百分比与减少体积', async () => {
    const {bytes} = await makePdfFile('lossy.pdf', 2);
    // 模拟重采样产生更小体积产物
    const smallerPdfBytes = bytes.slice(0, Math.floor(bytes.length * 0.6));
    const mockRasterizer = async () => smallerPdfBytes;

    const res = await compressPdf(bytes, {
      tier: 'recommended',
      rasterizer: mockRasterizer,
    });

    assert.equal(res.isSaved, true);
    assert.equal(res.keptOriginal, false);
    assert.ok(res.savedPercent > 0);
    assert.ok(res.bytes.length < bytes.length);
    assert.ok(res.notice.includes('成功压缩'));
  });

  it('压缩后变大时拦截并自动保留原文件', async () => {
    const {bytes} = await makePdfFile('tiny.pdf', 1);
    // 模拟重采样后体积反而膨胀
    const largerFakeBytes = new Uint8Array(bytes.length + 5000);
    largerFakeBytes.set(bytes, 0);

    const res = await compressPdf(bytes, {
      tier: 'extreme',
      rasterizer: async () => largerFakeBytes,
    });

    assert.equal(res.keptOriginal, true);
    assert.ok(res.notice.includes('自动为你保留原文件'));
    // 最终产物不能是膨胀的 largerFakeBytes
    assert.ok(res.finalBytes <= bytes.length);
  });
});

describe('PDF 压缩搜索入口与注册表集成', () => {
  it('搜索别名命中：压缩pdf、pdf压缩、pdf太大、pdf变小 首位均指向 pdf-compress', () => {
    for (const q of ['压缩pdf', 'pdf压缩', 'pdf太大', 'pdf变小']) {
      const results = searchTools(q);
      assert.ok(results.length > 0, `搜索 ${q} 应有结果`);
      assert.equal(results[0].id, 'pdf-compress', `搜索 ${q} 首位必须是 pdf-compress`);
    }
  });

  it('搜索 pdf压缩 依然包含兼容工具 files', () => {
    const res = searchTools('pdf压缩');
    assert.ok(res.some(t => t.id === 'files'), 'files 需保持命中以兼容历史习惯');
  });

  it('注册表中 pdf-compress 路径与分组正确', () => {
    const tool = tools.find(t => t.id === 'pdf-compress')!;
    assert.ok(tool, '注册表必须包含 pdf-compress');
    assert.equal(tool.path, '/tools/pdf-compress');
    assert.equal(tool.group, '文件工具');
    assert.ok(tool.name.includes('PDF 压缩'));
  });
});

describe('PDF 压缩 UI 集成测试 (PdfCompress.tsx)', () => {
  it('初始渲染：展示标题、上限提示条与 4 个档位卡片', async () => {
    downloads.length = 0;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PdfCompress as never));
    });

    assert.ok((container.textContent ?? '').includes('PDF 压缩'));
    const limitBanner = container.querySelector('.upload-limit-banner');
    assert.ok(limitBanner, '应展示文件上限提示条');
    assert.ok((limitBanner?.textContent ?? '').includes('50MB'));
    assert.ok((limitBanner?.textContent ?? '').includes('100MB'));

    // 默认展示上传拖拽区
    assert.ok((container.textContent ?? '').includes('点击选择或拖放 PDF 文件到这里'));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('坏文件选择：显示读取失败错误提示', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PdfCompress as never));
    });

    const badFile = new dom.window.File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'bad.pdf', {
      type: 'application/pdf',
    }) as unknown as File;

    await selectFile(container, badFile);
    await waitFor(
      () => (container.textContent ?? '').includes('缺少 %PDF- 文件头') || (container.textContent ?? '').includes('失败'),
      '应显示坏文件错误信息'
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('超限文件选择：拦截并显示超过 100MB 错误', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PdfCompress as never));
    });

    const oversizedFile = new dom.window.File([new Uint8Array(10)], 'huge.pdf', {
      type: 'application/pdf',
    }) as unknown as File;
    Object.defineProperty(oversizedFile, 'size', {value: 105 * 1024 * 1024});

    await selectFile(container, oversizedFile);
    await waitFor(
      () => (container.textContent ?? '').includes('超过 100MB 极限上限'),
      '应拦截超过 100MB 的文件'
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('正常压缩流程：选择文件 -> 选档位 -> 压缩 -> 下载带 -已压缩.pdf', async () => {
    downloads.length = 0;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PdfCompress as never));
    });

    const {file} = await makePdfFile('课程设计讲义.pdf', 2);
    await selectFile(container, file);

    await waitFor(
      () => (container.textContent ?? '').includes('课程设计讲义.pdf') && (container.textContent ?? '').includes('共 2 页'),
      '应正确解析并展示文件名与页数'
    );

    // 验证 4 个档位卡片均已渲染
    assert.ok((container.textContent ?? '').includes('轻度压缩'));
    assert.ok((container.textContent ?? '').includes('推荐压缩'));
    assert.ok((container.textContent ?? '').includes('极限压缩'));
    assert.ok((container.textContent ?? '').includes('结构优化'));

    // 切换到“结构优化”档位以在 jsdom 环境中无依赖执行无损优化
    const tierCards = container.querySelectorAll('.pdf-tier-card');
    const losslessCard = [...tierCards].find(c => (c.textContent ?? '').includes('结构优化')) as HTMLElement;
    assert.ok(losslessCard, '应找到结构优化卡片');
    await act(async () => {
      losslessCard.click();
    });

    // 验证有损/无损提示说明更新
    assert.ok((container.textContent ?? '').includes('100% 保留所有矢量文字'));

    // 点击“开始压缩 PDF”
    const compressBtn = buttonIn(container, '开始压缩 PDF');
    await act(async () => {
      compressBtn.click();
    });

    // 等待结果卡片出现
    await waitFor(
      () => (container.textContent ?? '').includes('压缩结果与下载'),
      '应展示结果卡片'
    );
    assert.ok((container.textContent ?? '').includes('原始大小'));
    assert.ok((container.textContent ?? '').includes('最终提供'));

    // 触发下载
    const downloadBtn = buttonIn(container, '下载');
    assert.ok(downloadBtn, '应有下载按钮');
    await act(async () => {
      downloadBtn.click();
    });

    await waitFor(() => downloads.length > 0, '应触发一次下载');
    const dl = downloads[0];
    assert.ok(dl.name.includes('已压缩') || dl.name.includes('课程设计讲义'), `下载文件名异常: ${dl.name}`);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
