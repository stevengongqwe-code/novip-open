import Brand from './Brand';
import {useState, type ReactNode} from 'react';
import {recordRealGraphAction} from './tools/x-recommend';
import {useI18n} from './i18n';

function getCurrentLang(): 'zh-CN' | 'en-US' {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'en-US') {
    return 'en-US';
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('novip-locale');
      if (stored === 'en-US') return 'en-US';
    } catch {}
  }
  return 'zh-CN';
}

export function saveLocal(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  const t = setTimeout(() => URL.revokeObjectURL(url), 60000);
  (t as {unref?: () => void}).unref?.();

  if (typeof window !== 'undefined') {
    const toolMatch = window.location.pathname.replace(/^\/tools\//, '').split('/')[0];
    if (toolMatch) recordRealGraphAction(toolMatch, 'save');
    if (typeof window.dispatchEvent === 'function') {
      try {
        const Evt = window.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if (Evt) {
          const isEn = getCurrentLang() === 'en-US';
          window.dispatchEvent(new Evt('novip:download', {detail: {name, type: blob.type || '', size: blob.size || 0}}));
          window.dispatchEvent(
            new Evt('novip:toast', {
              detail: {
                message: isEn ? `Started saving: ${name}` : `已开始保存：${name}`,
                type: 'download',
              },
            }),
          );
        }
      } catch {
        /* Safe ignore in headless/jsdom */
      }
    }
  }
}

export async function copyLocal(text: string) {
  const isEn = getCurrentLang() === 'en-US';
  const notify = () => {
    if (typeof window !== 'undefined') {
      const toolMatch = window.location.pathname.replace(/^\/tools\//, '').split('/')[0];
      if (toolMatch) recordRealGraphAction(toolMatch, 'copy');
      if (typeof window.dispatchEvent === 'function') {
        try {
          const Evt = window.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
          if (Evt) {
            window.dispatchEvent(
              new Evt('novip:toast', {
                detail: {
                  message: isEn ? 'Successfully copied to clipboard' : '已成功复制到剪贴板',
                  type: 'success',
                },
              }),
            );
          }
        } catch {
          /* Safe ignore */
        }
      }
    }
  };

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      notify();
      return;
    } catch {
      /* Fall through to textarea fallback for WeChat WebView. */
    }
  }

  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.append(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) {
        notify();
        return;
      }
    } catch {
      /* Ignore and throw standard message below. */
    }
  }

  throw new Error(
    isEn
      ? 'Browser denied clipboard access. Please select text to copy manually.'
      : '浏览器未允许自动复制，请选中结果手动复制。',
  );
}

export function ToolHeader({label, children}: {label: string; children: ReactNode}) {
  const {dict} = useI18n();
  return (
    <>
      <header className="study-header">
        <Brand />
        <span className="study-free">{dict.common.brandFreeBadge}</span>
      </header>
      <main className="study-main">
        <div className="study-intro">
          <span className="study-eyebrow">NOVIP / STUDY TOOLS</span>
          <h1>{label}</h1>
          {children}
        </div>
      </main>
    </>
  );
}

