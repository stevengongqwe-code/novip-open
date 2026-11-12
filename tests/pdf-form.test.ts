import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_FORM_TEMPLATES,
  generatePdfFormBlob,
  type PdfFormTemplateId,
} from '../src/tools/pdf-form-core.ts';

test('NOVIP PDF 申请表核心引擎 · 模板与预设字段完整性', () => {
  const templateIds: PdfFormTemplateId[] = ['scholarship', 'exam-defer', 'leave-approval', 'club-join'];
  for (const tid of templateIds) {
    const tpl = PDF_FORM_TEMPLATES[tid];
    assert.ok(tpl, `模板 ${tid} 必须存在`);
    assert.ok(tpl.title.length > 5, '模板标题不可过短');
    assert.ok(tpl.fields.length >= 6, `模板字段数不可少于 6 项，当前: ${tpl.fields.length}`);
    assert.ok(Object.keys(tpl.sampleData).length >= 5, '模板需提供充足的示例填充数据');
  }
});

test('NOVIP PDF 申请表核心引擎 · 真实生成标准 A4 审批 PDF', async () => {
  const blob = await generatePdfFormBlob({
    templateId: 'scholarship',
    formData: {
      name: '王小红',
      studentId: '2023091001',
      gpa: '3.95 / 4.0',
    },
    signatureDate: '2026年10月29日',
  });

  assert.ok(blob instanceof Blob, '输出应为合法 Blob');
  assert.equal(blob.type, 'application/pdf', 'MIME 类型应为 application/pdf');
  assert.ok(blob.size > 800, `生成的 PDF 体积应大于 800 字节，实际: ${blob.size} 字节`);

  // 验证 PDF 魔数标志 %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  const buffer = await blob.arrayBuffer();
  const header = new Uint8Array(buffer.slice(0, 5));
  assert.equal(header[0], 0x25); // %
  assert.equal(header[1], 0x50); // P
  assert.equal(header[2], 0x44); // D
  assert.equal(header[3], 0x46); // F
  assert.equal(header[4], 0x2d); // -
});
