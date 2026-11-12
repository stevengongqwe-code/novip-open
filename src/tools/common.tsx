import Brand from "../Brand";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {Feedback, StudyFooter, saveLocal, copyLocal} from "../tool-common";
import {tools} from "./registry";
import {BeginnerGuide} from "./beginner-guides";
import {isWeChat} from "./wechat-core";
import {WeChatNotice} from "./WeChatNotice";
import {ShareToClassmates} from "./ShareAction";
import {AdaptiveDialog} from "../motion/components/AdaptiveDialog";
import {TactileDropzone, formatFileSizeBadge} from "../motion/components/TactileDropzone";
import {useI18n} from "../i18n";
import "../study.css";
import "./tools.css";

export {saveLocal, copyLocal, isWeChat, WeChatNotice, ShareToClassmates, AdaptiveDialog, TactileDropzone, formatFileSizeBadge};

export function appNavigate(href: string) {
  if (typeof window !== "undefined" && window.history) {
    history.pushState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({top: 0});
  }
}

export const jsonDownload = (value: unknown, name: string) =>
  saveLocal(new Blob([JSON.stringify(value, null, 2)], {type: "application/json"}), name);

export const textDownload = (text: string, name: string) => {
  if (!text.trim()) throw new Error("结果为空，不提供空白下载。");
  saveLocal(new Blob(["\ufeff" + text], {type: "text/plain;charset=utf-8"}), name);
};

export function ProgressBar({
  value,
  max = 100,
  label = "正在处理",
  statusText,
}: {
  value?: number;
  max?: number;
  label?: string;
  statusText?: string;
}) {
  const percent = typeof value === "number" && max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : undefined;

  return (
    <div className="study-progress-container" role="status" aria-label={label}>
      <div className="study-progress-bar-wrapper">
        {percent !== undefined ? (
          <div
            className="study-progress-bar-fill"
            style={{width: `${percent}%`}}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        ) : (
          <div className="study-progress-bar-indeterminate" />
        )}
      </div>
      <div className="study-progress-info">
        <span className="study-progress-label">
          {(percent === undefined || percent < 100) && (
            <span className="study-progress-spinner" aria-hidden="true" />
          )}
          {statusText || label}
        </span>
        {percent !== undefined && <span className="study-progress-percent">{percent}%</span>}
      </div>
    </div>
  );
}

