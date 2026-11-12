import {BookOpen, Search, Share2} from "lucide-react";
import AuthorContact from "./AuthorContact";
import CampusDesk from "./tools/CampusDesk";
import UniversalFeedback from "./tools/UniversalFeedback";
import {guardedReload, signalBooted, isChunkLoadError} from "./boot-guards";
import {trackAnalytics} from "./analytics/client";
import {recordLocalUsage} from "./analytics/local";
import {recordRealGraphAction} from "./tools/x-recommend";
import {applyPageSeo} from "./seo";
import {ShareToClassmates} from "./tools/ShareAction";
import {recordRecentTool} from "./tools/recent-core";
import React, {Component, lazy, Suspense, useEffect, useState, type ReactNode} from "react";
import {createRoot} from "react-dom/client";
import {currentPage, tools, RECENT_KEY, recentTools, PUBLIC_TOOL_COUNT, type Page} from "./tools/registry";
import {Feedback, copyLocal} from "./tool-common";
import {IosAppIcon} from "./tools/ios-icons";
import "./study.css";
import "./styles.css";
import "./converter.css";
import "./novip-theme.css";
import "./immersive/immersive.css";
import "./motion/tokens.css";
import "./motion/motion-system.css";
import "./tools/novip20.css";
import "./campus-desk.css";
import {GlobalImmersionShell} from "./immersive/GlobalImmersionShell";
import {AdaptiveDialog} from "./motion/components/AdaptiveDialog";
import {CommandPalette} from "./motion/components/CommandPalette";
import {I18nProvider, useI18n, LanguageSwitcher} from "./i18n";

const Home = lazy(() => import("./tools/Home"));
const Wrongbook20 = lazy(() => import("./tools/Novip20").then(m => ({default: m.Wrongbook20})));
const Budget20 = lazy(() => import("./tools/Novip20").then(m => ({default: m.Budget20})));
const InternshipHours20 = lazy(() => import("./tools/Novip20").then(m => ({default: m.InternshipHours20})));
const PriorityMatrix20 = lazy(() => import("./tools/Novip20").then(m => ({default: m.PriorityMatrix20})));
const DefensePacer20 = lazy(() => import("./tools/Novip20").then(m => ({default: m.DefensePacer20})));
const FocusTimer = lazy(() => import("./tools/FocusTimer"));
const PostgradScore = lazy(() => import("./tools/PostgradScore"));
const DormPower = lazy(() => import("./tools/DormPower"));
const DormPowerLimit = lazy(() => import("./tools/DormPowerLimit"));
const ExamCountdown = lazy(() => import("./tools/ExamCountdown"));
const MdToWechat = lazy(() => import("./tools/MdToWechat"));

const BatchPdf = lazy(() => import("./tools/BatchPdf"));
const LeaveHelper = lazy(() => import("./tools/LeaveHelper"));
const MaterialCollector = lazy(() => import("./tools/MaterialCollector"));
const FileOrganizer = lazy(() => import("./tools/FileOrganizer"));
const Materials = lazy(() => import("./tools/Materials")),
  PptSlim = lazy(() => import("./tools/PptSlim")),
  Scan = lazy(() => import("./tools/Scan")),
  Privacy = lazy(() => import("./tools/Privacy")),
  Wishes = lazy(() => import("./tools/Wishes"));
const App = lazy(() => import("./App")),
  Converter = lazy(() => import("./Converter")),
  References = lazy(() => import("./References")),
  Sheets = lazy(() => import("./Sheets")),
  Photo = lazy(() => import("./features/id-photo/IdPhotoTool")),
  Images = lazy(() => import("./tools/Images")),
  Ocr = lazy(() => import("./tools/Ocr")),
  DocxCheck = lazy(() => import("./tools/DocxCheck")),
  Clean = lazy(() => import("./tools/TableClean")),
  Planner = lazy(() => import("./tools/Planner")),
  Cost = lazy(() => import("./tools/Cost")),
  Background = lazy(() => import("./tools/Background"));
