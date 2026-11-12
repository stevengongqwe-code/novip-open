import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {
  assertPdfHeader,
  inspectPdfSummary,
  parseSplitRanges,
  parsePageNumbers,
  parseRemovePages,
  mergePdfsCore,
  splitPdfCore,
  extractPdfPagesCore,
  removePdfPagesCore,
  formatBytes,
} from '../src/tools/pdf-merge-split-core';

async function makeTestPdf(pageCount: number, prefix: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`${prefix} page ${i + 1}`, {x: 50, y: 350, size: 14, font});
  }
  return doc.save();
}

describe('PDF合并拆分核心 · 纯函数与核心逻辑', () => {
  it('formatBytes 格式化友好', () => {
    assert.equal(formatBytes(500), '1 KB');
    assert.equal(formatBytes(1024 * 1024), '1.0 MB');
    assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
  });

  it('PDF头检查与非PDF拦截', () => {
    assert.throws(() => assertPdfHeader(new Uint8Array(5)), /为空或不是有效PDF/);
    assert.throws(() => assertPdfHeader(new TextEncoder().encode('not a valid pdf content')), /缺少 %PDF- 文件头/);
    const valid = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    assert.doesNotThrow(() => assertPdfHeader(valid));
  });

  it('拆分范围解析：留空为全页单组', () => {
    assert.deepEqual(parseSplitRanges('', 4), [[0, 1, 2, 3]]);
    assert.deepEqual(parseSplitRanges('   ', 3), [[0, 1, 2]]);
  });

  it('拆分范围解析：单组 1-3,5 与中文标点', () => {
    assert.deepEqual(parseSplitRanges('1-3,5', 5), [[0, 1, 2, 4]]);
    assert.deepEqual(parseSplitRanges('1，3、5', 5), [[0, 2, 4]]);
    assert.deepEqual(parseSplitRanges('2 - 4', 5), [[1, 2, 3]]);
  });

  it('拆分范围解析：分号分组 1-2; 3-4; 5', () => {
    assert.deepEqual(
      parseSplitRanges('1-2; 3-4; 5', 5),
      [[0, 1], [2, 3], [4]]
    );
    assert.deepEqual(
      parseSplitRanges('1-2；3,5', 5),
      [[0, 1], [2, 4]]
    );
  });

  it('拆分范围解析：非法输入友好报错', () => {
    assert.throws(() => parseSplitRanges('0', 5), /超出范围/);
    assert.throws(() => parseSplitRanges('6', 5), /超出范围/);
    assert.throws(() => parseSplitRanges('4-2', 5), /起点大于终点/);
    assert.throws(() => parseSplitRanges('abc', 5), /格式不正确/);
    assert.throws(() => parseSplitRanges('1-;2', 5), /格式不正确/);
  });

  it('合并 ≥ 2 个文件：保留顺序与总页数', async () => {
    const pdf1 = await makeTestPdf(2, 'DocA');
    const pdf2 = await makeTestPdf(3, 'DocB');

    const result = await mergePdfsCore([
      {name: 'a.pdf', bytes: pdf1},
      {name: 'b.pdf', bytes: pdf2},
    ]);

    assert.equal(result.pageCount, 5);
    const reopened = await PDFDocument.load(result.bytes);
    assert.equal(reopened.getPageCount(), 5);
  });

  it('合并过程中支持 AbortSignal 取消', async () => {
    const pdf1 = await makeTestPdf(2, 'DocA');
    const pdf2 = await makeTestPdf(3, 'DocB');
    const ac = new AbortController();
    ac.abort();

    await assert.rejects(
      () => mergePdfsCore([
        {name: 'a.pdf', bytes: pdf1},
        {name: 'b.pdf', bytes: pdf2},
      ], undefined, ac.signal),
      /合并已取消/
    );
  });

  it('拆分：范围拆分生成独立文件', async () => {
    const original = await makeTestPdf(6, 'Doc');
    const splitGroups = parseSplitRanges('1-2; 3-4; 5-6', 6);
    const results = await splitPdfCore(original, '测试文档.pdf', splitGroups);

    assert.equal(results.length, 3);
    assert.equal(results[0].pages, 2);
    assert.equal(results[1].pages, 2);
    assert.equal(results[2].pages, 2);

    const doc1 = await PDFDocument.load(results[0].bytes);
    assert.equal(doc1.getPageCount(), 2);
  });

  it('拆分：逐页拆分生成单页 PDF 集合', async () => {
    const original = await makeTestPdf(3, 'SinglePage');
    const singlePages = Array.from({length: 3}, (_, i) => [i]);
    const results = await splitPdfCore(original, '课件.pdf', singlePages);

    assert.equal(results.length, 3);
    assert.ok(results[0].name.includes('第1页'));
    assert.ok(results[1].name.includes('第2页'));
    assert.ok(results[2].name.includes('第3页'));

    for (const r of results) {
      assert.equal(r.pages, 1);
      const doc = await PDFDocument.load(r.bytes);
      assert.equal(doc.getPageCount(), 1);
    }
  });

  it('超大文件与页数合理上限保护', async () => {
    const original = await makeTestPdf(2, 'Normal');
    const summary = await inspectPdfSummary(original);
    assert.equal(summary.pageCount, 2);

    // 超过 100MB 拦截
    const over100Mb = new Uint8Array(100 * 1024 * 1024 + 1);
    over100Mb.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
    await assert.rejects(() => inspectPdfSummary(over100Mb), /超过 100MB 上限/);

    // 超过 1000 页拦截
    const manyPagesDoc = await PDFDocument.create();
    for (let i = 0; i < 1001; i++) manyPagesDoc.addPage([100, 100]);
    const manyPagesBytes = await manyPagesDoc.save();
    await assert.rejects(() => inspectPdfSummary(manyPagesBytes), /PDF页数过多.*1000/);
  });

  it('parsePageNumbers 解析页码列表并容错中文符号', () => {
    assert.deepEqual(parsePageNumbers('1-3, 5', 6), [0, 1, 2, 4]);
    assert.deepEqual(parsePageNumbers('1，3、5', 6), [0, 2, 4]);
    assert.deepEqual(parsePageNumbers('2 - 2', 5), [1]);
    assert.throws(() => parsePageNumbers('0', 5), /超出范围/);
    assert.throws(() => parsePageNumbers('7', 5), /超出范围/);
    assert.throws(() => parsePageNumbers('5-2', 5), /起点大于终点/);
    assert.throws(() => parsePageNumbers('xyz', 5), /格式不正确/);
    assert.throws(() => parsePageNumbers('', 5), /请输入要处理的页码/);
  });

  it('parseRemovePages 防误删全部页面', () => {
    const res = parseRemovePages('2, 4', 5);
    assert.deepEqual(res.removed, [1, 3]);
    assert.deepEqual(res.keep, [0, 2, 4]);

    // 删除全部页面被拒绝
    assert.throws(() => parseRemovePages('1-5', 5), /不能删除全部页面，至少保留一页/);
    assert.throws(() => parseRemovePages('1', 1), /不能删除全部页面，至少保留一页/);
  });

  it('extractPdfPagesCore 提取指定页面为独立新 PDF', async () => {
    const original = await makeTestPdf(5, 'ExtractSample');
    const result = await extractPdfPagesCore(original, '我的报告.pdf', [0, 2, 4]);

    assert.equal(result.pageCount, 3);
    assert.equal(result.name, '我的报告-已提取.pdf');
    const reopened = await PDFDocument.load(result.bytes);
    assert.equal(reopened.getPageCount(), 3);
  });

  it('removePdfPagesCore 剔除指定页面并重构新 PDF', async () => {
    const original = await makeTestPdf(5, 'RemoveSample');
    const result = await removePdfPagesCore(original, '长篇讲义.pdf', [1, 3]);

    assert.equal(result.pageCount, 3);
    assert.equal(result.removedCount, 2);
    assert.equal(result.name, '长篇讲义-已删页.pdf');
    const reopened = await PDFDocument.load(result.bytes);
    assert.equal(reopened.getPageCount(), 3);
  });

  it('removePdfPagesCore 禁止删除所有页面', async () => {
    const single = await makeTestPdf(1, 'OnePage');
    await assert.rejects(
      () => removePdfPagesCore(single, '单页文档.pdf', [0]),
      /不能删除全部页面/
    );
  });

  it('mergePdfsCore 拦截总队列超过 200MB', async () => {
    const dummyLarge = {
      name: 'large.pdf',
      bytes: new Uint8Array(201 * 1024 * 1024),
    };
    await assert.rejects(
      () => mergePdfsCore([dummyLarge]),
      /超出 200.*MB 上限/
    );
  });

  it('坏文件（损坏结构）给出友好中文错误提示', async () => {
    const corrupted = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0x00, 0xff, 0xff]);
    await assert.rejects(
      () => inspectPdfSummary(corrupted),
      /PDF读取失败：文件可能损坏或使用了不支持的结构/
    );
  });
});
