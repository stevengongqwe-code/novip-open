/**
 * NOVIP 验证门户（/verify）—— 页面 UI 层。
 *
 * 定位（站主 2026-10-31 澄清后）：本页是**给 macOS 上的 Claude 桌面应用做体检的门户**。
 * 站主不会开终端、不会看日志，所以三步点完就要能看懂结论：
 *   第一步：把桌面上生成的 claude-check.json 拖进本页（浏览器无法直接读本机应用，必须靠这个文件）；
 *   第二步：本页自己跑一遍「浏览器本地能力」体检（这组是页面能真实测的）；
 *   第三步：复制 / 下载一份中文报告，贴给维护者。
 *
 * 分工：所有判断逻辑都在 src/lib/verify-portal-core.ts（纯函数，可被 node 单测覆盖）；
 * 本文件只负责展示、拖放、进度、导出与兜底，不重复实现任何检查规则。
 *
 * 安全与边界：只读取站主主动拖入的这一份 JSON 的文字内容、不上传任何东西、不发任何网络请求；
 * 结果只存在页面内存里，刷新即清空。
 */
import {useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  FileUp,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  XCircle,
} from 'lucide-react';
import {ToolPage, saveLocal} from './common';
import {
  CATEGORY_LABELS,
  STATUS_TEXT,
  defaultCapabilityProbes,
  parseLocalCheckReport,
  renderMarkdownReport,
  runVerification,
  summarize,
  type LocalCheckReport,
  type VerifyItem,
  type VerifyReport,
  type VerifyStatus,
  type VerifyVerdict,
} from '../lib/verify-portal-core';
import './verify-portal.css';

const VERIFY_TOOL_ID = 'verify';

/** 本机体检脚本的下载地址（文件由发布流程放进 public/downloads/，页面只负责给链接） */
const CHECK_SCRIPT_URL = '/downloads/claude-check.command';

/**
 * 账号验证项的 id 匹配器。
 * 注意：核心层 localCheckItems() 会把 id 规范成 `local:<原始id>` 前缀，
 * 所以这里用「去掉 local: 前缀后是否等于该 id」判断，而不是字符串全等。
 */
const ACCOUNT_VERIFY_ID = 'account_verify_required';
const isAccountVerifyItem = (item: VerifyItem): boolean =>
  item.id.replace(/^local:/, '') === ACCOUNT_VERIFY_ID;

/**
 * 结论标题：按 fail 项自动判断，不写死「不是应用坏了」。
 * - 有 fail 且其中包含 account_verify_required → 账号侧问题，需要站主本人处理；
 * - 其余 fail → 应用/环境侧问题，请把报告发出来；
 * - 只有 warn → 可以正常使用但值得留意；全部通过 → 正常。
 */
function verdictHeadline(verdict: VerifyVerdict, fails: VerifyItem[], warns: VerifyItem[] = []): string {
  if (verdict === 'ready') return '✅ Claude 应用体检全部正常，可以正常使用';
  // attention 状态的成因是 warn 项（fail 恒为 0），所以这里必须数 warn，不能数 fails。
  if (verdict === 'attention') return `⚠️ Claude 可以正常使用，但有 ${warns.length} 项值得留意`;
  const accountIssue = fails.some(isAccountVerifyItem);
  return accountIssue ? '❌ 发现问题：账号侧需要你本人处理（不是应用坏了）' : '❌ 发现问题，先按下面的建议处理';
}

/** 结论的一句话补充说明 */
function verdictPlain(verdict: VerifyVerdict, fails: VerifyItem[]): string {
  if (verdict === 'ready') return '应用、签名与浏览器检查都没有问题，没有需要你做的事。';
  if (verdict === 'attention') return '主要功能都正常，只有个别小项不完美。看一眼每项后面的「建议」就行，不影响使用。';
  const accountIssue = fails.some(isAccountVerifyItem);
  return accountIssue
    ? '应用本身没有坏，是账号需要在浏览器里完成一次验证。这一步涉及你的账号，只能你本人操作；做完再重新体检一次。'
    : '有检查项没通过。你不用自己修，点下面的「复制报告」把内容发给我，我按报告里的项目处理。';
}