export function Feedback({tool}: {tool: string}) {
  const {dict, lang} = useI18n();
  const isEn = lang === 'en-US';
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(isEn ? 'Failed' : '失败');
  const [kind, setKind] = useState(isEn ? 'Cannot complete' : '无法完成');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');

  const report = JSON.stringify(
    {
      tool,
      version: '2.1.0',
      date: new Date().toISOString().slice(0, 10),
      result: state,
      problem: kind,
      errorCode: code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
      outputOpenedAndChecked: verified,
      device: /Android/i.test(navigator.userAgent)
        ? isEn ? 'Android' : '安卓'
        : /Mobile/i.test(navigator.userAgent)
        ? isEn ? 'Other Mobile' : '其他手机'
        : isEn ? 'Desktop' : '电脑',
    },
    null,
    2,
  );

  const stateOptions = isEn
    ? ['Failed', 'Completed independently', 'Completed with help', 'Aborted']
    : ['失败', '独立完成', '经协助完成', '放弃'];

  const kindOptions = isEn
    ? ['Cannot complete', 'Rule question', 'Parsing verification needed', 'Data mismatch', 'Mobile issue', 'No issue found']
    : ['无法完成', '规则疑问', '解析需确认', '数据不一致', '手机操作', '未发现问题'];

  return (
    <section className="study-feedback">
      <button className="study-link" onClick={() => setOpen(!open)}>
        {isEn ? 'Complete task / Report issue' : '完成任务 / 反馈问题'} <span aria-hidden="true">↗</span>
      </button>
      {open && (
        <div className="study-feedback-body">
          <h2>{isEn ? 'Record this usage' : '记录这次使用'}</h2>
          <p>
            <a href="/tools/wishes">
              {isEn ? 'Suggest a new feature / Hit a paywall?' : '建议新功能 / 又遇到付费墙了吗？'}
            </a>
          </p>
          <p>
            {isEn
              ? 'Only records your explicitly selected feedback without personal files or document names. Not auto-uploaded or stored. You can download or copy it to send to the developer.'
              : '只生成你主动选择的反馈，不含文献、名单或文件名。不自动上传，也不在浏览器持久保存。下载或复制后可自行发给网站提供者；这里不会自动送达。'}
          </p>
          <div className="study-fields">
            <label>
              {isEn ? 'Task Result' : '任务结果'}
              <select value={state} onChange={(e) => setState(e.target.value)}>
                {stateOptions.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label>
              {isEn ? 'Problem Type' : '问题类型'}
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {kindOptions.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label>
              {isEn ? 'Error Code / Rule ID (Optional)' : '错误码 / 规则ID（可选）'}
              <input
                value={code}
                maxLength={32}
                onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder={isEn ? 'e.g. R06, no private info' : '如 R06，不填私人内容'}
              />
            </label>
          </div>
          <label className="study-check">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            {isEn ? 'I have opened output and verified essential content' : '我已打开输出并核对关键内容'}
          </label>
          <pre>{report}</pre>
          <div className="study-actions">
            <button
              className="study-btn"
              onClick={() =>
                saveLocal(
                  new Blob([report], {type: 'application/json'}),
                  isEn ? 'NOVIP-Anonymous-Feedback.json' : 'NOVIP-匿名反馈.json',
                )
              }
            >
              {isEn ? 'Download Feedback' : '下载反馈记录'}
            </button>
            <button
              className="study-btn alt"
              onClick={async () => {
                try {
                  await copyLocal(report);
                  setMessage(isEn ? 'Copied. Please send manually; not uploaded.' : '已复制。请自行发送；本页未上传。');
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              {isEn ? 'Copy Feedback' : '复制反馈'}
            </button>
            {!!navigator.share && (
              <button
                className="study-btn alt"
                onClick={async () => {
                  try {
                    await navigator.share({
                      title: isEn ? 'NOVIP Tool Feedback' : 'NOVIP工具反馈',
                      text: report,
                    });
                    setMessage(
                      isEn
                        ? 'System share invoked. Please check recipient.'
                        : '已调用系统分享，请确认你选择的接收方。本页没有反馈服务器。',
                    );
                  } catch (e) {
                    setMessage(
                      (e as Error).name === 'AbortError'
                        ? isEn ? 'Share canceled.' : '已取消分享。'
                        : isEn ? 'Share failed, you can copy or download feedback.' : '分享失败，可复制或下载反馈。',
                    );
                  }
                }}
              >
                {isEn ? 'System Share Feedback' : '系统分享反馈'}
              </button>
            )}
          </div>
          <p role="status">{message}</p>
        </div>
      )}
    </section>
  );
}

export function StudyFooter({note}: {note?: string} = {}) {
  const {dict, lang} = useI18n();
  const defaultNote =
    lang === 'en-US'
      ? 'Files and data are processed solely in the current browser and will clear on reload.'
      : '文件与内容只在当前浏览器处理，刷新会清空';

  return (
    <footer className="study-footer">
      <span>{note ?? defaultNote}</span>
      <a href="/third-party-notices.txt" target="_blank" rel="noreferrer">
        {dict.common.footer.openSourceLicense}
      </a>
    </footer>
  );
}
