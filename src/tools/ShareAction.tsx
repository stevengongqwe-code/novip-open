import {useState, useRef, useEffect} from 'react';
import {tools} from './registry';
import {generateShareCopy, generateShareCardBlob, renderShareCard} from './share-core';
import {saveLocal} from '../tool-common';
import {useI18n} from '../i18n';

export function ShareToClassmates({
  toolId,
  className = '',
}: {
  toolId: string;
  className?: string;
}) {
  const {dict, lang} = useI18n();
  const isEn = lang === 'en-US';
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const tool = tools.find((t) => t.id === toolId);
  const toolName = isEn ? (dict.tools[toolId]?.name || tool?.name || 'NOVIP Tool') : (tool?.name || 'NOVIP 工具');

  // 展开预览时绘制画布
  useEffect(() => {
    if (previewOpen && canvasRef.current) {
      renderShareCard(canvasRef.current, toolId, lang);
    }
  }, [previewOpen, toolId, lang]);

  const handleCopy = async () => {
    const text = generateShareCopy(toolId, lang);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopied(true);
      setMessage(dict.common.share.copySuccessMsg);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setMessage(isEn ? 'Automatic copy failed. Please select and copy manually.' : '自动复制失败，请在弹出的卡片中手动长按复制。');
    }
  };

  const handleDownloadCard = async () => {
    try {
      setGenerating(true);
      setMessage(dict.common.share.drawingCard);
      const blob = await generateShareCardBlob(toolId, lang);
      saveLocal(blob, isEn ? `NOVIP-${toolName}-Share-Card.png` : `NOVIP-${toolName}-分享卡片.png`);
      setMessage(dict.common.share.cardSuccessMsg);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (isEn ? 'Card generation failed, please retry.' : '卡片生成失败，请重试'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSystemShare = async () => {
    if (!navigator.share) return;
    try {
      const text = generateShareCopy(toolId, lang);
      await navigator.share({
        title: `[NOVIP] ${toolName}`,
        text,
      });
      setMessage(isEn ? 'System share triggered.' : '已调起系统分享。');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessage(isEn ? 'System share failed. Please copy text above.' : '系统分享失败，可使用上方一键复制文案。');
      }
    }
  };

  return (
    <div className={`study-share-box ${className}`} role="region" aria-label={dict.common.share.title}>
      <div className="study-share-header">
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
          <span className="study-share-tag" aria-hidden="true">{dict.common.share.eyebrow}</span>
          <strong className="study-share-title">{dict.common.share.title}</strong>
          <span className="study-share-badge">{dict.common.share.badge}</span>
        </div>
        <p className="study-share-desc">
          {dict.common.share.desc}
        </p>
      </div>

      <div className="study-share-actions">
        <button
          type="button"
          className="study-btn alt study-share-btn"
          onClick={handleCopy}
          aria-label={dict.common.share.copyBtn}
        >
          {copied ? dict.common.share.copiedBtn : dict.common.share.copyBtn}
        </button>

        <button
          type="button"
          className="study-btn study-share-btn"
          onClick={handleDownloadCard}
          disabled={generating}
          aria-label={dict.common.share.downloadCardBtn}
        >
          {generating ? dict.common.share.drawingCard : dict.common.share.downloadCardBtn}
        </button>

        <button
          type="button"
          className="study-link study-share-toggle"
          onClick={() => setPreviewOpen(!previewOpen)}
          style={{fontSize: '13px'}}
        >
          {previewOpen ? dict.common.share.collapsePreview : dict.common.share.previewCard}
        </button>

        {typeof navigator !== 'undefined' && !!navigator.share && (
          <button
            type="button"
            className="study-btn alt study-share-btn"
            onClick={handleSystemShare}
            style={{fontSize: '12px', padding: '6px 12px'}}
          >
            {dict.common.share.systemShareBtn}
          </button>
        )}
      </div>

      {previewOpen && (
        <div className="study-share-preview-card" style={{marginTop: '12px'}}>
          <canvas
            ref={canvasRef}
            width={640}
            height={360}
            className="study-share-canvas"
            style={{
              width: '100%',
              maxWidth: '480px',
              height: 'auto',
              borderRadius: '8px',
              border: '1px solid #334155',
              display: 'block',
              margin: '0 auto',
            }}
          />
          <p style={{fontSize: '12px', color: '#71717a', textAlign: 'center', margin: '6px 0 0'}}>
            {dict.common.share.mobileSaveTip}
          </p>
        </div>
      )}

      {message && (
        <p className="study-share-message" role="status" style={{fontSize: '13px', margin: '8px 0 0'}}>
          {message}
        </p>
      )}
    </div>
  );
}