/** 把一段文字里的 https:// 链接渲染成可点击外链（并提示会离开本站） */
function Linkified({text}: {text: string}) {
  const parts = text.split(/(https:\/\/[^\s，。；、）)]+)/g);
  const hasLink = parts.some((part) => part.startsWith('https://'));
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('https://') ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="verify-ext-link">
            {part}
            <span className="verify-ext-hint">（该链接会离开本站）</span>
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
      {hasLink && <span className="verify-ext-note"> 该链接会离开本站，打开前请确认是你自己要去的地址。</span>}
    </>
  );
}

/** 状态图标：与文字同时出现，不只靠颜色区分 */
function StatusIcon({status, size = 16}: {status: VerifyStatus; size?: number}) {
  if (status === 'pass') return <CheckCircle2 size={size} aria-hidden="true" />;
  if (status === 'warn') return <AlertTriangle size={size} aria-hidden="true" />;
  if (status === 'fail') return <XCircle size={size} aria-hidden="true" />;
  return <SkipForward size={size} aria-hidden="true" />;
}

/** 单项：默认折叠详情；失败项默认展开并突出「下一步」；跳过项中性灰，不制造恐慌 */
function ItemRow({item, index}: {item: VerifyItem; index: number}) {
  const [open, setOpen] = useState(item.status === 'fail');
  const statusText = STATUS_TEXT[item.status];
  const detailId = `verify-detail-${index}`;
  const meta: string[] = [];
  if (typeof item.httpStatus === 'number') meta.push(`HTTP ${item.httpStatus || '无响应'}`);
  if (typeof item.ms === 'number') meta.push(`${item.ms} ms`);

  return (
    <li className={`verify-item verify-item--${item.status}`}>
      <button
        type="button"
        className="verify-item-head"
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={`${item.title}：${statusText.label}，${open ? '收起' : '展开'}详情`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`verify-badge verify-badge--${item.status}`}>
          <StatusIcon status={item.status} />
          <span>{statusText.label}</span>
        </span>
        <span className="verify-item-title">{item.title}</span>
        <span className="verify-item-caret" aria-hidden="true">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      <div id={detailId} className="verify-item-detail" hidden={!open}>
        <p className="verify-item-text">
          <Linkified text={item.detail} />
        </p>
        {meta.length > 0 && <p className="verify-item-meta">{meta.join(' · ')}</p>}
        {item.suggestion && (
          <p className="verify-item-next">
            <strong>{item.status === 'fail' ? '下一步：' : '建议：'}</strong>
            {item.suggestion}
          </p>
        )}
      </div>
    </li>
  );
}

/** 一组检查结果；没有结果时显示一句人话，不显示一片红 */
function ResultGroup({
  label,
  items,
  offset,
  emptyText,
  action,
}: {
  label: string;
  items: VerifyItem[];
  offset: number;
  emptyText: string;
  action?: ReactNode;
}) {
  const summary = summarize(items);
  const hasProblem = summary.fail > 0;
  return (
    <section className={`verify-group${hasProblem ? ' verify-group--problem' : ''}`} aria-label={label}>
      <header className="verify-group-head">
        <h3>{label}</h3>
        {items.length > 0 && (
          <span className="verify-group-count">
            通过 {summary.pass} · 注意 {summary.warn} · 不通 {summary.fail}
            {summary.skip > 0 ? ` · 跳过 ${summary.skip}` : ''}
          </span>
        )}
      </header>
      {items.length === 0 ? (
        <p className="verify-item-text">{emptyText}</p>
      ) : (
        <ul className="verify-list">
          {items.map((item, i) => (
            <ItemRow key={item.id} item={item} index={offset + i} />
          ))}
        </ul>
      )}
      {action}
    </section>
  );
}