const Compare = lazy(() => import("./tools/Academic").then((m) => ({default: m.Compare}))),
  Resume = lazy(() => import("./tools/Academic").then((m) => ({default: m.Resume}))),
  Lab = lazy(() => import("./tools/Academic").then((m) => ({default: m.Lab}))),
  Grades = lazy(() => import("./tools/Grades"));
const Developer = lazy(() => import("./tools/Developer"));
const Timestamp = lazy(() => import("./tools/Timestamp")),
  TextToolkit = lazy(() => import("./tools/TextToolkit")),
  Finance = lazy(() => import("./tools/Finance")),
  Health = lazy(() => import("./tools/Health"));
const ColorPicker = lazy(() => import("./tools/ColorPicker")),
  Stitch = lazy(() => import("./tools/ImageStitch")),
  PdfPageNumber = lazy(() => import("./tools/PdfPageNumber")),
  PdfCrop = lazy(() => import("./tools/PdfCrop")),
  PdfMergeSplit = lazy(() => import("./tools/PdfMergeSplit")),
  PhotoCheck = lazy(() => import("./tools/PhotoCheck"));
const CollegeNav = lazy(() => import("./tools/CollegeNav"));
const PdfWatermark = lazy(() => import("./tools/PdfWatermark"));
const PdfCompress = lazy(() => import("./tools/PdfCompress"));
const ImageWatermark = lazy(() => import("./tools/ImageWatermark"));
const PptExtract = lazy(() => import("./tools/PptExtract"));
const Timetable = lazy(() => import("./tools/Timetable"));
const AiAssistant = lazy(() => import("./tools/AiAssistant"));
const PptGenerate = lazy(() => import("./tools/PptGenerate"));
const PdfForm = lazy(() => import("./tools/PdfForm"));
const ImageCompress = lazy(() => import("./tools/ImageCompress"));
const Flowchart = lazy(() => import("./tools/Flowchart"));
const MediaConverter = lazy(() => import("./tools/MediaConverter"));
const WebToApk = lazy(() => import("./tools/WebToApk"));
const QrTool = lazy(() => import("./tools/QrTool"));
const RandomPick = lazy(() => import("./tools/RandomPick"));
const SplitBill = lazy(() => import("./tools/SplitBill"));
const ClassFund = lazy(() => import("./tools/ClassFund"));
const ExamPlan = lazy(() => import("./tools/ExamPlan"));
const CompositeScore = lazy(() => import("./tools/CompositeScore"));
const FitnessTest = lazy(() => import("./tools/FitnessTest"));
const InternshipTax = lazy(() => import("./tools/InternshipTax"));
const StudentLoan = lazy(() => import("./tools/StudentLoan"));
const ThesisCheck = lazy(() => import("./tools/ThesisCheck"));
const DocxFormat = lazy(() => import("./tools/DocxFormat"));
const GroupFreeTime = lazy(() => import("./tools/GroupFreeTime"));
const IdCardLayout = lazy(() => import("./tools/IdCardLayout"));
const VerifyPortal = lazy(() => import("./tools/VerifyPortal"));
const Stats = lazy(() => import("./analytics/Stats"));
const NotFound = lazy(() => import("./tools/NotFound"));

class ToolBoundary extends Component<{children: ReactNode}, {error: string; loop: boolean}> {
  state = {error: "", loop: false};
  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error.message : "工具加载异常", loop: false};
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="tool-error-boundary" role="alert">
        <h2>这个工具暂时未能加载</h2>
        <p>{this.state.error}</p>
        <p>别担心，NOVIP 这里没有 VIP 限制，全部工具均在浏览器本地运行。你可以先尝试刷新重试，或使用其他急救工具。</p>
        {isChunkLoadError(this.state.error) && (
          <p>可能是旧版本资源缓存或网络故障；请先保存其他工具中尚未导出的内容。</p>
        )}
        {this.state.loop ? (
          <>
            <p>已多次尝试重新加载仍未成功，可能是网络问题或浏览器缓存了旧版本。</p>
            <p>建议：切换 Wi-Fi / 移动数据后重试，或复制链接到系统浏览器（Chrome / Edge）打开 https://novip.site</p>
          </>
        ) : (
          <>
            <p>可切换其他工具。刷新会清空内存中的文件，请先保存其他页面结果。</p>
            <button
              onClick={() => {
                if (!guardedReload()) this.setState({loop: true});
              }}
            >
              刷新并重试
            </button>
          </>
        )}
      </section>
    );
  }
}