export function Skeleton({
  lines = 2,
  height,
  className = "",
}: {
  lines?: number;
  height?: string | number;
  className?: string;
}) {
  const count = Math.max(1, lines);
  return (
    <div className={`study-skeleton-group ${className}`} aria-hidden="true">
      {Array.from({length: count}).map((_, i) => (
        <div
          key={i}
          className="study-skeleton-line"
          style={{
            height: height || (i === 0 ? "16px" : "12px"),
            width: i === count - 1 && count > 1 ? "68%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function SuccessNotice({
  message,
  submessage,
}: {
  message: string;
  submessage?: string;
}) {
  return (
    <div role="status" className="study-success-notice study-message">
      <svg
        className="study-success-icon"
        viewBox="0 0 20 20"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="16 5 8 13 4 9" />
      </svg>
      <div className="study-success-body">
        <span className="study-success-title">{message}</span>
        {submessage && <span className="study-success-sub">{submessage}</span>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="study-empty-illustration-box">
      <div className="study-empty-art" aria-hidden="true">
        {icon || (
          <svg
            className="study-empty-svg"
            width="56"
            height="56"
            viewBox="0 0 56 56"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 44V12a4 4 0 0 1 4-4h18l10 10v26a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" />
            <path d="M34 8v10h10" />
            <line x1="20" y1="26" x2="36" y2="26" strokeDasharray="1 1" />
            <line x1="20" y1="32" x2="30" y2="32" strokeDasharray="1 1" />
            <circle cx="41" cy="41" r="7" className="study-empty-spark-bg" />
            <path d="M41 37v8M37 41h8" />
          </svg>
        )}
      </div>
      <h3 className="study-empty-heading">{title}</h3>
      {description && <p className="study-empty-text">{description}</p>}
      {action && <div className="study-empty-action">{action}</div>}
    </div>
  );
}

export function ActionableError({
  error,
  suggestions,
  onRetry,
}: {
  error: string;
  suggestions?: string[];
  onRetry?: () => void;
}) {
  const { t, lang } = useI18n();
  const isEn = lang === 'en-US';
  const defaultSuggestions = isEn
    ? [
        "If the file is large (>50MB), try compressing it first before processing.",
        "Ensure the document or image format is valid and not password-protected.",
        "If restricted inside WeChat, tap top-right '...' and open in system browser.",
      ]
    : [
        "若文件偏大（超过 50MB），可先使用「文件转换」基础压缩后再试。",
        "确认文档或图片格式有效，且未设置打开密码保护。",
        "若在微信内打开受限，可点击右上角「···」复制链接到系统浏览器。",
      ];
  const list = suggestions && suggestions.length ? suggestions : defaultSuggestions;

  return (
    <div role="alert" className="study-error study-actionable-error">
      <div className="study-error-title-row">
        <span className="study-error-icon" aria-hidden="true">⚠️</span>
        <strong>{error}</strong>
      </div>
      <div className="study-error-advice">
        <span className="study-error-advice-tag">{t('common.workbench.adviceTitle')}</span>
        <ul className="study-error-advice-list">
          {list.map((s, idx) => (
            <li key={idx}>{s}</li>
          ))}
        </ul>
      </div>
      {onRetry && (
        <div style={{marginTop: "10px"}}>
          <button type="button" className="study-btn alt" onClick={onRetry} style={{minHeight: "36px", padding: "6px 14px", fontSize: "12px"}}>
            {t('common.actions.retry')}
          </button>
        </div>
      )}
    </div>
  );
}

export function useJob() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const generation = useRef(0),
    lock = useRef(false);

  useEffect(() => () => {
    generation.current++;
  }, []);

  return {
    busy,
    error,
    status,
    setError,
    setStatus,
    reset() {
      generation.current++;
      lock.current = false;
      setBusy(false);
      setError("");
      setStatus("");
    },
    async run<T>(action: (check: () => void) => Promise<T>, done: (v: T) => void) {
      if (lock.current) return;
      lock.current = true;
      const gen = ++generation.current;
      setBusy(true);
      setError("");
      setStatus("正在本机处理…");
      const check = () => {
        if (gen !== generation.current) throw new Error("已取消。");
      };
      try {
        const result = await action(check);
        check();
        done(result);
        setStatus("处理完成，请核对结果再下载。");
      } catch (e) {
        if (gen === generation.current) {
          setError(e instanceof Error ? e.message : "处理失败，请检查输入。");
          setStatus("");
        }
      } finally {
        if (gen === generation.current) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
  };
}

export function ToolPage({
  title,
  description,
  children,
  job,
  id,
  privacy,
}: {
  title: string;
  description: string;
  children: ReactNode;
  job?: ReturnType<typeof useJob>;
  id: string;
  privacy?: string;
}) {
  const { t, dict, lang } = useI18n();
  const meta = tools.find((t) => t.id === id);
  const localizedMeta = dict.tools[id];
  const displayTitle = lang === 'en-US' ? (localizedMeta?.name || title) : (title || localizedMeta?.name || meta?.name);
  const displayDesc = lang === 'en-US' ? (localizedMeta?.task || description) : (description || localizedMeta?.task || meta?.task);
  const displayGroup = lang === 'en-US' ? (localizedMeta?.group || meta?.group) : (meta?.group || localizedMeta?.group);

  return (
    <div className={`study-app${id === "home" ? " is-apple-home" : ""}`}>
      <header className="study-header">
        <Brand />
        <span>{t('common.brandFreeBadge')}</span>
      </header>
      <main className={`tool-main${id === "home" ? " tool-main--home" : ""}`}>
        {id !== "home" && (
          <div className="novip-workbench-bar">
            <div className="novip-workbench-crumbs">
              <a className="novip-workbench-back" href="/">{t('common.workbench.backToLibrary')}</a>
              {displayGroup && <span className="novip-workbench-group">/ {displayGroup}</span>}
            </div>
            <span className="novip-workbench-trust">
              <i className="novip-workbench-dot" aria-hidden="true" />
              {t('common.workbench.trustBadge')}
            </span>
          </div>
        )}

        {id !== "home" && <h1>{displayTitle}</h1>}
        {id === "home" ? null : <BeginnerGuide id={id} technicalDescription={displayDesc} />}

        {job?.busy && (
          <div className="tool-job-busy" style={{margin: "14px 0"}}>
            <ProgressBar label={t('common.status.processing')} statusText={job.status || t('common.status.processing')} />
            <Skeleton lines={2} />
          </div>
        )}

        {job?.status && !job?.busy && !job?.error && (
          <>
            <SuccessNotice message={job.status} />
            {id !== "home" && (
              <div style={{margin: "12px 0"}}>
                <ShareToClassmates toolId={id} />
              </div>
            )}
          </>
        )}

        {job?.error && (
          <ActionableError error={job.error} />
        )}

        {children}

        <p className="study-note">
          {privacy ?? t('common.workbench.privacyNote')}
        </p>
        {id !== "home" && <Feedback tool={id} />}
      </main>
      <StudyFooter note={privacy ? t('common.workbench.timetablePrivacy') : undefined} />
    </div>
  );
}

export function Table({rows}: {rows: unknown[][]}) {
  return (
    <div className="study-table-wrap" tabIndex={0}>
      <table>
        <tbody>
          {rows.slice(0, 101).map((r, i) => (
            <tr key={i}>
              {r.map((v, j) =>
                i === 0 ? (
                  <th key={j}>{String(v ?? "")}</th>
                ) : (
                  <td key={j}>{String(v ?? "")}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