/** 复制失败时的兜底：塞进可见 textarea 并全选，站主自己按 Ctrl+C */
function copyFallback(text: string): boolean {
  try {
    if (typeof document.execCommand !== 'function') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    document.body.append(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 报告文件名：Claude体检报告-2026-10-31.md */
function reportFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Claude体检报告-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

export default function VerifyPortal() {
  /** 站主拖入并解析成功的本机体检报告；null = 还没做第一步 */
  const [localReport, setLocalReport] = useState<LocalCheckReport | null>(null);
  /** 拖入文件时的中文错误（非法 JSON / 格式不对）；有值就显示红框 */
  const [fileError, setFileError] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  /** 自检结果（含本机体检 + 浏览器能力）；null = 还没跑完 */
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [running, setRunning] = useState(false);
  /** 自检本身的错误（不是体检项的失败） */
  const [runError, setRunError] = useState('');
  const [message, setMessage] = useState('');
  const [manualCopy, setManualCopy] = useState('');
  // 防止 React StrictMode 下 useEffect 触发两次而跑两遍自检
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLTextAreaElement>(null);

  /** 跑一次自检（浏览器能力 + 已拖入的本机报告；没有报告时本机部分出「跳过」） */
  const run = useCallback(async (local: LocalCheckReport | null) => {
    setRunning(true);
    setRunError('');
    setMessage('');
    setManualCopy('');
    try {
      // 核心层保证「永不 reject」；这里再兜一层，自检本身出问题也只会显示错误卡片
      const result = await runVerification({localReport: local});
      setReport(result);
    } catch (e) {
      setRunError(messageOf(e));
      setReport(null);
    } finally {
      setRunning(false);
    }
  }, []);

  // 首次进入自动跑一次第二步（浏览器能力）；第一步由站主自己拖文件
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run(null);
  }, [run]);

  /** 第一步：读取拖入 / 选中的文件，交给核心层解析（核心层永不抛错，这里再兜一层） */
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setFileError('');
      setMessage('');
      setManualCopy('');
      setReading(true);
      setFileName(file.name);
      try {
        const text = await file.text();
        const parsed = parseLocalCheckReport(text);
        if (!parsed.ok) {
          setLocalReport(null);
          setFileError(parsed.error);
          return;
        }
        setLocalReport(parsed.report);
        // 拖入成功后立刻重跑一次，让结论带上本机体检结果
        await run(parsed.report);
      } catch (e) {
        setLocalReport(null);
        setFileError(`读取文件失败：${messageOf(e)}。请重新拖入，或重新运行一次体检脚本。`);
      } finally {
        setReading(false);
      }
    },
    [run],
  );

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      setFileError('没读到你拖进来的文件，请再拖一次，或点「选择文件」。');
      return;
    }
    void handleFile(file);
  };

  const resetLocal = () => {
    setLocalReport(null);
    setFileError('');
    setFileName('');
    void run(null);
  };

  const markdown = report ? renderMarkdownReport(report) : '';

  const handleCopy = async () => {
    if (!markdown) return;
    setMessage('');
    setManualCopy('');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
        setMessage('已复制报告。直接粘贴发给我即可。');
        return;
      }
    } catch {
      // 微信内置浏览器等场景会拒绝剪贴板权限，走下面的降级路径
    }
    if (copyFallback(markdown)) {
      setMessage('已复制报告。直接粘贴发给我即可。');
      return;
    }
    setManualCopy(markdown);
    setMessage('浏览器没允许自动复制，报告已放在下面的框里：点一下框内文字全选，再按 Ctrl+C（手机长按「复制」）。');
    window.setTimeout(() => copyRef.current?.select(), 0);
  };

  const handleDownload = () => {
    if (!markdown) return;
    try {
      saveLocal(new Blob([markdown], {type: 'text/markdown;charset=utf-8'}), reportFileName());
      setMessage(`已开始下载 ${reportFileName()}。把这个文件发给我也可以。`);
    } catch (e) {
      setMessage(`下载失败：${messageOf(e)}。可用「复制报告」代替。`);
    }
  };

  const localItems = report ? report.items.filter((item) => item.category === 'local') : [];
  const capabilityItems = report ? report.items.filter((item) => item.category === 'capability') : [];
  const summary = report?.summary;
  const verdict = report?.verdict;
  const probeCount = defaultCapabilityProbes().length;
  const fails = report ? report.items.filter((item) => item.status === 'fail') : [];
  const warns = report ? report.items.filter((item) => item.status === 'warn') : [];

  return (
    <ToolPage
      id={VERIFY_TOOL_ID}
      title="Claude 体检门户"
      description="Claude 桌面应用体检门户 —— 三步点完，不用打开终端、不用装任何东西。"
      privacy="隐私：本页只读取你主动拖进来的 claude-check.json 文字内容，不读取其它任何文件，也不上传任何内容；报告只存在页面内存里，刷新即清空。"
    >
      <section className="study-card verify-hero" aria-label="门户说明">
        <h2 className="verify-hero-title">Claude 桌面应用 体检门户</h2>
        <p className="verify-hero-text">三步点完，不用打开终端、不用装任何东西。</p>
        <ol className="verify-hero-steps">
          <li>
            把桌面上生成的 <strong>claude-check.json</strong> 拖进第一步的框里。
          </li>
          <li>本页会自动检查你的浏览器能不能正常干活（这一步不用你动手）。</li>
          <li>点「复制报告」，把内容贴给我。</li>
        </ol>
      </section>

      {/* ───────────── 第一步：本机体检报告 ───────────── */}
      <section className="study-card verify-card" aria-label="第一步本机体检报告">
        <h2 className="verify-card-title">
          <span className="verify-step-num">第一步</span>
          <span>本机体检报告</span>
        </h2>
        <div
          className={`verify-drop${dragging ? ' verify-drop--active' : ''}${fileError ? ' verify-drop--error' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="group"
          aria-label="把 claude-check.json 拖到这里"
        >
          <FileUp size={30} aria-hidden="true" />
          <p className="verify-drop-title">把 claude-check.json 拖到这里</p>
          <p className="verify-drop-hint">拖进来会自动读取并检查；也可以点下面的按钮选择文件。</p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="verify-file-input"
            aria-label="选择 claude-check.json 文件"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              // 允许重复选择同一个文件（否则第二次不会触发 change）
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="study-btn alt verify-btn"
            onClick={() => inputRef.current?.click()}
            disabled={reading}
            aria-label="选择 claude-check.json 文件"
          >
            {reading ? <LoaderCircle size={15} className="verify-spin" aria-hidden="true" /> : <FileUp size={15} aria-hidden="true" />}
            <span>{reading ? '正在读取…' : '选择文件'}</span>
          </button>
          {fileName && !fileError && <p className="verify-item-meta">已选择：{fileName}</p>}
        </div>

        {fileError && (
          <div className="verify-file-error" role="alert">
            <p className="verify-file-error-title">
              <XCircle size={16} aria-hidden="true" />
              <span>这个文件没能读取</span>
            </p>
            <p className="verify-item-text">{fileError}</p>
            <div className="verify-actions">
              <button
                type="button"
                className="study-btn alt verify-btn"
                onClick={() => {
                  setFileError('');
                  inputRef.current?.click();
                }}
                aria-label="重新选择文件"
              >
                <RefreshCw size={15} aria-hidden="true" />
                <span>重新选择</span>
              </button>
            </div>
          </div>
        )}

        {localReport ? (
          <div className="verify-overview" role="status">
            <p className="verify-overview-row">
              <span className="verify-overview-label">应用</span>
              <span className="verify-overview-value">{localReport.app.path}</span>
            </p>
            <p className="verify-overview-row">
              <span className="verify-overview-label">版本</span>
              <span className="verify-overview-value">{localReport.app.version}</span>
            </p>
            <p className="verify-overview-row">
              <span className="verify-overview-label">应用标识</span>
              <span className="verify-overview-value">{localReport.app.bundleId}</span>
            </p>
            <p className="verify-overview-row">
              <span className="verify-overview-label">系统与架构</span>
              <span className="verify-overview-value">
                {[localReport.app.arch, localReport.app.electron ? `Electron ${localReport.app.electron}` : '']
                  .filter(Boolean)
                  .join(' · ') || '报告未提供'}
              </span>
            </p>
            <p className="verify-overview-row">
              <span className="verify-overview-label">生成时间</span>
              <span className="verify-overview-value">{localReport.generatedAt}</span>
            </p>
            <div className="verify-actions">
              <button type="button" className="study-btn alt verify-btn" onClick={resetLocal} aria-label="换一份体检报告">
                <RefreshCw size={15} aria-hidden="true" />
                <span>换一份报告</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="verify-download-hint">
            <p className="verify-item-text">
              还没有体检报告？先下载体检脚本：双击运行后，桌面会生成 <strong>claude-check.json</strong>，再把它拖回本页。
            </p>
            <div className="verify-actions">
              <a
                className="study-btn alt verify-btn verify-link-btn"
                href={CHECK_SCRIPT_URL}
                download="claude-check.command"
                aria-label="下载 Claude 体检脚本 claude-check.command"
              >
                <Download size={15} aria-hidden="true" />
                <span>下载 Claude 体检脚本</span>
              </a>
            </div>
            <p className="verify-item-meta">双击运行 → 桌面会生成 claude-check.json → 拖回本页</p>
          </div>
        )}

        {localItems.length > 0 && (
          <ResultGroup
            label={CATEGORY_LABELS.local}
            items={localItems}
            offset={0}
            emptyText="本机体检没有返回任何检查项。"
          />
        )}
      </section>

      {/* ───────────── 第二步：浏览器本地能力 ───────────── */}
      <section className="study-card verify-card" aria-label="第二步浏览器本地能力">
        <h2 className="verify-card-title">
          <span className="verify-step-num">第二步</span>
          <span>浏览器本地能力</span>
        </h2>
        <p className="verify-item-text">
          这组检查回答的是：NOVIP 网页在你的浏览器里能不能正常干活。不用你动手，打开页面就会自动跑。
        </p>
        {runError ? (
          // 自检本身出错：给可执行的下一步，不让页面白屏
          <div className="verify-file-error" role="alert">
            <p className="verify-file-error-title">
              <XCircle size={16} aria-hidden="true" />
              <span>检查本身出错了</span>
            </p>
            <p className="verify-item-text">错误信息：{runError}</p>
            <p className="verify-item-text">
              这不代表 Claude 有问题，多半是当前浏览器拦住了检查。先点下面的「重新检查」，一直出错就把这个页面截图发给我。
            </p>
            <div className="verify-actions">
              <button type="button" className="study-btn verify-btn" onClick={() => void run(localReport)} aria-label="重新检查浏览器能力">
                <RefreshCw size={15} aria-hidden="true" />
                <span>重新检查</span>
              </button>
            </div>
          </div>
        ) : running && capabilityItems.length === 0 ? (
          <p className="verify-loading-line" role="status" aria-live="polite">
            <LoaderCircle size={15} className="verify-spin" aria-hidden="true" />
            <span>正在检查 {probeCount} 项…</span>
          </p>
        ) : (
          <ResultGroup
            label={CATEGORY_LABELS.capability}
            items={capabilityItems}
            offset={localItems.length}
            emptyText="还没有检查结果，点下面的「重新检查」。"
            action={
              <div className="verify-actions">
                <button
                  type="button"
                  className="study-btn alt verify-btn"
                  onClick={() => void run(localReport)}
                  disabled={running}
                  aria-label="重新检查浏览器本地能力"
                >
                  {running ? <LoaderCircle size={15} className="verify-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                  <span>{running ? '正在检查…' : '重新检查'}</span>
                </button>
              </div>
            }
          />
        )}
      </section>

      {/* ───────────── 总结论 ───────────── */}
      {report && summary && verdict && (
        <section className={`verify-verdict verify-verdict--${verdict}`} role="status" aria-live="polite">
          <div className="verify-verdict-head">
            <span className="verify-verdict-icon" aria-hidden="true">
              {verdict === 'ready' ? <ShieldCheck size={26} /> : verdict === 'attention' ? <AlertTriangle size={26} /> : <XCircle size={26} />}
            </span>
            <h2 className="verify-verdict-title">{verdictHeadline(verdict, fails, warns)}</h2>
          </div>
          <p className="verify-verdict-text">{verdictPlain(verdict, fails)}</p>

          {/* 站主最想知道的两件事：应用版本、签名是否有效（有本机报告时才显示） */}
          {localReport && (
            <dl className="verify-verdict-facts">
              <div>
                <dt>应用版本</dt>
                <dd>{localReport.app.version}</dd>
              </div>
              <div>
                <dt>代码签名</dt>
                <dd>
                  {localReport.signature
                    ? `${localReport.signature.valid ? '有效' : '无效'}${localReport.signature.authority ? `（${localReport.signature.authority}）` : ''}`
                    : '报告未提供'}
                </dd>
              </div>
            </dl>
          )}

          {/* 有 fail 时直接引用第一条 fail 的原文，让站主一眼看到真正的问题 */}
          {fails.length > 0 && (
            <div className="verify-verdict-fail" role="note">
              <p className="verify-verdict-fail-title">
                <XCircle size={15} aria-hidden="true" />
                <span>{fails[0].title}：{fails[0].detail}</span>
              </p>
              {fails[0].detail.includes('https://') && (
                <p className="verify-verdict-fail-link">
                  <Linkified text={fails[0].detail} />
                </p>
              )}
              {fails[0].suggestion && (
                <p className="verify-verdict-fail-next">
                  <strong>下一步：</strong>
                  {fails[0].suggestion}
                </p>
              )}
              {fails.length > 1 && <p className="verify-verdict-meta">另有 {fails.length - 1} 项不通，详见下面分组结果。</p>}
            </div>
          )}

          <p className="verify-verdict-meta">
            共 {summary.total} 项：通过 {summary.pass} · 注意 {summary.warn} · 不通 {summary.fail} · 跳过 {summary.skip}
            {!localReport && '（还没做第一步：本机体检未运行）'}
          </p>
        </section>
      )}

      {/* ───────────── 第三步：生成并带走报告 ───────────── */}
      <section className="study-card verify-card" aria-label="第三步生成并带走报告">
        <h2 className="verify-card-title">
          <span className="verify-step-num">第三步</span>
          <span>生成并带走报告</span>
        </h2>
        <p className="verify-item-text">
          报告里包含：Claude 本机体检结果（如果第一步做过）、浏览器能力检查结果，以及生成时间与浏览器版本。
          {!localReport && '现在第一步还没做，报告里会明确写「本机体检未运行」，你也可以先做第一步再来。'}
        </p>
        <div className="verify-actions">
          <button
            type="button"
            className="study-btn verify-btn"
            onClick={() => void handleCopy()}
            disabled={!markdown}
            aria-label="复制体检报告到剪贴板"
          >
            <ClipboardCopy size={15} aria-hidden="true" />
            <span>复制报告</span>
          </button>
          <button
            type="button"
            className="study-btn alt verify-btn"
            onClick={handleDownload}
            disabled={!markdown}
            aria-label="下载 Markdown 格式的体检报告"
          >
            <Download size={15} aria-hidden="true" />
            <span>下载报告 .md</span>
          </button>
        </div>
        <p className="verify-hero-hint">复制或下载后，把内容贴给我即可，不需要你运行任何命令。</p>
        {message && (
          <p className="verify-message" role="status">
            {message}
          </p>
        )}
        {manualCopy && (
          <textarea
            ref={copyRef}
            className="verify-manual-copy"
            readOnly
            value={manualCopy}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="手动复制用的报告全文"
          />
        )}
      </section>

      <section className="study-card verify-about" aria-label="关于本页">
        <h2 className="verify-card-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>这个页面做了什么、没做什么</span>
        </h2>
        <ul className="verify-about-list">
          <li>浏览器出于安全限制读不到你 Mac 上的应用，所以第一步需要你把体检脚本生成的 JSON 拖进来。</li>
          <li>页面只读这一份 JSON 的文字内容，不上传、不存服务器，刷新就清空。</li>
          <li>这是非官方的本地诊断，不是 Anthropic 官方产品，也不会改动 Claude 应用本身。</li>
          <li>结论只反映「装得对不对、能不能正常干活」，不能代替你亲手试用。</li>
        </ul>
        {report && (
          <p className="verify-item-meta">
            {probeCount} 项浏览器能力探针 · 检查于 {new Date(report.startedAt).toLocaleString('zh-CN')}
          </p>
        )}
      </section>
    </ToolPage>
  );
}