function ReadyWhenPageMounted(){useEffect(()=>{signalBooted();},[]);return null;}

const pageNow = () => currentPage(location.pathname, location.hash);

function IosHudToast() {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "download" | "error" | "info";
    visible: boolean;
  }>({message: "", type: "success", visible: false});
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{message: string; type?: string}>).detail;
      if (!detail?.message) return;
      const t =
        detail.type === "download" || detail.type === "error" || detail.type === "info"
          ? detail.type
          : "success";
      clearTimeout(timer);
      setToast({message: detail.message, type: t, visible: true});
      timer = setTimeout(() => setToast((prev) => ({...prev, visible: false})), 2600);
    };
    window.addEventListener("novip:toast", onToast);
    return () => {
      window.removeEventListener("novip:toast", onToast);
      clearTimeout(timer);
    };
  }, []);
  if (!toast.visible) return null;
  const iconText =
    toast.type === "download" ? "↓" : toast.type === "error" ? "!" : toast.type === "info" ? "✦" : "✓";
  return (
    <div
      className={`ios-hud-toast ios-hud-toast--${toast.type} visible`}
      role="status"
      aria-live="polite"
    >
      <span className="ios-hud-icon ios-hud-toast-dot">{iconText}</span>
      <span>{toast.message}</span>
    </div>
  );
}

