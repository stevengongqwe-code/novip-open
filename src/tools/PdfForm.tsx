import React, { useState, useRef, useEffect } from 'react';
import { ToolPage, saveLocal, useJob } from './common';
import {
  PDF_FORM_TEMPLATES,
  generatePdfFormBlob,
  type PdfFormTemplateId,
} from './pdf-form-core';
import {
  FileCheck,
  PenTool,
  Download,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

export default function PdfForm() {
  const job = useJob();
  const [templateId, setTemplateId] = useState<PdfFormTemplateId>('scholarship');
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    return { ...PDF_FORM_TEMPLATES.scholarship.sampleData };
  });

  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const template = PDF_FORM_TEMPLATES[templateId] || PDF_FORM_TEMPLATES.scholarship;

  // 切换模板
  const handleTemplateChange = (id: PdfFormTemplateId) => {
    setTemplateId(id);
    setFormData({ ...PDF_FORM_TEMPLATES[id].sampleData });
    showToast(`已载入「${PDF_FORM_TEMPLATES[id].title.slice(0, 16)}…」`);
  };

  const handleFieldChange = (key: string, val: string) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  // 签名板绘图逻辑
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d1d1f';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureDataUrl('');
    }
  };

  const handleGeneratePdf = async () => {
    job.run(
      async () => {
        const blob = await generatePdfFormBlob({
          templateId,
          formData,
          signatureDataUrl,
          signatureDate: formData.applyDate || '2026年10月',
        });
        const fileName = `${template.category}_${formData.name || '学生'}_申请表.pdf`;
        saveLocal(blob, fileName);
        return true;
      },
      () => {
        showToast('已生成标准 A4 审批 PDF 并开始下载');
      }
    );
  };

  const showToast = (message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:toast', { detail: { message } }));
    }
  };

  return (
    <ToolPage
      id="pdf-form"
      title="PDF 申请表填写与电子签名"
      description="针对评优奖学金、缓考免考、假条审批与社团竞聘，提供标准 A4 审批格式，支持在浏览器端打字填报、手写电子签字与导出打印。"
      job={job}
    >
      {/* 模板选择 Tab 栏 */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileCheck size={18} color="#0071e3" />
          <span>选择高校审批表单模板</span>
        </h3>
        <div className="pdf-scenario-grid">
          {(Object.keys(PDF_FORM_TEMPLATES) as PdfFormTemplateId[]).map(tid => {
            const tpl = PDF_FORM_TEMPLATES[tid];
            const isSelected = templateId === tid;
            return (
              <button
                key={tid}
                type="button"
                onClick={() => handleTemplateChange(tid)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: isSelected ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  background: isSelected ? 'rgba(0, 113, 227, 0.05)' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? '#0071e3' : '#1d1d1f' }}>
                    {tpl.category}
                  </span>
                  {isSelected && <CheckCircle2 size={16} color="#0071e3" />}
                </div>
                <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 4, lineHeight: 1.4 }}>
                  {tpl.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 主体布局：左侧表单填写，右侧 A4 拟真预览与手写签名板 */}
      <div className="pdf-layout-grid">
        {/* 左侧：表单各项字段输入 */}
        <section className="novip-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1d1d1f' }}>表单填报项目</h3>
            <button
              type="button"
              onClick={() => {
                setFormData({ ...template.sampleData });
                showToast('已填入示范参考数据');
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: '#0071e3',
              }}
            >
              <Sparkles size={14} />
              <span>载入示例数据</span>
            </button>
          </div>

          <div className="pdf-form-grid">
            {template.fields.map(field => {
              const span = field.gridSpan || 12;
              const val = formData[field.key] ?? field.defaultValue ?? '';
              return (
                <div key={field.key} style={{ gridColumn: `span ${span}` }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#424245', display: 'block', marginBottom: 4 }}>
                    {field.label}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      rows={4}
                      value={val}
                      placeholder={field.placeholder}
                      onChange={e => handleFieldChange(field.key, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #d2d2d7',
                        fontSize: 13,
                        lineHeight: 1.5,
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={val}
                      onChange={e => handleFieldChange(field.key, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #d2d2d7',
                        fontSize: 13,
                        background: '#fff',
                        boxSizing: 'border-box',
                      }}
                    >
                      {(field.options || []).map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={val}
                      placeholder={field.placeholder}
                      onChange={e => handleFieldChange(field.key, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #d2d2d7',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 右侧：手写签名板与实时 A4 样式预览 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 手写电子签名板 */}
          <section className="novip-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>
                <PenTool size={16} color="#0071e3" />
                <span>申请人手写签名 (Canvas 电子签字)</span>
              </div>
              <button
                type="button"
                onClick={clearSignature}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: '#d70015',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RotateCcw size={12} />
                <span>清空重签</span>
              </button>
            </div>

            <div
              style={{
                border: '1px dashed #0071e3',
                borderRadius: 12,
                background: '#fafafa',
                overflow: 'hidden',
                position: 'relative',
                touchAction: 'none',
              }}
            >
              <canvas
                ref={canvasRef}
                width={360}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ width: '100%', height: 120, display: 'block', cursor: 'crosshair' }}
              />
              {!signatureDataUrl && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#86868b',
                    fontSize: 13,
                    pointerEvents: 'none',
                  }}
                >
                  在虚线框内用鼠标或手指手写签名
                </div>
              )}
            </div>
          </section>

          {/* 实时 A4 纸张拟真卡片预览 */}
          <section
            className="novip-card"
            style={{
              padding: 20,
              background: '#fff',
              border: '1px solid #d2d2d7',
              borderRadius: 12,
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0071e3', paddingBottom: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#6e6e73' }}>{template.category} · OFFICIAL FORM</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', marginTop: 4 }}>
                {template.title}
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#424245', lineHeight: 1.6, maxHeight: 260, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div><strong>姓名：</strong>{formData.name || '—'}</div>
                <div><strong>学号：</strong>{formData.studentId || '—'}</div>
                <div><strong>院系：</strong>{formData.college || formData.clubName || '—'}</div>
                <div><strong>班级：</strong>{formData.majorClass || formData.targetDept || '—'}</div>
              </div>

              {formData.reason && (
                <div style={{ background: '#f5f5f7', padding: 8, borderRadius: 8, marginBottom: 10 }}>
                  <strong style={{ display: 'block', marginBottom: 2 }}>申请理由：</strong>
                  <div style={{ fontSize: 11, color: '#1d1d1f' }}>{formData.reason.slice(0, 100)}…</div>
                </div>
              )}

              {/* 签名展示 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6e6e73' }}>申请人手写签名：</div>
                  {signatureDataUrl ? (
                    <img src={signatureDataUrl} alt="手写签名" style={{ height: 36, marginTop: 4 }} />
                  ) : (
                    <div style={{ height: 36, fontSize: 12, color: '#86868b', lineHeight: '36px' }}>（暂未签名）</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73' }}>
                  签署日期：{formData.applyDate || '2026年10月'}
                </div>
              </div>
            </div>
          </section>

          {/* 导出按钮 */}
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={job.busy}
            style={{
              padding: '14px 24px',
              borderRadius: 14,
              border: 0,
              background: '#0071e3',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0, 113, 227, 0.3)',
            }}
          >
            <Download size={18} />
            <span>{job.busy ? '正在生成 PDF…' : '生成并下载标准 A4 审批 PDF'}</span>
          </button>
        </div>
      </div>
    </ToolPage>
  );
}
