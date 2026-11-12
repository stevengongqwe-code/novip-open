import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {addPageNumbers, assertPdfBytes as assertPageNumBytes} from '../src/tools/pdf-page-number-core';
import {cropPdf, assertPdfBytes as assertCropBytes} from '../src/tools/pdf-crop-core';
import {mergePdfsCore, splitPdfCore, inspectPdfSummary} from '../src/tools/pdf-merge-split-core';

async function makeSyntheticPdf(targetBytes: number, pages = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page content ${i + 1}`, {x: 40, y: 500, size: 12, font});
  }
  const base = await doc.save();
  if (base.length >= targetBytes) return base;

  // 模拟中等偏大 PDF：在文件尾部注入合规的填充注释流，不破坏结构
  const padded = new Uint8Array(targetBytes);
  padded.set(base, 0);
  padded.set(new TextEncoder().encode('\n% padding data '.padEnd(targetBytes - base.length - 1, 'x') + '\n'), base.length);
  return padded;
}

describe('大文件与小文件稳定性及边界验收', () => {
  it('小文件（<1MB）：加页码、裁剪、合并、拆分行为全部正常', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p1 = doc.addPage([400, 500]);
    p1.drawText('small test', {x: 20, y: 400, size: 12, font});
    const smallPdf = await doc.save();

    // 加页码
    const numbered = await addPageNumbers(smallPdf, {start: 1, marginMm: 10});
    assert.equal(numbered.pageCount, 1);
    assert.equal(numbered.numberedCount, 1);

    // 裁剪
    const cropped = await cropPdf(smallPdf, {top: 5, bottom: 5, left: 5, right: 5});
    assert.equal(cropped.pageCount, 1);
    assert.ok(cropped.verified);

    // 合并
    const merged = await mergePdfsCore([
      {name: 's1.pdf', bytes: smallPdf},
      {name: 's2.pdf', bytes: smallPdf},
    ]);
    assert.equal(merged.pageCount, 2);

    // 拆分
    const split = await splitPdfCore(merged.bytes, 'small_merged.pdf', [[0], [1]]);
    assert.equal(split.length, 2);
  });

  it('中等偏大文件（25MB，曾触发旧版20MB硬拦截）：加页码、裁剪、合并、拆分均顺利完成', async () => {
    // 构造约 25MB 的 PDF 文件（旧版本在 >20MB 直接 throw）
    const mediumLargeBytes = 25 * 1024 * 1024;
    const mediumPdf = await makeSyntheticPdf(mediumLargeBytes, 4);

    // 1. assertPdfBytes 正常通过
    assert.doesNotThrow(() => assertPageNumBytes(mediumPdf));
    assert.doesNotThrow(() => assertCropBytes(mediumPdf));

    // 2. inspectPdfSummary 正常解析
    const summary = await inspectPdfSummary(mediumPdf);
    assert.equal(summary.pageCount, 4);

    // 3. 加页码：分片处理，带进度，不超时
    let progressCalls = 0;
    const numbered = await addPageNumbers(
      mediumPdf,
      {start: 10, marginMm: 8},
      () => {},
      () => { progressCalls++; }
    );
    assert.equal(numbered.pageCount, 4);
    assert.equal(numbered.numberedCount, 4);
    assert.ok(progressCalls > 0, '大文件应触发进度更新');

    // 4. 裁剪：分片处理
    const cropped = await cropPdf(mediumPdf, {top: 10, bottom: 10, left: 10, right: 10});
    assert.equal(cropped.pageCount, 4);
    assert.ok(cropped.verified);

    // 5. 合并：支持大文件合并
    const merged = await mergePdfsCore([
      {name: 'large1.pdf', bytes: mediumPdf},
      {name: 'large2.pdf', bytes: mediumPdf},
    ]);
    assert.equal(merged.pageCount, 8);

    // 6. 拆分：支持大文件拆分
    const split = await splitPdfCore(mediumPdf, 'large_input.pdf', [[0, 1], [2, 3]]);
    assert.equal(split.length, 2);
    assert.equal(split[0].pages, 2);
    assert.equal(split[1].pages, 2);
  });

  it('超限文件（>100MB）：给出明确原因和下一步建议，不得白屏/静默失败', async () => {
    const tooHuge = new Uint8Array(101 * 1024 * 1024);
    tooHuge.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);

    // 加页码超限报错包含明确建议
    assert.throws(
      () => assertPageNumBytes(tooHuge),
      (err: Error) => err.message.includes('建议先压缩或拆分') && err.message.includes('MB')
    );

    // 裁剪超限报错包含明确建议
    assert.throws(
      () => assertCropBytes(tooHuge),
      (err: Error) => err.message.includes('建议先压缩或拆分') && err.message.includes('MB')
    );

    // 合并拆分超限报错
    await assert.rejects(
      () => inspectPdfSummary(tooHuge),
      (err: Error) => err.message.includes('建议先压缩') && err.message.includes('100MB')
    );
  });
});
