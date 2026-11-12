import { useState, useRef } from 'react';
import { copyLocal } from '../tool-common';
import { MessageSquare, Check, Copy, Sparkles, QrCode, ThumbsUp, AlertCircle, Smartphone } from 'lucide-react';
import { useI18n } from '../i18n';

export default function UniversalFeedback({ toolId }: { toolId: string }) {
  const { dict, lang } = useI18n();
  const isEn = lang === 'en-US';
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<'wish' | 'bug' | 'mobile' | 'praise'>('wish');
  const [detail, setDetail] = useState('');
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
  const [showQr, setShowQr] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const categories = [
    { key: 'wish' as const, label: dict.common.feedback.catWish, icon: Sparkles },
    { key: 'bug' as const, label: dict.common.feedback.catBug, icon: AlertCircle },
    { key: 'mobile' as const, label: dict.common.feedback.catMobile, icon: Smartphone },
    { key: 'praise' as const, label: dict.common.feedback.catPraise, icon: ThumbsUp },
  ];

  const handleCopyFeedback = async () => {
    const catLabel = categories.find((c) => c.key === category)?.label || 'Feedback';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isWechat = /MicroMessenger/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isIos = /iPhone|iPad/i.test(ua);
    const dev = isWechat
      ? (isEn ? 'WeChat In-App Browser' : '微信内置浏览器')
      : isAndroid
      ? (isEn ? 'Android Device' : '安卓手机')
      : isIos
      ? (isEn ? 'Apple iPhone' : '苹果 iPhone')
      : (isEn ? 'Desktop Browser' : '电脑端');

    const text = isEn
      ? `[NOVIP User Feedback]
• Category: ${catLabel}
• Tool: ${toolId}
• Device: ${dev}
• Details: ${detail.trim() || '(No details provided)'}
• Time: ${new Date().toLocaleString('en-US')}
---------------------------------
(Send to author WeChat: StevenGRK)`
      : `【NOVIP 使用反馈】
• 反馈类别：${catLabel}
• 当前工具：${toolId}
• 使用设备：${dev}
• 详细描述：${detail.trim() || '（无具体描述）'}
• 反馈时间：${new Date().toLocaleString('zh-CN')}
---------------------------------
（发送至作者微信：StevenGRK）`;

    try {
      await copyLocal(text);
      setCopied(true);
      setMsg(isEn ? 'Feedback copied! You can send it directly to StevenGRK on WeChat.' : '已成功复制反馈文案！可直接在微信中发送给作者 StevenGRK');
      setTimeout(() => setCopied(false), 3000);
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          const Evt = window.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
          if (Evt) {
            window.dispatchEvent(
              new Evt('novip:toast', {
                detail: {
                  message: isEn ? 'Feedback copied!' : '已复制反馈，去微信发给作者吧！',
                },
              }),
            );
          }
        }
      } catch {}
    } catch {
      setMsg(isEn ? 'Clipboard unavailable. Please add WeChat: StevenGRK manually.' : '复制不可用，请手动长按微信号 StevenGRK 添加好友反馈。');
    }
  };

  return (
    <section className="novip-universal-feedback" aria-label={dict.common.feedback.dialogTitle}>
      {!isOpen ? (
        <button
          type="button"
          className="novip-feedback-trigger-bar"
          onClick={() => setIsOpen(true)}
          aria-expanded={false}
        >
          <div className="novip-feedback-trigger-left">
            <MessageSquare size={16} className="novip-icon-primary" />
            <span>{dict.common.feedback.triggerText}</span>
          </div>
          <span className="novip-feedback-trigger-cta">{dict.common.feedback.triggerCta}</span>
        </button>
      ) : (
        <div className="novip-feedback-card-body">
          <div className="novip-feedback-head">
            <div className="novip-feedback-title">
              <MessageSquare size={18} className="novip-icon-primary" />
              <h3>{dict.common.feedback.title}</h3>
            </div>
            <button
              type="button"
              className="novip-feedback-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label={dict.common.feedback.close}
            >
              {dict.common.feedback.close} ✕
            </button>
          </div>

          <p className="novip-feedback-desc">
            {dict.common.feedback.desc}
          </p>

          <div className="novip-feedback-cat-grid" role="radiogroup" aria-label={isEn ? 'Feedback Category' : '反馈类型'}>
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`novip-feedback-cat-btn ${category === c.key ? 'selected' : ''}`}
                onClick={() => setCategory(c.key)}
                aria-pressed={category === c.key}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="novip-feedback-textarea-wrap">
            <label htmlFor="novip-feedback-input" className="sr-only">
              {isEn ? 'Feedback Description' : '反馈描述'}
            </label>
            <textarea
              id="novip-feedback-input"
              rows={3}
              className="novip-feedback-textarea"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={dict.common.feedback.placeholder}
            />
          </div>

          <div className="novip-feedback-actions-row">
            <button
              type="button"
              className={`novip-btn-tactile ${copied ? 'novip-btn-tactile--success' : 'novip-btn-tactile--primary'}`}
              onClick={handleCopyFeedback}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? dict.common.feedback.copiedBtn : dict.common.feedback.copyBtn}</span>
            </button>

            <button
              type="button"
              className="novip-btn-compact"
              onClick={() => {
                setShowQr(true);
                dialogRef.current?.showModal();
              }}
            >
              <QrCode size={14} />
              <span>{dict.common.feedback.wechatBtn}</span>
            </button>

            <a
              href="/tools/wishes"
              className="novip-btn-compact"
            >
              <span>{dict.common.feedback.wishlistLink}</span>
            </a>
          </div>

          {msg && <p className="novip-feedback-msg" role="status">{msg}</p>}

          <dialog
            ref={dialogRef}
            className="author-contact__dialog"
            onClick={(e) => {
              if (e.target === e.currentTarget) dialogRef.current?.close();
            }}
          >
            <div className="author-contact__dialog-head">
              <h2>{dict.common.feedback.dialogTitle}</h2>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label={dict.common.actions.close}
              >
                {dict.common.actions.close}
              </button>
            </div>
            {showQr && (
              <img
                src="/author-wechat-qr.png"
                alt={isEn ? "Author Steven's WeChat QR code" : "作者 Steven 的微信二维码"}
                width="360"
                height="532"
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '10px auto', display: 'block' }}
              />
            )}
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>
              {dict.common.feedback.wechatId}：<strong>StevenGRK</strong>（{dict.common.feedback.wechatNote}）
            </p>
          </dialog>
        </div>
      )}
    </section>
  );
}