function Root() {
  const { lang, t, dict } = useI18n();
  const [page, setPage] = useState<Page>(pageNow),
    [visited, setVisited] = useState<Page[]>([pageNow()]),
    [quickSwitchOpen, setQuickSwitchOpen] = useState(false),
    [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const [classic,setClassic] = useState(false);
  const deskHome = page === "home" && !classic;
  useEffect(() => {
    if (!classic) document.documentElement.removeAttribute("data-novip-visual-mode");
  }, [classic]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    const handleOpenCommand = () => setCommandPaletteOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("novip:open-command-palette", handleOpenCommand);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("novip:open-command-palette", handleOpenCommand);
    };
  }, []);

  useEffect(() => {
    applyPageSeo(page, document, lang);
    recordRecentTool(page);
  }, [page, lang]);

  useEffect(() => {
    recordLocalUsage(page);
    trackAnalytics("pageview");
    if (page !== "home" && page !== "stats" && page !== "not-found") trackAnalytics("tool_open", page);
  }, [page]);

  useEffect(() => {
    const update = () => {
      const next = pageNow();
      setPage(next);
      setVisited((old) => (old.includes(next) ? old : [...old, next]));
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  function navigate(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.pushState(null, "", e.currentTarget.href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({top: 0});
  }

  const currentTool = tools.find((t) => t.id === page);

  const handleShare = async () => {
    const toolMeta = dict.tools[page];
    const name = toolMeta?.name || currentTool?.name;
    const task = toolMeta?.task || currentTool?.task;
    const title = name ? `NOVIP ${name} | ${t('common.brandName')}` : `${t('common.brandName')} - ${t('common.brandSlogan')}`;
    const text = name ? `${name}: ${task}` : t('common.share.desc');
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({title, text, url});
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await copyLocal(url);
    } catch {
      alert(`${t('common.actions.copied')}：${url}`);
    }
  };

  const content = (id: Page) =>
    id === 'not-found' ? (
      <NotFound navigate={navigate} />
    ) : id === 'stats' ? (
      <Stats />
    ) : id === 'ai' ? (
      <AiAssistant navigate={navigate} />
    ) : id === 'ppt-generate' ? (
      <PptGenerate />
    ) : id === 'pdf-form' ? (
      <PdfForm />
    ) : id === 'image-compress' ? (
      <ImageCompress />
    ) : id === 'flowchart' ? (
      <Flowchart />
    ) : id === 'media-converter' ? (
      <MediaConverter />
    ) : id === 'web-to-apk' ? (
      <WebToApk />
    ) : id === 'pdf-watermark' ? (
      <PdfWatermark />
    ) : id === 'image-watermark' ? (
      <ImageWatermark />
    ) : id === 'ppt-extract' ? (
      <PptExtract />
    ) : id === 'timetable' ? (
      <Timetable />
    ) : id === 'photo-check' ? (
      <PhotoCheck />
    ) : id === 'pdf-compress' ? (
      <PdfCompress />
    ) : id === 'pdf-merge-split' ? (
      <PdfMergeSplit />
    ) : id === 'leave-helper' ? (
      <LeaveHelper />
    ) : id === 'material-collector' ? (
      <MaterialCollector />
    ) : id === 'file-organizer' ? (
      <FileOrganizer />
    ) : id === 'batch-pdf' ? (
      <BatchPdf />
    ) : id === 'materials' ? (
      <Materials />
    ) : id === 'ppt' ? (
      <PptSlim />
    ) : id === 'scan' ? (
      <Scan />
    ) : id === 'privacy' ? (
      <Privacy />
    ) : id === 'wishes' ? (
      <Wishes />
    ) : id === 'home' ? (
      page !== "home" ? null : classic ? <Home navigate={navigate}/> : <CampusDesk navigate={navigate} openClassic={()=>{setClassic(true);window.scrollTo(0,0);}}/>
    ) : id === 'college-nav' ? (
      <CollegeNav />
    ) : id === 'handwrite' ? (
      <App />
    ) : id === 'files' ? (
      <Converter />
    ) : id === 'references' ? (
      <References />
    ) : id === 'sheets' ? (
      <Sheets />
    ) : id === 'photo' ? (
      <Photo />
    ) : id === 'background' ? (
      <Background />
    ) : id === 'images' ? (
      <Images />
    ) : id === 'ocr' ? (
      <Ocr />
    ) : id === 'docx-check' ? (
      <DocxCheck />
    ) : id === 'table-clean' ? (
      <Clean />
    ) : id === 'compare' ? (
      <Compare />
    ) : id === 'resume' ? (
      <Resume />
    ) : id === 'lab' ? (
      <Lab />
    ) : id === 'course' ? (
      <Planner />
    ) : id === 'grades' ? (
      <Grades />
    ) : id === 'developer' ? (
      <Developer />
    ) : id === 'timestamp' ? (
      <Timestamp />
    ) : id === 'text' ? (
      <TextToolkit />
    ) : id === 'finance' ? (
      <Finance />
    ) : id === 'health' ? (
      <Health />
    ) : id === 'color-picker' ? (
      <ColorPicker />
    ) : id === 'stitch' ? (
      <Stitch />
    ) : id === 'pdf-page-number' ? (
      <PdfPageNumber />
    ) : id === 'pdf-crop' ? (
      <PdfCrop />
    ) : id === 'qr' ? (
      <QrTool />
    ) : id === 'random-pick' ? (
      <RandomPick />
    ) : id === 'split-bill' ? (
      <SplitBill />
    ) : id === 'class-fund' ? (
      <ClassFund />
    ) : id === 'exam-plan' ? (
      <ExamPlan />
    ) : id === 'composite-score' ? (
      <CompositeScore />
    ) : id === 'fitness-test' ? (
      <FitnessTest />
    ) : id === 'internship-tax' ? (
      <InternshipTax />
    ) : id === 'student-loan' ? (
      <StudentLoan />
    ) : id === 'thesis-check' ? (
      <ThesisCheck />
    ) : id === 'docx-format' ? (
      <DocxFormat />
    ) : id === 'group-free-time' ? (
      <GroupFreeTime />
    ) : id === 'id-card-layout' ? (
      <IdCardLayout />
    ) : id === 'focus' ? (
      <FocusTimer />
    ) : id === 'postgrad-score' ? (
      <PostgradScore />
    ) : id === 'dorm-power' ? (
      <DormPower />
    ) : id === 'dorm-power-limit' ? (
      <DormPowerLimit />
    ) : id === 'countdown' ? (
      <ExamCountdown />
    ) : id === 'md-to-wechat' ? (
      <MdToWechat />
    ) : id === 'wrongbook' ? (
      <Wrongbook20 />
    ) : id === 'campus-budget' ? (
      <Budget20 />
    ) : id === 'internship-hours' ? (
      <InternshipHours20 />
    ) : id === 'priority-matrix' ? (
      <PriorityMatrix20 />
    ) : id === 'defense-pacer' ? (
      <DefensePacer20 />
    ) : id === 'verify' ? (
      <VerifyPortal />
    ) : (
      <Cost />
    );

  return (
    <>
      <IosHudToast />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      {classic && page === "home" && <button className="desk-return" onClick={()=>setClassic(false)}>{lang === "en-US" ? "Back to campus toolkit" : "返回新版校园工具箱"}</button>}
      {!classic && !deskHome && <header className="campus-desk desk-tool-bar"><div className="desk-wrap desk-bar-in">
        <a className="desk-brand" href="/" onClick={navigate} aria-label={t('common.nav.backToHome')}><span aria-hidden="true"><BookOpen size={21}/></span>NOVIP</a>
        <nav aria-label={t('common.nav.allTools')}>
          <a href="/" onClick={navigate}>{lang === 'en-US' ? 'Tool index' : '工具目录'}</a>
          <button onClick={()=>setCommandPaletteOpen(true)}><Search size={16}/>{lang === 'en-US' ? 'Find a tool' : '找工具'}</button>
          <button onClick={handleShare}><Share2 size={15}/>{lang === 'en-US' ? 'Share' : '分享'}</button>
        </nav><LanguageSwitcher compact/>
      </div></header>}
      {classic && <nav
        className={`tool-navigation${page !== "home" ? " mobile-subpage-hide" : ""}`}
        aria-label={t('common.nav.allTools')}
      >
        <a href="/" onClick={navigate} aria-current={page === "home" ? "page" : undefined}>
          {t('common.nav.home')}
        </a>
        <a
          href="/tools/ai"
          onClick={navigate}
          className={page === "ai" ? "active" : ""}
          aria-current={page === "ai" ? "page" : undefined}
        >
          {t('common.nav.ai')}
        </a>
        <a
          href="/tools/pdf-merge-split"
          onClick={navigate}
          className={page === "pdf-merge-split" ? "active" : ""}
          aria-current={page === "pdf-merge-split" ? "page" : undefined}
        >
          {t('common.nav.pdfMergeSplit')}
        </a>
        {(["handwrite", "files", "references", "sheets", "photo"] as const).map((id) => (
          <a
            key={id}
            href={tools.find((t) => t.id === id)!.path}
            onClick={navigate}
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
          >
            {dict.tools[id]?.name || id}
          </a>
        ))}
        <a
          href="/nav"
          onClick={navigate}
          className={page === "college-nav" ? "active" : ""}
          aria-current={page === "college-nav" ? "page" : undefined}
        >
          {t('common.nav.collegeNav')}
        </a>
        <a href="/tools/cost" onClick={navigate}>
          {t('common.nav.cost')}
        </a>
        <a href="/tools/wishes" onClick={navigate}>
          {t('common.nav.wishes')}
        </a>
        <a
          href="/stats"
          onClick={navigate}
          className={page === "stats" ? "active" : undefined}
          aria-current={page === "stats" ? "page" : undefined}
        >
          {t('common.nav.stats')}
        </a>
        <div style={{marginLeft: "auto", display: "flex", alignItems: "center", paddingRight: 4}}>
          <LanguageSwitcher compact />
        </div>
      </nav>}

      {classic && page !== "home" && page !== "not-found" && (
        <header className="ios-subpage-nav" aria-label={t('common.nav.allTools')}>
          <a href="/" onClick={navigate} className="ios-subpage-back" aria-label={t('common.nav.backToHome')}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{t('common.nav.allTools')}</span>
          </a>
          {currentTool && (
            <div className="ios-subpage-current-tool">
              <IosAppIcon id={currentTool.id} size={26} />
              <span>{dict.tools[currentTool.id]?.name || currentTool.name}</span>
            </div>
          )}
          <div className="ios-subpage-actions" style={{display: "flex", alignItems: "center", gap: 8}}>
            <LanguageSwitcher compact />
            <button
              type="button"
              className="novip-nav-quick-btn"
              onClick={() => setQuickSwitchOpen(true)}
              title={t('common.nav.quickSwitch')}
            >
              <span>{t('common.nav.quickSwitch')}</span>
            </button>
            <button
              type="button"
              className="ios-subpage-action-btn"
              onClick={handleShare}
              title={t('common.nav.share')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>{t('common.nav.share')}</span>
            </button>
          </div>
        </header>
      )}

      <AdaptiveDialog
        open={quickSwitchOpen}
        onClose={() => setQuickSwitchOpen(false)}
        title={t('common.nav.quickSwitch')}
        closeLabel={t('common.actions.close')}
      >
        <p style={{margin: "0 0 12px", fontSize: 13, opacity: 0.8}}>
          {t('home.hero.subtitle', { count: PUBLIC_TOOL_COUNT })}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))",
            gap: 10,
          }}
        >
          {(
            [
              "photo",
              "pdf-merge-split",
              "image-compress",
              "files",
              "handwrite",
              "timetable",
              "ppt-extract",
              "ai",
            ] as const
          ).map((tid) => {
            const item = tools.find((t) => t.id === tid);
            if (!item) return null;
            return (
              <a
                key={item.id}
                href={item.path}
                onClick={(e) => {
                  setQuickSwitchOpen(false);
                  navigate(e);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(148,163,184,0.22)",
                  textDecoration: "none",
                  color: "inherit",
                  minHeight: 46,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                <IosAppIcon id={item.id} size={28} />
                <span>{dict.tools[item.id]?.name || item.name}</span>
              </a>
            );
          })}
        </div>
      </AdaptiveDialog>

      {classic && <GlobalImmersionShell page={page} />}

      {visited.map((id) => (
        <div key={id} hidden={page !== id} className={page === id ? "novip-route-stage" : undefined}>
          <ToolBoundary>
            <Suspense fallback={<div className="convert-loading" role="status">{t('common.status.loading')}</div>}>{content(id)}<ReadyWhenPageMounted/></Suspense>
          </ToolBoundary>
        </div>
      ))}

      {page !== "home" && page !== "not-found" && page !== "stats" && (
        <div style={{maxWidth: 1080, margin: "24px auto 36px", padding: "0 16px", display: "flex", flexDirection: "column", gap: 14}}>
          <ShareToClassmates toolId={page} />
          <UniversalFeedback toolId={page} />
        </div>
      )}

      {classic && <nav className="ios-dock-bar" aria-label={t('common.nav.allTools')}>
        <a
          href="/"
          onClick={navigate}
          className={`ios-dock-item${page === "home" ? " active" : ""}`}
          aria-current={page === "home" ? "page" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>{t('common.nav.dockHome')}</span>
        </a>
        <a
          href="/tools/files"
          onClick={navigate}
          className={`ios-dock-item${page === "files" ? " active" : ""}`}
          aria-current={page === "files" ? "page" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" />
            <path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8" />
          </svg>
          <span>{t('common.nav.dockFiles')}</span>
        </a>
        <a
          href="/tools/id-photo"
          onClick={navigate}
          className={`ios-dock-item${page === "photo" ? " active" : ""}`}
          aria-current={page === "photo" ? "page" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span>{t('common.nav.dockPhoto')}</span>
        </a>
        <a
          href="/nav"
          onClick={navigate}
          className={`ios-dock-item${page === "college-nav" ? " active" : ""}`}
          aria-current={page === "college-nav" ? "page" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span>{t('common.nav.dockNav')}</span>
        </a>
        <a
          href="/tools/wishes"
          onClick={navigate}
          className={`ios-dock-item${page === "wishes" ? " active" : ""}`}
          aria-current={page === "wishes" ? "page" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
          </svg>
          <span>{t('common.nav.wishes')}</span>
        </a>
      </nav>}
      {!classic ? <details className="desk-contact"><summary>{lang === "en-US" ? "Contact the author" : "联系作者"}</summary><AuthorContact /></details> : <AuthorContact/>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>
);
