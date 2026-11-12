import React, { useState, useEffect, useRef } from 'react';
import { ToolPage, saveLocal, useJob } from './common';
import mermaid from 'mermaid';
import {
  FLOWCHART_TEMPLATES,
  validateMermaidCode,
  getMermaidConfig,
  type FlowchartTheme,
  type FlowchartTemplateId,
} from './flowchart-core';
import {
  GitFork,
  Download,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Code,
  Sparkles,
  Palette,
  CheckCircle2,
} from 'lucide-react';

export default function Flowchart() {
  const job = useJob();
  const [templateId, setTemplateId] = useState<FlowchartTemplateId>('auth-flow');
  const [code, setCode] = useState<string>(() => FLOWCHART_TEMPLATES['auth-flow'].code);
  const [theme, setTheme] = useState<FlowchartTheme>('apple-blue');
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [renderError, setRenderError] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1.0);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // 初始化与重绘 Mermaid
  useEffect(() => {
    let active = true;
    const renderDiagram = async () => {
      const check = validateMermaidCode(code);
      if (!check.valid) {
        setRenderError(check.error || '语法错误');
        return;
      }

      try {
        mermaid.initialize(getMermaidConfig(theme));
        const id = 'mermaid-svg-' + Math.random().toString(36).slice(2, 9);
        const { svg } = await mermaid.render(id, code);
        if (active) {
          setSvgHtml(svg);
          setRenderError('');
        }
      } catch (err) {
        if (active) {
          setRenderError(err instanceof Error ? err.message : 'Mermaid 渲染异常，请检查语法');
        }
      }
    };

    renderDiagram();
    return () => {
      active = false;
    };
  }, [code, theme]);

  const handleTemplateChange = (id: FlowchartTemplateId) => {
    setTemplateId(id);
    setCode(FLOWCHART_TEMPLATES[id].code);
    showToast(`已载入「${FLOWCHART_TEMPLATES[id].name}」`);
  };

  const handleInsertSnippet = (snippet: string) => {
    setCode(prev => prev + '\n' + snippet);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      showToast('已复制 Mermaid 代码到剪贴板');
    });
  };

  const handleExportSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const name = `${FLOWCHART_TEMPLATES[templateId]?.name || 'flowchart'}.svg`;
    saveLocal(blob, name);
    showToast('已导出高清矢量 SVG 文件（直接插入 Word / LaTeX 不失真）');
  };

  const handleExportPng = () => {
    if (!svgHtml) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgHtml, 'image/svg+xml');
    const svgElem = doc.querySelector('svg');
    if (!svgElem) return;

    const viewBox = svgElem.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
    const width = viewBox ? viewBox[2] : parseInt(svgElem.getAttribute('width') || '800');
    const height = viewBox ? viewBox[3] : parseInt(svgElem.getAttribute('height') || '600');

    const canvas = document.createElement('canvas');
    const scale = 2.0; // 2x Retina
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘制纯白背景
    ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const svgBlob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return;
        const name = `${FLOWCHART_TEMPLATES[templateId]?.name || 'flowchart'}_2x.png`;
        saveLocal(blob, name);
        showToast('已导出 2x 高清 PNG 图片');
      }, 'image/png');
    };
    img.src = url;
  };

  const showToast = (message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:toast', { detail: { message } }));
    }
  };

  return (
    <ToolPage
      id="flowchart"
      title="流程图与架构图制作 (Mermaid)"
      description="基于 Mermaid 语法引擎，在线绘制系统业务流程图、算法分治图、TCP 时序图与数据库 ER 图，支持实时预览与高清矢量 SVG / PNG 导出。"
      job={job}
    >
      {/* 预设模板导航 */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitFork size={18} color="#0071e3" />
          <span>选择大学生学术与工程预设图表</span>
        </h3>
        <div className="flowchart-scenario-grid">
          {(Object.keys(FLOWCHART_TEMPLATES) as FlowchartTemplateId[]).map(tid => {
            const tpl = FLOWCHART_TEMPLATES[tid];
            const isSelected = templateId === tid;
            return (
              <button
                key={tid}
                type="button"
                onClick={() => handleTemplateChange(tid)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: isSelected ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  background: isSelected ? 'rgba(0, 113, 227, 0.05)' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#0071e3' : '#1d1d1f' }}>
                  {tpl.name}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 3 }}>
                  {tpl.category}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 主工作区：左侧代码编辑器，右侧实时矢量预览 */}
      <div className="flowchart-layout-grid">
        {/* 左侧代码编辑区 */}
        <section className="novip-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>
              <Code size={16} color="#0071e3" />
              <span>Mermaid 代码</span>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              style={{
                border: 0,
                background: 'transparent',
                color: '#0071e3',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Copy size={12} />
              <span>复制代码</span>
            </button>
          </div>

          {/* 语法快捷插入工具条 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              { label: '判断框 { }', code: 'Judge{判断条件}' },
              { label: '流程框 [ ]', code: 'Step[处理步骤]' },
              { label: '圆角框 ( )', code: 'Rounded(圆角提示)' },
              { label: '连接线 -->', code: 'A --> B' },
              { label: '子图 subgraph', code: 'subgraph Group [分组名称]\n    NodeA\nend' },
            ].map(snippet => (
              <button
                key={snippet.label}
                type="button"
                onClick={() => handleInsertSnippet(snippet.code)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: 11,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                + {snippet.label}
              </button>
            ))}
          </div>

          <textarea
            rows={18}
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 10,
              border: renderError ? '1px solid #d70015' : '1px solid #d2d2d7',
              fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
              fontSize: 12.5,
              lineHeight: 1.5,
              background: '#fafafa',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />

          {renderError && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#fff0f0', color: '#d70015', fontSize: 12 }}>
              ⚠️ {renderError}
            </div>
          )}
        </section>

        {/* 右侧实时 SVG 预览与缩放区 */}
        <section className="novip-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            {/* 主题选择 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Palette size={16} color="#6e6e73" />
              {(['apple-blue', 'dark', 'neutral', 'forest'] as FlowchartTheme[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: theme === t ? '2px solid #0071e3' : '1px solid #e2e8f0',
                    background: theme === t ? '#0071e3' : '#fff',
                    color: theme === t ? '#fff' : '#1d1d1f',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t === 'apple-blue' ? 'Cupertino' : t === 'dark' ? '深色' : t === 'neutral' ? '学术灰' : '森林绿'}
                </button>
              ))}
            </div>

            {/* 缩放按钮 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
                title="缩小"
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: 12, minWidth: 42, textAlign: 'center', color: '#6e6e73' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
                title="放大"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1.0)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
                title="还原 100%"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* SVG 渲染画布容器 */}
          <div
            ref={previewRef}
            style={{
              minHeight: 380,
              maxHeight: 520,
              overflow: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              background: theme === 'dark' ? '#0f172a' : '#ffffff',
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {svgHtml ? (
              <div
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            ) : (
              <div style={{ color: '#86868b', fontSize: 13 }}>正在渲染图表…</div>
            )}
          </div>

          {/* 导出按钮栏 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              type="button"
              onClick={handleExportSvg}
              disabled={!svgHtml}
              style={{
                flex: 1,
                padding: '11px 16px',
                borderRadius: 12,
                border: '1px solid #0071e3',
                background: '#0071e3',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(0, 113, 227, 0.25)',
              }}
            >
              <Download size={16} />
              <span>导出矢量 SVG (论文免失真)</span>
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              disabled={!svgHtml}
              style={{
                flex: 1,
                padding: '11px 16px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#1d1d1f',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Download size={16} />
              <span>导出 2x PNG (PPT/微信)</span>
            </button>
          </div>
        </section>
      </div>
    </ToolPage>
  );
}
