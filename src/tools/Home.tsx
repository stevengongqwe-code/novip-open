import {useEffect, useRef, useState, useMemo, useCallback} from 'react';
import {tools, recentTools, RECENT_KEY, PUBLIC_TOOL_COUNT, type ToolID} from './registry';
import {searchTools} from './search-core';
import {ToolPage, AdaptiveDialog} from './common';
import {IosAppIcon, TOOL_IOS_CONFIG, CAMPUS_SCENARIOS} from './ios-icons';
import {ShieldCheck, Grid, Search, ChevronDown, ChevronUp, Sparkles, Check, Share2, Zap, ArrowRight} from 'lucide-react';
import {resolveGrokIntent} from './grok-intent';
import {generateForYouFeed} from './x-recommend';
import {
  evaluateImmersionCapability,
  loadSavedThemeMode,
  saveThemeMode,
  resolveEffectiveTier,
  type ImmersionTier,
  type VisualThemeMode,
} from '../immersive/capability';
import {ImmersionStage} from '../immersive/ImmersionStage';
import {ImmersionHeroCore} from '../immersive/ImmersionHeroCore';
import {useSpatialInteractions} from '../immersive/useSpatialInteractions';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import {emitImmersionTelemetry} from '../immersive/telemetryBus';
import {BlurSplitText} from '../motion/components/BlurSplitText';
import {CountUpMetric} from '../motion/components/CountUpMetric';
import {useStaggerReveal} from '../motion/useNovipMotion';
import {getStoredPinnedTools} from './pinned-core';
import {useI18n} from '../i18n';

const GROUPS = [
  '文件工具',
  '图片与报名',
  '学习写作',
  '数据处理',
  '文本工具',
  '实用计算',
  '开发者工具',
  '功能许愿池',
] as const;

const GROUP_NAMES_EN: Record<string, string> = {
  '文件工具': 'Document Tools',
  '图片与报名': 'Photos & ID',
  '学习写作': 'Study & Writing',
  '数据处理': 'Data & Tables',
  '文本工具': 'Text Utilities',
  '实用计算': 'Smart Calculators',
  '开发者工具': 'Developer Tools',
  '功能许愿池': 'Feature Wishlist',
};

const SCENARIO_NAMES_EN: Record<string, {name: string; badge: string; tagline: string}> = {
  exam: {
    name: 'Exams & Registration',
    badge: 'CET · Grad · Civil',
    tagline: 'ID photo crop to 100KB, A4 document layout, checklist verification, ticket page numbers',
  },
  coursework: {
    name: 'Coursework & Slides',
    badge: 'PPT · Thesis · Typeset',
    tagline: 'PPT outline generator, flowchart creator, extract images from slides, GB/T 7714 citations',
  },
  document: {
    name: 'Print & Privacy',
    badge: 'PDF · Watermark · Format',
    tagline: 'Merge/split PDFs, PDF form sign, audio/video converter, metadata privacy stripper',
  },
  'campus-life': {
    name: 'Campus Life & Classes',
    badge: 'Timetable · Homework · Leave',
    tagline: 'Export timetable to calendar, homework submission checker, batch rename, leave generator',
  },
  'tools-dev': {
    name: 'Daily Utilities & Calc',
    badge: 'Color · Time · Compute',
    tagline: 'Color picker, timestamp converter, lab data calculator, fitness score, tax calculator, web to APK',
  },
};

const HIGH_FREQ_BENEFITS_EN: Record<string, string> = {
  'image-compress': 'Photo too large? Compress under 100KB in one click',
  'timetable': 'Import class timetable directly to phone calendar',
  'ppt-extract': 'Extract high-res images from lecture slide PPTs',
  'image-watermark': 'Add anti-theft watermarks to student ID cards',
  'references': 'GB/T 7714 bibliography formatting for theses',
  'material-collector': 'Verify student submissions against roster',
  'grades': 'Calculate passing exam score / reverse target GPA',
  'web-to-apk': 'Convert personal portfolio or timetable to APK',
  'pdf-form': 'Sign and fill leave or deferral forms without printing',
  'flowchart': 'Create Mermaid algorithms and thesis flowcharts',
  'media-converter': 'Extract audio MP3 and animated GIFs from video',
  'stitch': 'Seamlessly stitch chat screenshots and assignments',
};

const NEW_TOOL_IDS = new Set<string>([
  'pdf-merge-split',
  'photo-check',
  'pdf-compress',
  'web-to-apk',
  'ppt-generate',
  'pdf-form',
  'image-compress',
  'flowchart',
  'media-converter',
  'ai',
  'ppt-extract',
  'image-watermark',
  'timetable',
  'pdf-watermark',
  'pdf-page-number',
  'pdf-crop',
]);

const HOT_TOOL_IDS = new Set<string>([
  'pdf-merge-split',
  'photo-check',
  'pdf-compress',
  'web-to-apk',
  'ppt-generate',
  'pdf-form',
  'image-compress',
  'flowchart',
  'media-converter',
  'ai',
  'photo',
  'files',
  'references',
  'handwrite',
  'stitch',
  'material-collector',
  'grades',
]);

const SPOTLIGHT_IDS: ToolID[] = [
  'id-card-layout',
  'pdf-merge-split',
  'photo-check',
  'pdf-compress',
  'ppt-extract',
  'photo',
  'web-to-apk',
  'ppt-generate',
  'pdf-form',
  'image-compress',
  'flowchart',
  'media-converter',
  'ai',
  'image-watermark',
  'timetable',
  'pdf-watermark',
  'files',
];

const BENTO_EYEBROWS: Partial<Record<ToolID, string>> = {
  'pdf-merge-split': '大文件急救 · 多份PDF合并与按页拆分',
  'photo-check': '报名体检 · 尺寸底色合规诊断与修复',
  'pdf-compress': '文档瘦身 · 轻量与极限本地压缩',
  'web-to-apk': '网站转应用 · 纯端侧签名打包安卓 APK',
  'ppt-generate': '答辩与汇报 · 16:9 演示文稿一键生成',
  'pdf-form': '免打印签字 · 奖学金缓考请假表',
  'image-compress': 'Squoosh级对比 · 严格锁定 ≤ 100KB',
  flowchart: '论文与课设 · 流程图时序图ER图',
  'media-converter': '音视频处理 · 网课提取MP3与动图GIF',
  ai: '智能向导 · 秒速匹配免费工具与操作指南',
  'ppt-extract': '课件存图 · 不用一张张截图',
  'image-watermark': '隐私保护 · 证件照防盗用',
  timetable: '新学期必备 · 课表导入手机日历',
  'pdf-watermark': '作业与论文 · 一键加署名水印',
  photo: '考试报名 · 照片改尺寸压大小',
  files: '文档处理 · PDF 合并拆分与互转',
};

const BENTO_SPECS: Partial<Record<ToolID, string[]>> = {
  'pdf-merge-split': ['支持 50MB~100MB 大课件合并', '按页码范围拆分或每页导出单份', '纯浏览器本地内存处理零上传'],
  'photo-check': ['一键诊断 480×640、KB 大小与底色', '内置考研/四六级/教资标准库', '支持一键修复与无损导出'],
  'pdf-compress': ['轻度/推荐/极限三档压缩', '纯本地 Canvas 重采样', '体积不减自动拦截保留原文件'],
  'web-to-apk': ['纯前端免服务器注入与签名 APK', '一键导出 PWA 清单与离线 HTML', '支持 Android Studio Gradle 源码包'],
  'ppt-generate': ['支持开题/大作业/竞赛路演大纲', 'Apple 深空黑与学术蓝视觉风格', '导出标准 PPTX 可在 Office/WPS 编辑'],
  'pdf-form': ['内置高校奖学金、缓考与假条模板', '支持 Canvas 手写电子签名板', '一键导出标准 A4 审批 PDF 打印'],
  'image-compress': ['严格逼近目标 KB (≤ 50KB/100KB)', 'Squoosh 风格双视口滑块实时对比', 'WebP/JPEG 格式自适应，画质无损'],
  flowchart: ['基于 Mermaid 12 极速矢量渲染', '涵盖业务流、二分算法、TCP时序与ER图', '一键导出无限放大不失真的矢量 SVG'],
  'media-converter': ['纯本地 Web Audio 极速转 MP3', '支持音频时间区间精确截取裁剪', '短视频截取生成免播放器动态 GIF'],
  'ppt-extract': ['自动标出在第几页 PPT', '手机可直接长按存相册', '也可一键打包下载全部'],
  'image-watermark': ['写上「仅供XX使用」防盗用', '给作业照片加姓名日期', '手机长按即可保存新图'],
  timetable: ['支持单双周与自定义周次', '自动提醒上课时间冲突', '导出到手机日历课前提醒'],
  'pdf-watermark': ['全页斜向铺满或居中单行', '文字大小与深浅随时调', '不改原文件，生成新 PDF'],
  photo: ['内置一寸/二寸/四六级规格', '自动把文件压到 100KB 内', '照片不上传，本机直接保存'],
  files: ['多份 PDF 合一或拆成单页', '把歪掉的页面转正或删页', 'PDF 与 Word / PPT / 图片互转'],
};

const QUICK_TASKS: {labelZh: string; labelEn: string; query: string; path: string}[] = [
  {labelZh: '网站一键生成APK', labelEn: 'Web to Android APK', query: '网站转APK', path: '/tools/web-to-apk'},
  {labelZh: '答辩PPT大纲生成', labelEn: 'Defense PPT Outline', query: 'PPT生成', path: '/tools/ppt-generate'},
  {labelZh: 'PDF填表与手写签名', labelEn: 'PDF Form & Sign', query: 'PDF填表', path: '/tools/pdf-form'},
  {labelZh: '照片压到100KB', labelEn: 'Compress to 100KB', query: '图片精准压缩', path: '/tools/image-compress'},
  {labelZh: '论文流程图/时序图', labelEn: 'Mermaid Flowcharts', query: '流程图', path: '/tools/flowchart'},
  {labelZh: '网课视频转MP3', labelEn: 'Lecture Video to MP3', query: '音视频转换', path: '/tools/media-converter'},
  {labelZh: 'PPT课件无损提图', labelEn: 'Extract Slides Images', query: 'PPT图片提取', path: '/tools/ppt-extract'},
  {labelZh: '身份证防盗用水印', labelEn: 'Anti-Theft Watermark', query: '图片加水印', path: '/tools/image-watermark'},
  {labelZh: '大学课程表(.ics)', labelEn: 'College Timetable (.ics)', query: '课程表', path: '/tools/timetable'},
  {labelZh: 'PDF加中文水印', labelEn: 'PDF Watermark', query: 'PDF加水印', path: '/tools/pdf-watermark'},
  {labelZh: 'PDF合并与拆分', labelEn: 'PDF Merge & Split', query: 'PDF合并', path: '/tools/files'},
  {labelZh: '参考文献GB/T 7714', labelEn: 'GB/T 7714 Citations', query: '参考文献', path: '/tools/references'},
  {labelZh: '期末成绩/GPA反推', labelEn: 'GPA Target Score', query: 'GPA', path: '/tools/grades'},
];

// 默认在 Springboard 展示的前 16 款高频工具 ID
const SPRINGBOARD_DEFAULT_IDS: ToolID[] = [
  'photo',
  'pdf-merge-split',
  'photo-check',
  'pdf-compress',
  'ppt-extract',
  'timetable',
  'files',
  'handwrite',
  'ai',
  'image-watermark',
  'pdf-watermark',
  'references',
  'sheets',
  'stitch',
  'grades',
  'material-collector',
];

const HIGH_FREQ_STUDENT_TOOLS: {id: ToolID; benefit: string}[] = [
  {id: 'image-compress', benefit: '照片太大传不上？一键压到 100KB'},
  {id: 'timetable', benefit: '大学课表一键导入手机日历提醒'},
  {id: 'ppt-extract', benefit: '老师课件 PPT 高清图片一键提取'},
  {id: 'image-watermark', benefit: '身份证/学生证一键加防盗水印'},
  {id: 'references', benefit: '毕业论文 GB/T 7714 格式化'},
  {id: 'material-collector', benefit: '班委收作业按名单自动核对'},
  {id: 'grades', benefit: '期末考多少分不挂科 / GPA反推'},
  {id: 'web-to-apk', benefit: '个人主页或课表生成安卓安装包'},
  {id: 'pdf-form', benefit: 'PDF 缓考请假表免打印电子签名'},
  {id: 'flowchart', benefit: '论文算法 Mermaid 流程图制作'},
  {id: 'media-converter', benefit: '网课视频提取 MP3 与动图 GIF'},
  {id: 'stitch', benefit: '多张聊天记录与作业长图拼接'},
];

export default function Home({navigate}: {navigate: (e: React.MouseEvent<HTMLAnchorElement>) => void}) {
  const { t, dict, lang } = useI18n();
  const isEn = lang === 'en-US';
  const getToolName = (id: string, fallback: string) => dict.tools[id]?.name || fallback;
  const getToolTask = (id: string, fallback: string) => dict.tools[id]?.task || fallback;
  const getGroupLabel = (group: string) => (isEn && GROUP_NAMES_EN[group]) ? GROUP_NAMES_EN[group] : group;
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [showAllIcons, setShowAllIcons] = useState(false);
  const [showAllSpotlight, setShowAllSpotlight] = useState(false);
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [feedMode, setFeedMode] = useState<'foryou' | 'all'>('foryou');
  const [clockText, setClockText] = useState('09:41');
  const [showcaseTab, setShowcaseTab] = useState<number>(0);
  const [showcasePhotoBg, setShowcasePhotoBg] = useState<'blue' | 'white' | 'red'>('blue');
  const capability = useMemo(() => evaluateImmersionCapability(), []);
  const [themeMode, setThemeMode] = useState<VisualThemeMode>(() => loadSavedThemeMode());
  const [activeTier, setActiveTier] = useState<ImmersionTier>(() =>
    resolveEffectiveTier(loadSavedThemeMode(), capability),
  );
  const [pulseCount, setPulseCount] = useState<number>(0);
  const [liveFps, setLiveFps] = useState<number>(() => (capability.targetFps > 0 ? capability.targetFps : 60));
  const [recent, setRecent] = useState(() => {
    try {
      return recentTools(localStorage);
    } catch {
      return [];
    }
  });
  const [pinned, setPinned] = useState<string[]>(() => getStoredPinnedTools());

  useEffect(() => {
    const handlePinnedChange = (e: Event) => {
      const custom = e as CustomEvent<string[]>;
      if (custom.detail) setPinned(custom.detail);
      else setPinned(getStoredPinnedTools());
    };
    window.addEventListener('novip:pinned-tools-change', handlePinnedChange);
    return () => window.removeEventListener('novip:pinned-tools-change', handlePinnedChange);
  }, []);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const springboardSectionRef = useRef<HTMLElement>(null);
  const groupedListRef = useRef<HTMLDivElement>(null);
  const isMobileDevice = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);

  useSpatialInteractions({
    enableCardTilt: themeMode !== 'minimal',
    prefersReducedMotion: capability.prefersReducedMotion,
  });

  useStaggerReveal(
    springboardSectionRef,
    '.x-foryou-card, .ios-springboard-item',
    [feedMode, showAllIcons, activeScenario],
  );

  useStaggerReveal(
    groupedListRef,
    '.ios-list-row',
    [activeGroup, activeScenario],
  );

  const handleChangeThemeMode = useCallback(
    (nextMode: VisualThemeMode) => {
      setThemeMode(nextMode);
      saveThemeMode(nextMode);
      setActiveTier(resolveEffectiveTier(nextMode, capability));
    },
    [capability],
  );

  const handleAutoDowngrade = useCallback((nextTier: ImmersionTier) => {
    setActiveTier(nextTier);
  }, []);

  const handleTriggerPulse = useCallback(() => {
    setPulseCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onModeChange = (e: Event) => {
      const mode = (e as CustomEvent<{mode?: VisualThemeMode}>).detail?.mode;
      if (mode === 'immersive' || mode === 'daylight' || mode === 'minimal') {
        setThemeMode(mode);
        setActiveTier(mode === 'minimal' ? 'minimal' : capability.tier);
      }
    };
    const onFpsUpdate = (e: Event) => {
      const fps = (e as CustomEvent<{fps?: number}>).detail?.fps;
      if (typeof fps === 'number' && fps > 0) {
        setLiveFps(fps);
      }
    };
    window.addEventListener('novip:visual-mode-change', onModeChange);
    window.addEventListener('novip:immersion-fps', onFpsUpdate);
    return () => {
      window.removeEventListener('novip:visual-mode-change', onModeChange);
      window.removeEventListener('novip:immersion-fps', onFpsUpdate);
    };
  }, [capability.tier]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setClockText(`${hh}:${mm}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, []);

  const forYouFeed = useMemo(() => generateForYouFeed(), [recent]);
  const grokIntent = useMemo(() => resolveGrokIntent(query), [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((event.key === '/' && !isEditing) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 基础搜索过滤
  const rawFound = searchTools(query);

  // 场景联动过滤
  const currentScenarioObj = activeScenario
    ? CAMPUS_SCENARIOS.find((s) => s.id === activeScenario)
    : null;

  const found = currentScenarioObj && !query.trim()
    ? rawFound.filter((t) => currentScenarioObj.toolIds.includes(t.id))
    : rawFound;

  const filteredGroups = activeGroup === 'all' ? GROUPS : GROUPS.filter((g) => g === activeGroup);
  const spotlightTools = SPOTLIGHT_IDS.map((id) => tools.find((t) => t.id === id)).filter(
    (t): t is (typeof tools)[number] => Boolean(t),
  );

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      setQuery('');
      return;
    }
    if (event.key === 'Enter' && query.trim()) {
      if (grokIntent) {
        event.preventDefault();
        const primary = tools.find((t) => t.id === grokIntent.primaryToolId);
        if (primary) {
          history.pushState(null, '', primary.path);
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.scrollTo({top: 0});
          return;
        }
      }
      if (found.length > 0) {
        event.preventDefault();
        const first = found[0];
        history.pushState(null, '', first.path);
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.scrollTo({top: 0});
      }
    }
  };

  // 桌面网格动态联动
  type ToolItem = (typeof tools)[number];
  let springboardList: readonly ToolItem[] = tools;
  if (query.trim()) {
    springboardList = found;
  } else if (currentScenarioObj) {
    springboardList = currentScenarioObj.toolIds
      .map((id) => tools.find((t) => t.id === id))
      .filter((t): t is (typeof tools)[number] => Boolean(t));
  } else if (!showAllIcons) {
    springboardList = SPRINGBOARD_DEFAULT_IDS.map((id) => tools.find((t) => t.id === id)).filter(
      (t): t is (typeof tools)[number] => Boolean(t),
    );
  }

  const triggerToast = (msg: string) => {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const Evt = window.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if (Evt) {
          window.dispatchEvent(new Evt('novip:toast', {detail: {message: msg}}));
        }
      }
    } catch {
      /* Safe ignore */
    }
  };

  return (
    <ToolPage
      title="大学生，别花冤枉钱。"
      description="遇到开会员、充积分、带水印、强制扫码登录的套路？先来 NOVIP 看看。文件转换、报名照片、PDF 与图片水印、课表日历、文献格式等纯本地工具，打开即用。"
      id="home"
    >
      <section className="novip20-launch" aria-label="NOVIP 2.0 新功能速览">
        <strong>✦ NOVIP 2.0 · 五个新工具已加入</strong>
        <p>更好地学习、管理时间与生活费。免费、无强制登录、无水印，数据优先留在你的设备上。</p>
        <div className="novip20-launch-links">
          <a href="/tools/wrongbook" onClick={navigate}>📚 错题复习</a>
          <a href="/tools/campus-budget" onClick={navigate}>💰 生活费预算</a>
          <a href="/tools/internship-hours" onClick={navigate}>⏱ 实习工时</a>
          <a href="/tools/priority-matrix" onClick={navigate}>✅ 四象限任务</a>
          <a href="/tools/defense-pacer" onClick={navigate}>🎤 答辩计时</a>
        </div>
      </section>
      {/* NOVIP Design Evolution — 震撼而清晰的全新首屏 (3秒懂、强聚焦、实物演示 + Active Theory 级沉浸式粒子场) */}
      <section
        className={`novip-hero-evolution${themeMode !== 'daylight' ? ' is-immersive-hero' : ' is-daylight-hero'}`}
        aria-label="NOVIP 核心价值"
      >
        {(typeof document === 'undefined' ||
          !document.querySelector('.novip-global-immersion-shell')) && (
          <ImmersionStage
            capability={capability}
            activeTier={activeTier}
            themeMode={themeMode}
            pulseCount={pulseCount}
            onAutoDowngrade={handleAutoDowngrade}
            onFpsSample={setLiveFps}
          />
        )}

        {/* 1. iPhone iOS 18 状态栏与灵动岛胶囊 (可展开交互式状态条) */}
        <div className="ios-status-bar-strip" aria-label="iPhone 状态栏与灵动岛">
          <div className="ios-status-left" aria-hidden="true">
            <span className="ios-status-time">{clockText}</span>
            <svg className="ios-status-loc" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
            </svg>
          </div>

          {!islandExpanded && (
            <div
              className="ios-dynamic-island ios-dynamic-island--clickable"
              aria-label="NOVIP 运行状态与隐私保护"
              role="button"
              tabIndex={0}
              onClick={() => setIslandExpanded(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIslandExpanded(true);
                }
              }}
              title="点击展开查看本地运行与隐私保护状态"
            >
              <div className="ios-island-left">
                <span className="ios-island-lens" aria-hidden="true" />
                <span className="ios-pulse-dot" aria-hidden="true" />
                <span className="ios-island-tag">{dict.home.island.tag}</span>
                <span className="ios-island-text-desktop">{dict.home.island.desktopText}</span>
                <span className="ios-island-text-mobile">{dict.home.island.mobileText}</span>
              </div>
              <div className="ios-island-right">
                <span className="ios-island-chip">{t('home.island.toolsChip', { count: PUBLIC_TOOL_COUNT })}</span>
                <span className="ios-island-expand-text" style={{display: 'inline-flex', alignItems: 'center', gap: 2}}>
                  {isEn ? 'Details' : '展开详情'} <ChevronDown size={13} />
                </span>
              </div>
            </div>
          )}

          <div className="ios-status-right" aria-hidden="true">
            {/* Cellular Bars */}
            <svg width="16" height="12" viewBox="0 0 18 12" fill="currentColor">
              <rect x="1" y="8" width="2.8" height="4" rx="0.8" />
              <rect x="5.2" y="6" width="2.8" height="6" rx="0.8" />
              <rect x="9.4" y="3.5" width="2.8" height="8.5" rx="0.8" />
              <rect x="13.6" y="1" width="2.8" height="11" rx="0.8" />
            </svg>
            {/* Wi-Fi */}
            <svg width="15" height="12" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6.5a16 16 0 0 1 20 0" />
              <path d="M5.5 10.5a11 11 0 0 1 13 0" />
              <path d="M9.5 14.5a5 5 0 0 1 5 0" />
              <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            {/* Battery */}
            <div className="ios-status-battery">
              <div className="ios-status-battery-body">
                <div className="ios-status-battery-fill" />
              </div>
              <div className="ios-status-battery-cap" />
            </div>
          </div>
        </div>

        <AdaptiveDialog
          open={islandExpanded}
          onClose={() => setIslandExpanded(false)}
          ariaLabel={isEn ? "Privacy Protection Guarantee" : "隐私保护面板"}
          className="ios-dynamic-island-expanded-card"
          title={
            <>
              <span className="ios-pulse-dot" aria-hidden="true" />
              <span>{isEn ? "NOVIP Privacy & Security Guarantee" : "NOVIP 隐私与安全承诺"}</span>
            </>
          }
          closeLabel={isEn ? "Close Panel ✕" : "收起面板 ✕"}
        >
          <div className="ios-island-status-grid">
            <div className="ios-island-status-cell">
              <strong>{dict.home.island.status1Title}</strong>
              <span>{dict.home.island.status1Desc}</span>
            </div>
            <div className="ios-island-status-cell">
              <strong>{dict.home.island.status2Title}</strong>
              <span>{dict.home.island.status2Desc}</span>
            </div>
            <div className="ios-island-status-cell">
              <strong>{dict.home.island.status3Title}</strong>
              <span>{dict.home.island.status3Desc}</span>
            </div>
            <div className="ios-island-status-cell">
              <strong>{dict.home.island.status4Title}</strong>
              <span>{dict.home.island.status4Desc}</span>
            </div>
          </div>
          <div className="ios-island-pwa-box">
            <strong>{dict.home.island.pwaTitle}</strong>
            {dict.home.island.pwaDesc}
          </div>
        </AdaptiveDialog>

        <ImmersionHeroCore
          capability={capability}
          activeTier={activeTier}
          themeMode={themeMode}
          fps={liveFps}
          onChangeThemeMode={handleChangeThemeMode}
          onTriggerPulse={handleTriggerPulse}
        />

        <div className="novip-hero-content">
          <h1 className="novip-hero-title">
            <BlurSplitText text={dict.home.hero.title} chunks={dict.home.hero.chunks} />
          </h1>
          <p className="novip-hero-subtitle">
            {t('home.hero.subtitle', { count: PUBLIC_TOOL_COUNT })}
            <span className="novip-hero-highlight">{dict.home.hero.highlight}</span>
          </p>
          <div className="novip-hero-metrics-bar" aria-label="核心运行指标">
            <span className="novip-metric-pill">
              <CountUpMetric value={tools.length} />
              <span>{dict.home.hero.metricTools}</span>
            </span>
            <span className="novip-metric-divider" aria-hidden="true" />
            <span className="novip-metric-pill">
              <CountUpMetric value={100} suffix="%" />
              <span>{dict.home.hero.metricLocal}</span>
            </span>
            <span className="novip-metric-divider" aria-hidden="true" />
            <span className="novip-metric-pill">
              <CountUpMetric value={0} />
              <span>{dict.home.hero.metricFree}</span>
            </span>
          </div>
          <div className="novip-hero-actions-row">
            <a href="#flagship-tools" className="novip-btn-tactile novip-btn-tactile--primary">
              <Zap size={16} />
              <span>{isEn ? "⚡ Select Tools" : "⚡ 快速挑选工具"}</span>
            </a>
            <a href="/tools/ai" onClick={navigate} className="novip-btn-tactile novip-btn-tactile--secondary">
              <Sparkles size={16} />
              <span>{isEn ? "🤖 NOVIP AI Guide" : "🤖 NOVIP 智能向导"}</span>
            </a>
          </div>
          <div className="novip-trust-strip" aria-label="安全与隐私承诺">
            <span className="novip-trust-item">
              <Check size={14} />
              <span>{isEn ? "100% Local In-Browser" : "100% 浏览器本地处理"}</span>
            </span>
            <span className="novip-trust-item">
              <Check size={14} />
              <span>{isEn ? "Zero Cloud Upload" : "绝不上传文件与原件"}</span>
            </span>
            <span className="novip-trust-item">
              <Check size={14} />
              <span>{isEn ? "100% Watermark-Free" : "导出永久无任何水印"}</span>
            </span>
            <span className="novip-trust-item">
              <Check size={14} />
              <span>{isEn ? "Ad-Free & No Paywall" : "零广告免充值免登录"}</span>
            </span>
          </div>
        </div>

        {/* 核心产品交互式实物演示 (The Chess.com-Tier Board Equivalent) */}
        <div className="novip-showcase-box" aria-label="四大典型场景实时交互演示">
          <div className="novip-showcase-tabs" role="tablist">
            <button
              type="button"
              className={`novip-showcase-tab${showcaseTab === 0 ? ' active' : ''}`}
              onClick={() => setShowcaseTab(0)}
              role="tab"
              aria-selected={showcaseTab === 0}
            >
              <span>📸 {dict.home.showcase.tabPhoto}</span>
            </button>
            <button
              type="button"
              className={`novip-showcase-tab${showcaseTab === 1 ? ' active' : ''}`}
              onClick={() => setShowcaseTab(1)}
              role="tab"
              aria-selected={showcaseTab === 1}
            >
              <span>📑 {dict.home.showcase.tabPdf}</span>
            </button>
            <button
              type="button"
              className={`novip-showcase-tab${showcaseTab === 2 ? ' active' : ''}`}
              onClick={() => setShowcaseTab(2)}
              role="tab"
              aria-selected={showcaseTab === 2}
            >
              <span>✍️ {dict.home.showcase.tabGrades}</span>
            </button>
            <button
              type="button"
              className={`novip-showcase-tab${showcaseTab === 3 ? ' active' : ''}`}
              onClick={() => setShowcaseTab(3)}
              role="tab"
              aria-selected={showcaseTab === 3}
            >
              <span>🗜️ {dict.home.showcase.tabCompress}</span>
            </button>
          </div>

          <div className="novip-showcase-body">
            {showcaseTab === 0 && (
              <>
                <div className="novip-showcase-stage">
                  <div
                    style={{
                      width: 110,
                      height: 154,
                      borderRadius: 10,
                      background:
                        showcasePhotoBg === 'blue'
                          ? '#0071e3'
                          : showcasePhotoBg === 'red'
                          ? '#d70015'
                          : '#ffffff',
                      border: '2px solid rgba(0,0,0,0.1)',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.85)',
                        marginBottom: 10,
                      }}
                    />
                    <div
                      style={{
                        width: 82,
                        height: 48,
                        borderRadius: '24px 24px 0 0',
                        background: 'rgba(255,255,255,0.7)',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(0,0,0,0.45)',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    >
                      一寸 295×413
                    </span>
                  </div>
                  <div style={{display: 'flex', gap: 8, marginTop: 12}}>
                    <button
                      type="button"
                      className={`novip-showcase-bg-btn blue${showcasePhotoBg === 'blue' ? ' active' : ''}`}
                      onClick={() => setShowcasePhotoBg('blue')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: showcasePhotoBg === 'blue' ? '2px solid #0071e3' : '1px solid #cbd5e1',
                        background: showcasePhotoBg === 'blue' ? 'rgba(0,113,227,0.1)' : '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: '#0071e3',
                      }}
                    >
                      ● 蓝底
                    </button>
                    <button
                      type="button"
                      className={`novip-showcase-bg-btn white${showcasePhotoBg === 'white' ? ' active' : ''}`}
                      onClick={() => setShowcasePhotoBg('white')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: showcasePhotoBg === 'white' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                        background: showcasePhotoBg === 'white' ? 'rgba(15,23,42,0.06)' : '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: '#334155',
                      }}
                    >
                      ○ 白底
                    </button>
                    <button
                      type="button"
                      className={`novip-showcase-bg-btn red${showcasePhotoBg === 'red' ? ' active' : ''}`}
                      onClick={() => setShowcasePhotoBg('red')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: showcasePhotoBg === 'red' ? '2px solid #d70015' : '1px solid #cbd5e1',
                        background: showcasePhotoBg === 'red' ? 'rgba(215,0,21,0.1)' : '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: '#d70015',
                      }}
                    >
                      ● 红底
                    </button>
                  </div>
                </div>
                <div className="novip-showcase-info">
                  <span className="novip-showcase-badge">四六级 · 考研 · 教资必备</span>
                  <h4>考试报名照一键换底 & 锁 100KB</h4>
                  <p>
                    点一下即可预览蓝底、白底、红底效果，内置一寸、二寸和全国各级考试官方尺寸，毫秒级二分算法严格将文件大小锁定在 100KB 以内，绝不上传云端。
                  </p>
                  <a href="/tools/id-photo" onClick={navigate} className="novip-btn-tactile novip-btn-tactile--accent">
                    <span>⚡ 制作报名照 →</span>
                  </a>
                </div>
              </>
            )}

            {showcaseTab === 1 && (
              <>
                <div className="novip-showcase-stage">
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 220}}>
                    <div className="novip-showcase-doc-item" style={{padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11, display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#0f172a', fontWeight: 600}}>📄 01_课程设计封面.pdf</span>
                      <span style={{color: '#334155', fontWeight: 600}}>第 1 页</span>
                    </div>
                    <div className="novip-showcase-doc-item" style={{padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11, display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#0f172a', fontWeight: 600}}>📄 02_实验正文与原理.pdf</span>
                      <span style={{color: '#334155', fontWeight: 600}}>2-8 页</span>
                    </div>
                    <div className="novip-showcase-doc-item" style={{padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11, display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#0f172a', fontWeight: 600}}>📄 03_仿真数据图表.pdf</span>
                      <span style={{color: '#334155', fontWeight: 600}}>9-12 页</span>
                    </div>
                    <div className="novip-showcase-doc-arrow" style={{textAlign: 'center', fontSize: 13, color: '#0071e3', fontWeight: 700, margin: '2px 0'}}>
                      ↓ 顺序合并 + 自动加页码
                    </div>
                    <div className="novip-showcase-doc-merged" style={{padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1.5px solid #0071e3', fontSize: 12, fontWeight: 700, color: '#0071e3', textAlign: 'center'}}>
                      📑 完整期末实验大作业.pdf (共12页)
                    </div>
                  </div>
                </div>
                <div className="novip-showcase-info">
                  <span className="novip-showcase-badge">实验报告 · 毕业设计 · 材料汇总</span>
                  <h4>多份作业按顺序合并、转换与加页码</h4>
                  <p>
                    期末把封面、正文、附录和代码截图按顺序合成为一份标准 PDF，支持批量转图片或 Word，零格式错乱，告别打印店排队。
                  </p>
                  <a href="/tools/files" onClick={navigate} className="novip-btn-tactile novip-btn-tactile--accent">
                    <span>⚡ 去合并作业 →</span>
                  </a>
                </div>
              </>
            )}

            {showcaseTab === 2 && (
              <>
                <div className="novip-showcase-stage" style={{background: '#fcfbf7'}}>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 240,
                      padding: '16px 14px',
                      background: '#fffdfa',
                      borderRadius: 8,
                      border: '1px solid #e2d9cc',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                      backgroundImage: 'repeating-linear-gradient(transparent, transparent 22px, #e8dfd5 22px, #e8dfd5 23px)',
                      lineHeight: '23px',
                      fontSize: 13,
                      color: '#1a1f36',
                      fontFamily: '"Klee One", "PingFang SC", cursive, sans-serif',
                    }}
                  >
                    高等数学期末复习笔记：
                    <br />
                    定理：闭区间上连续函数必有界且能取得最大值与最小值。
                  </div>
                </div>
                <div className="novip-showcase-info">
                  <span className="novip-showcase-badge">14款真手写 · 15款校园纸张</span>
                  <h4>打字一秒变大学软面抄真手写</h4>
                  <p>
                    需要手写读书笔记或课后作业？打字直接生成逼真大学软面抄、康奈尔笔记或信笺纸，字间距随机微调防雷同，导出高清图片或 PDF。
                  </p>
                  <a href="/tools/handwrite" onClick={navigate} className="novip-btn-tactile novip-btn-tactile--accent">
                    <span>⚡ 去落笔写笔记 →</span>
                  </a>
                </div>
              </>
            )}

            {showcaseTab === 3 && (
              <>
                <div className="novip-showcase-stage">
                  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div className="novip-showcase-stat-card before" style={{textAlign: 'center', padding: '12px 14px', background: '#fff', borderRadius: 10, border: '1px solid #cbd5e1'}}>
                      <div style={{fontSize: 12, color: '#334155', fontWeight: 600}}>手机原图</div>
                      <div style={{fontSize: 17, fontWeight: 800, color: '#e53935'}}>4.2 MB</div>
                      <div style={{fontSize: 11, color: '#b91c1c', fontWeight: 600}}>系统提示超出大小</div>
                    </div>
                    <ArrowRight size={20} color="#0071e3" />
                    <div className="novip-showcase-stat-card after" style={{textAlign: 'center', padding: '12px 14px', background: '#eff6ff', borderRadius: 10, border: '1.5px solid #0071e3'}}>
                      <div style={{fontSize: 11, color: '#0071e3', fontWeight: 600}}>二分精准压缩</div>
                      <div style={{fontSize: 16, fontWeight: 750, color: '#059669'}}>96 KB</div>
                      <div style={{fontSize: 10, color: '#059669', fontWeight: 600}}>✓ 严格 ≤ 100KB</div>
                    </div>
                  </div>
                </div>
                <div className="novip-showcase-info">
                  <span className="novip-showcase-badge">学信网 · 考研网 · 资格考试一次过</span>
                  <h4>照片太大传不上去？一键精准压到 100KB</h4>
                  <p>
                    学校系统只让传 100KB 以内的照片？Squoosh 级端侧对比算法，智能二分逼近目标大小，画质无损且体积缩减 97% 以上。
                  </p>
                  <a href="/tools/image-compress" onClick={navigate} className="novip-btn-tactile novip-btn-tactile--accent">
                    <span>⚡ 去精准压缩 →</span>
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Apple.com Flagship Hero Action & Spec Ribbon */}
      {!query.trim() && activeGroup === 'all' && !activeScenario && (
        <div className="apple-hero-ribbon" aria-label="核心服务承诺与快捷直达">
          <div className="apple-hero-cta-group">
            <a
              href="/tools/pdf-merge-split"
              className="apple-hero-primary-btn"
              onClick={navigate}
            >
              {dict.home.ribbon.btnPdf}
            </a>
            <a
              href="/tools/photo-check"
              className="apple-hero-link"
              onClick={navigate}
            >
              <span>{dict.home.ribbon.btnPhoto}</span>
              <span aria-hidden="true">›</span>
            </a>
            <a
              href="/tools/pdf-compress"
              className="apple-hero-link"
              onClick={navigate}
            >
              <span>{dict.home.ribbon.btnCompress}</span>
              <span aria-hidden="true">›</span>
            </a>
          </div>
          <div className="apple-hero-specs" aria-hidden="true">
            <span>{dict.home.ribbon.spec1}</span>
            <span className="apple-hero-dot">·</span>
            <span>{dict.home.ribbon.spec2}</span>
            <span className="apple-hero-dot">·</span>
            <span>{dict.home.ribbon.spec3}</span>
          </div>
        </div>
      )}

      {/* 新生与大二女生高频场景一键直达 */}
      {!query.trim() && activeGroup === 'all' && !activeScenario && (
        <section className="novip-female-scenarios" aria-label="日常最常办的四件事">
          <div className="novip-scenario-header">
            <div className="novip-scenario-title-group">
              <span className="novip-scenario-badge">{dict.home.everyday.badge}</span>
              <h2 className="novip-scenario-title">{dict.home.everyday.title}</h2>
            </div>
            <span className="novip-scenario-sub">{dict.home.everyday.subtitle}</span>
          </div>
          <div className="novip-scenario-cards">
            {/* 1. 做报名照 / 换底色 */}
            <a
              href="/tools/id-photo"
              className="novip-scenario-card photo"
              onClick={navigate}
            >
              <div className="novip-scenario-icon">
                <IosAppIcon id="photo" size={48} />
              </div>
              <div className="novip-scenario-content">
                <strong>{dict.home.everyday.card1Title}</strong>
                <p>{dict.home.everyday.card1Desc}</p>
                <span className="novip-scenario-pill">{dict.home.everyday.card1Pill}</span>
              </div>
              <span className="novip-scenario-arrow">{dict.home.everyday.card1Cta}</span>
            </a>

            {/* 2. 交作业 / 拼文件 */}
            <a
              href="/tools/files"
              className="novip-scenario-card files"
              onClick={navigate}
            >
              <div className="novip-scenario-icon">
                <IosAppIcon id="files" size={48} />
              </div>
              <div className="novip-scenario-content">
                <strong>{dict.home.everyday.card2Title}</strong>
                <p>{dict.home.everyday.card2Desc}</p>
                <span className="novip-scenario-pill">{dict.home.everyday.card2Pill}</span>
              </div>
              <span className="novip-scenario-arrow">{dict.home.everyday.card2Cta}</span>
            </a>

            {/* 3. 真实手写 */}
            <a
              href="/tools/handwrite"
              className="novip-scenario-card handwrite"
              onClick={navigate}
            >
              <div className="novip-scenario-icon">
                <IosAppIcon id="handwrite" size={48} />
              </div>
              <div className="novip-scenario-content">
                <strong>{dict.home.everyday.card3Title}</strong>
                <p>{dict.home.everyday.card3Desc}</p>
                <span className="novip-scenario-pill">{dict.home.everyday.card3Pill}</span>
              </div>
              <span className="novip-scenario-arrow">{dict.home.everyday.card3Cta}</span>
            </a>

            {/* 4. AI 学业向导 */}
            <a
              href="/tools/ai"
              className="novip-scenario-card ai"
              onClick={navigate}
            >
              <div className="novip-scenario-icon">
                <IosAppIcon id="ai" size={48} />
              </div>
              <div className="novip-scenario-content">
                <strong>{dict.home.everyday.card4Title}</strong>
                <p>{dict.home.everyday.card4Desc}</p>
                <span className="novip-scenario-pill">{dict.home.everyday.card4Pill}</span>
              </div>
              <span className="novip-scenario-arrow">{dict.home.everyday.card4Cta}</span>
            </a>
          </div>
        </section>
      )}

      {/* 2. iOS Bento Widgets (小组件群：今日速选 + 隐私盾牌 + 快捷指令) */}
      {!query.trim() && activeGroup === 'all' && !activeScenario && (
        <section className="ios-widgets-grid" aria-label="iOS 灵动小组件">
          {/* Widget 1: 今日速选 · 大学生高频 */}
          <div className="ios-widget-card">
            <div className="ios-widget-head">
              <div className="ios-widget-title-group">
                <span className="ios-widget-date">{isEn ? 'TODAY · College Essentials' : 'TODAY · 大一速选'}</span>
                <h2 className="ios-widget-title">{isEn ? 'Featured Utilities & Recent Additions' : '精选高频 & 近期上新'}</h2>
              </div>
              <button
                type="button"
                className="ios-widget-expand-btn"
                onClick={() => setShowAllSpotlight((prev) => !prev)}
              >
                {showAllSpotlight ? (isEn ? 'Collapse (6 Flagships)' : '收起 (6 款旗舰)') : (isEn ? `All ${spotlightTools.length} Flagships ❯` : `全部 ${spotlightTools.length} 款旗舰 ❯`)}
              </button>
            </div>
            <div className="ios-spotlight-quick-grid">
              {(showAllSpotlight ? spotlightTools : spotlightTools.slice(0, 6)).map((t) => {
                const spec = BENTO_SPECS[t.id]?.[0];
                return (
                  <a
                    key={t.id}
                    href={t.path}
                    className="ios-spotlight-quick-item"
                    onClick={navigate}
                  >
                    <div className="ios-spotlight-item-top">
                      <IosAppIcon id={t.id} size={36} />
                      {NEW_TOOL_IDS.has(t.id) && <span className="ios-badge-pill">NEW</span>}
                      {!NEW_TOOL_IDS.has(t.id) && HOT_TOOL_IDS.has(t.id) && (
                        <span className="ios-badge-pill hot">HOT</span>
                      )}
                    </div>
                    <div className="ios-spotlight-item-name">{getToolName(t.id, t.name)}</div>
                    <div className="ios-spotlight-item-sub">
                      {isEn ? (dict.tools[t.id]?.task || t.task) : (BENTO_EYEBROWS[t.id] || spec || t.group)}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Widget 2: 纯本地隐私盾牌 */}
          <div className="ios-widget-card ios-privacy-widget">
            <div className="ios-widget-head">
              <span className="ios-widget-date">SECURITY</span>
              <span className="ios-widget-subtitle">{isEn ? 'System Sandbox' : '系统沙盒'}</span>
            </div>
            <div className="ios-privacy-ring-wrap">
              <div className="ios-privacy-badge-icon" aria-hidden="true">
                <ShieldCheck size={24} />
              </div>
              <div>
                <div className="ios-privacy-status-text">{isEn ? 'In-Browser Memory Processing' : '纯浏览器内存处理'}</div>
                <div className="ios-privacy-status-sub">{isEn ? 'Works Completely Offline' : '断网离线同样可用'}</div>
              </div>
            </div>
            <ul className="ios-privacy-checklist">
              <li>{isEn ? 'Zero upload of files or assignments' : '不上传文件与作业原件'}</li>
              <li>{isEn ? 'No registration, no mobile number asked' : '不强制注册、不索取手机号'}</li>
              <li>{isEn ? '100% watermark-free export' : '导出下载 100% 无任何水印'}</li>
            </ul>
          </div>

          {/* Widget 3: 快捷指令与最近使用 */}
          <div className="ios-widget-card ios-shortcuts-widget">
            <div className="ios-widget-head">
              <span className="ios-widget-date">SHORTCUTS</span>
              <span className="ios-widget-subtitle">{recent.length ? (isEn ? 'Recent' : '最近使用') : (isEn ? 'Shortcuts' : '快捷指令')}</span>
            </div>
            {recent.length > 0 ? (
              <div className="ios-recent-list-mini">
                {recent.slice(0, 3).map((id) => {
                  const t = tools.find((item) => item.id === id);
                  return t ? (
                    <a
                      key={id}
                      href={t.path}
                      className="ios-recent-item-mini"
                      onClick={navigate}
                    >
                      <IosAppIcon id={t.id} size={24} />
                      <span className="truncate">{t.name}</span>
                    </a>
                  ) : null;
                })}
                <button
                  type="button"
                  className="ios-widget-action-btn"
                  onClick={() => {
                    try {
                      localStorage.removeItem(RECENT_KEY);
                    } catch {}
                    setRecent([]);
                    triggerToast(isEn ? 'Cleared recent history' : '已清除最近使用记录');
                  }}
                >
                  {isEn ? 'Clear History' : '清除记录'}
                </button>
              </div>
            ) : (
              <div>
                <p className="ios-recent-empty-hint">
                  {isEn ? 'Recently used tools are automatically saved here for one-click access.' : '打开过的工具会自动记录在这里，方便下次回访一键启动。'}
                </p>
                <a
                  href="/tools/ppt-extract"
                  className="ios-recent-item-mini"
                  onClick={navigate}
                >
                  <IosAppIcon id="ppt-extract" size={24} />
                  <span>{isEn ? 'Try: PPT Extract Images' : '试试：PPT课件提图'}</span>
                </a>
              </div>
            )}
            <div className="novip-hero-strip" style={{marginTop: 8, padding: 0}}>
              <span className="novip-pill-badge accent" style={{fontSize: 11, padding: '2px 8px'}}>
                {t('home.hero.subtitle', { count: PUBLIC_TOOL_COUNT })}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 3. 最近使用工具快捷条带 (若有使用历史则展示) */}
      {recent.length > 0 && (
        <section className="novip-recent-section" aria-label="最近使用的工具">
          <div className="novip-recent-left">
            <span className="novip-recent-label">{isEn ? '⏱️ Recently Used:' : '⏱️ 最近使用：'}</span>
            <div className="novip-recent-chips">
              {recent.map((id) => {
                const t = tools.find((item) => item.id === id);
                return t ? (
                  <a
                    key={`recent-${id}`}
                    href={t.path}
                    className="novip-recent-chip"
                    onClick={navigate}
                  >
                    <IosAppIcon id={t.id} size={20} />
                    <span>{getToolName(t.id, t.name)}</span>
                  </a>
                ) : null;
              })}
            </div>
          </div>
          <button
            type="button"
            className="novip-recent-clear-btn"
            onClick={() => {
              try {
                localStorage.removeItem(RECENT_KEY);
              } catch {}
              setRecent([]);
              triggerToast('已清除最近使用记录');
            }}
          >
            {isEn ? 'Clear ✕' : '清空记录 ✕'}
          </button>
        </section>
      )}

      {/* Pinned Favorite Tools (M-98) */}
      {pinned.length > 0 && !query.trim() && (
        <section className="novip-pinned-section" aria-label="我的常备置顶工具">
          <div className="novip-section-title-wrap">
            <h3 className="novip-section-title">
              <span>{isEn ? '⭐ My Pinned Toolset' : '⭐ 我的常备置顶工具箱'}</span>
            </h3>
            <span className="novip-section-sub">{isEn ? 'Local & Offline Instant Launch' : '本地专属 · 离线秒开'}</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              margin: '12px 0 24px 0',
            }}
          >
            {pinned.map((id) => {
              const t = tools.find((tool) => tool.id === id);
              if (!t) return null;
              return (
                <a
                  key={t.id}
                  href={t.path}
                  onClick={navigate}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 9999,
                    background: 'var(--novip-glass-bg, rgba(255,255,255,0.75))',
                    border: '1px solid rgba(0, 113, 227, 0.3)',
                    color: 'var(--text, #0f172a)',
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'all 0.2s ease',
                  }}
                  className="novip-pinned-chip"
                >
                  <span style={{color: '#f59e0b', fontSize: 13}}>⭐</span>
                  <span>{getToolName(t.id, t.name)}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. 校园四大必备旗舰神器 (高权重 Flagship Cards) */}
      {!query.trim() && activeGroup === 'all' && !activeScenario && (
        <section id="flagship-tools" className="novip-flagship-section" aria-label="校园四大必备神器">
          <div className="novip-section-title-wrap">
            <h3 className="novip-section-title">
              <span>{dict.home.flagship.title}</span>
            </h3>
            <span className="novip-section-sub">{dict.home.flagship.subtitle}</span>
          </div>
          <div className="novip-flagship-grid">
            {/* Flagship 1: 考试报名照 */}
            <a href="/tools/id-photo" className="novip-flagship-card" onClick={navigate}>
              <div>
                <div className="novip-flagship-header">
                  <div className="novip-flagship-icon-box">📸</div>
                  <span className="novip-flagship-tag">新生高频</span>
                </div>
                <h4 className="novip-flagship-title">考试报名照一键换底 & 锁100KB</h4>
                <p className="novip-flagship-desc">
                  四六级、教资、普通话与考研网规格，蓝底/白底/红底一键秒切，自动锁死在 100KB 内，零门槛直传。
                </p>
              </div>
              <div className="novip-flagship-footer">
                <span className="novip-flagship-hint">✓ 纯本地不传相册</span>
                <span className="novip-flagship-cta">去制作 ❯</span>
              </div>
            </a>

            {/* Flagship 2: 交作业与文件 */}
            <a href="/tools/files" className="novip-flagship-card" onClick={navigate}>
              <div>
                <div className="novip-flagship-header">
                  <div className="novip-flagship-icon-box">📑</div>
                  <span className="novip-flagship-tag">期末必备</span>
                </div>
                <h4 className="novip-flagship-title">交作业合并、格式互转与加页码</h4>
                <p className="novip-flagship-desc">
                  多份实验报告按顺序合一，PDF 互转 Word/图片，批量添加整齐页码，排版不乱码，告别打印店排队。
                </p>
              </div>
              <div className="novip-flagship-footer">
                <span className="novip-flagship-hint">✓ 零乱码免登录</span>
                <span className="novip-flagship-cta">去合并 ❯</span>
              </div>
            </a>

            {/* Flagship 3: 真实软面抄手写 */}
            <a href="/tools/handwrite" className="novip-flagship-card" onClick={navigate}>
              <div>
                <div className="novip-flagship-header">
                  <div className="novip-flagship-icon-box">✍️</div>
                  <span className="novip-flagship-tag">救急神器</span>
                </div>
                <h4 className="novip-flagship-title">文字一秒变大学软面抄真手写</h4>
                <p className="novip-flagship-desc">
                  打字直接生成逼真软面抄、康奈尔笔记或信笺纸手写笔记，14款手写真字形与字距错位微瑕防雷同。
                </p>
              </div>
              <div className="novip-flagship-footer">
                <span className="novip-flagship-hint">✓ 15款真实纸张</span>
                <span className="novip-flagship-cta">去落笔 ❯</span>
              </div>
            </a>

            {/* Flagship 4: AI 学业向导 */}
            <a href="/tools/ai" className="novip-flagship-card" onClick={navigate}>
              <div>
                <div className="novip-flagship-header">
                  <div className="novip-flagship-icon-box">🤖</div>
                  <span className="novip-flagship-tag">秒懂意图</span>
                </div>
                <h4 className="novip-flagship-title">期末算分、请假消息与学业向导</h4>
                <p className="novip-flagship-desc">
                  平时分反推期末要考多少分、生病给导员请假消息大白话草拟，秒懂意图并手把手提供最佳解法。
                </p>
              </div>
              <div className="novip-flagship-footer">
                <span className="novip-flagship-hint">✓ 纯端侧秒回答</span>
                <span className="novip-flagship-cta">问问看 ❯</span>
              </div>
            </a>
          </div>
        </section>
      )}

      {/* 5. 大学生高频实用速选 (High-Frequency Utilities Grid · 精选高频 & 近期上新) */}
      {!query.trim() && activeGroup === 'all' && !activeScenario && (
        <section className="novip-highfreq-section" aria-label="精选高频与近期上新">
          <div className="novip-section-title-wrap">
            <h3 className="novip-section-title">
              <span>{isEn ? '🔥 High-Frequency Campus Tools' : '🔥 精选高频 & 近期上新'}</span>
            </h3>
            <span className="novip-section-sub">{isEn ? 'Essential tools for daily coursework, labs, and assignments' : '日常学习、实验与材料整理高频工具'}</span>
          </div>
          <div className="novip-highfreq-grid">
            {HIGH_FREQ_STUDENT_TOOLS.map((item) => {
              const t = tools.find((tool) => tool.id === item.id);
              if (!t) return null;
              return (
                <a
                  key={t.id}
                  href={t.path}
                  className="novip-highfreq-card"
                  onClick={navigate}
                  title={`${t.name}：${item.benefit}`}
                >
                  <IosAppIcon id={t.id} size={36} />
                  <div className="novip-highfreq-info">
                    <div className="novip-highfreq-name">{getToolName(t.id, t.name)}</div>
                    <div className="novip-highfreq-benefit">{isEn ? (HIGH_FREQ_BENEFITS_EN[t.id] || dict.tools[t.id]?.task || item.benefit) : item.benefit}</div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. iPhone Springboard App Icons Grid & X 算法为你推荐 */}
      <section ref={springboardSectionRef} className="ios-springboard-card" aria-label="iPhone 桌面与为你推荐">
        <div className="ios-springboard-header">
          <div className="ios-springboard-title">
            <Grid size={18} color="#007AFF" />
            <span>
              {feedMode === 'foryou' && !query.trim() && !activeScenario
                ? (isEn ? 'For You · Smart Feed' : '为你推荐 · 智能流')
                : (isEn ? 'Home Screen App Icons' : 'iPhone 桌面快捷启动')}
            </span>
            {currentScenarioObj && (
              <span style={{fontSize: 12, color: '#007AFF', fontWeight: 500}}>
                · {currentScenarioObj.name} ({springboardList.length})
              </span>
            )}
          </div>
          {!query.trim() && !activeScenario ? (
            <div className="x-feed-tab-switch" role="tablist" aria-label="推荐模式切换">
              <button
                type="button"
                className={`x-feed-tab-btn${feedMode === 'foryou' ? ' active' : ''}`}
                onClick={() => setFeedMode('foryou')}
                aria-pressed={feedMode === 'foryou'}
              >
                <Sparkles size={13} color={feedMode === 'foryou' ? '#007AFF' : '#8E8E93'} />
                <span>{isEn ? 'For You' : '为你推荐'}</span>
              </button>
              <button
                type="button"
                className={`x-feed-tab-btn${feedMode === 'all' ? ' active' : ''}`}
                onClick={() => setFeedMode('all')}
                aria-pressed={feedMode === 'all'}
              >
                <Grid size={13} color={feedMode === 'all' ? '#007AFF' : '#8E8E93'} />
                <span>{isEn ? 'All Apps' : '全部桌面'}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ios-springboard-toggle-btn"
              onClick={() => setShowAllIcons((prev) => !prev)}
              aria-label={showAllIcons ? '收起桌面图标' : '展开全部桌面图标'}
            >
              {showAllIcons ? (isEn ? 'Collapse (16 Selected)' : '收起 (精选 16 款)') : (isEn ? `Expand All ${PUBLIC_TOOL_COUNT} Apps ❯` : `展开全部 ${PUBLIC_TOOL_COUNT} 款 App ❯`)}
            </button>
          )}
        </div>

        {feedMode === 'foryou' && !query.trim() && !activeScenario ? (
          <div className="x-foryou-grid">
            {forYouFeed.map((item) => {
              const t = tools.find((tool) => tool.id === item.id);
              if (!t) return null;
              return (
                <a
                  key={`foryou-${item.id}`}
                  href={t.path}
                  className="x-foryou-card"
                  onClick={navigate}
                  title={`${t.name}：${t.task}`}
                >
                  <div className="x-foryou-top">
                    <IosAppIcon id={t.id} size={46} />
                    <div className="x-foryou-info">
                      <div className="x-foryou-title-row">
                        <span className="x-foryou-title">{t.name}</span>
                        <span className="x-foryou-badge">{item.badge}</span>
                      </div>
                      <p className="x-foryou-task">{t.task}</p>
                    </div>
                  </div>
                  <div className="x-foryou-bottom">
                    <span className="x-foryou-reason">
                      <Sparkles size={12} />
                      <span>{item.reason}</span>
                    </span>
                    <span className="x-foryou-arrow">→</span>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <>
            <div className="ios-springboard-grid">
              {springboardList.map((t) => {
                const config = TOOL_IOS_CONFIG[t.id];
                const isNew = NEW_TOOL_IDS.has(t.id);
                const isHot = HOT_TOOL_IDS.has(t.id);
                return (
                  <a
                    key={`spring-${t.id}`}
                    href={t.path}
                    className="ios-springboard-item"
                    onClick={navigate}
                    title={`${t.name}：${t.task}`}
                  >
                    <div style={{position: 'relative'}}>
                      <IosAppIcon id={t.id} size={56} />
                      {isNew && <span className="ios-badge-pill">NEW</span>}
                      {!isNew && isHot && <span className="ios-badge-pill hot">HOT</span>}
                    </div>
                    <span className="ios-springboard-label">{getToolName(t.id, config?.shortName || t.name)}</span>
                  </a>
                );
              })}
            </div>
            {!query.trim() && !activeScenario && (
              <div className="ios-springboard-footer">
                <div className="ios-page-dots" aria-hidden="true">
                  <span className={`ios-page-dot${!showAllIcons ? ' active' : ''}`} />
                  <span className={`ios-page-dot${showAllIcons ? ' active' : ''}`} />
                  <span className="ios-page-dot" />
                </div>
                <button
                  type="button"
                  className="ios-springboard-toggle-btn"
                  onClick={() => setShowAllIcons((prev) => !prev)}
                  aria-label={showAllIcons ? '收起桌面图标' : '展开全部桌面图标'}
                >
                  {showAllIcons ? (isEn ? 'Collapse (16 Selected)' : '收起主屏 (精选 16 款)') : (isEn ? `Expand App Library (All ${PUBLIC_TOOL_COUNT}) ❯` : `展开 App 资源库 (全部 ${PUBLIC_TOOL_COUNT} 款) ❯`)}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* NOVIP AI 智能向导入口 (PR #7 深度整合 · 纯端侧极速直达 · 零费用零风险) */}
      <a className="home-ai-entry" href="/tools/ai" onClick={navigate}>
        <span className="home-ai-mark" aria-hidden="true">AI</span>
        <span className="home-ai-copy">
          <strong>{isEn ? 'NOVIP AI Tool Guide' : 'NOVIP AI 工具向导'}</strong>
          <small>{isEn ? 'Describe your task to instantly get recommended free tools and step-by-step guidance · Local AI · Instant' : '描述你的任务，秒速获取针对大学生的免费工具推荐与操作步骤 · 本机智能 · 零等待'}</small>
        </span>
        <span className="home-ai-cta">{isEn ? 'Chat Now ↗' : '立即对话 ↗'}</span>
      </a>

      {/* 4. iOS 18 Spotlight 搜索栏 & xAI Grok 智能意图直达 */}
      <section className="ios-spotlight-section" aria-label="Spotlight 任务搜索">
        <div className="ios-spotlight-box">
          <span className="ios-spotlight-icon" aria-hidden="true">
            <Search size={18} strokeWidth={2.4} />
          </span>
          <input
            id="novip-home-search"
            ref={searchInputRef}
            className="ios-spotlight-input"
            aria-label="搜索工具"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={dict.home.search.placeholder}
          />
          {query ? (
            <button
              type="button"
              className="ios-spotlight-clear-btn"
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
            >
              {isEn ? `Clear (${found.length})` : `清空 (${found.length})`}
            </button>
          ) : !isMobileDevice ? (
            <span className="ios-spotlight-kbd-hint" aria-hidden="true">
              ⌘K
            </span>
          ) : null}
        </div>

        {/* xAI Grok 智能意图直达卡片 */}
        {grokIntent && (
          <div className="grok-intent-container" aria-label="智能意图直达求解">
            <div className="grok-intent-card">
              <div className="grok-intent-header">
                <span className="grok-intent-badge">
                  <Zap size={13} fill="#007AFF" />
                  <span>意图秒懂 · 最佳解法</span>
                </span>
                <span className="grok-intent-tag">{grokIntent.title}</span>
              </div>
              <div className="grok-intent-dilemma">
                <strong>痛点诊断：</strong>{grokIntent.userDilemma}
              </div>
              <div className="grok-intent-solution">
                💡 {grokIntent.solution}
              </div>
              <div className="grok-intent-actions">
                <a
                  href={tools.find((t) => t.id === grokIntent.primaryToolId)?.path || '/'}
                  className="grok-intent-cta-btn"
                  onClick={navigate}
                >
                  <span>{grokIntent.actionLabel}</span>
                  <ArrowRight size={15} />
                </a>
                {grokIntent.secondaryToolId && (
                  <a
                    href={tools.find((t) => t.id === grokIntent.secondaryToolId)?.path || '/'}
                    className="grok-intent-secondary-btn"
                    onClick={navigate}
                  >
                    <span>搭配：{grokIntent.secondaryToolName}</span>
                  </a>
                )}
              </div>
              <div className="grok-intent-steps-row">
                <div className="grok-step-pill">
                  <span className="grok-step-num">1</span>
                  <span>{grokIntent.stepGuide[0]}</span>
                </div>
                <div className="grok-step-pill">
                  <span className="grok-step-num">2</span>
                  <span>{grokIntent.stepGuide[1]}</span>
                </div>
                <div className="grok-step-pill">
                  <span className="grok-step-num">3</span>
                  <span>{grokIntent.stepGuide[2]}</span>
                </div>
              </div>
              <div className="grok-intent-tip">
                <strong>Grok 建议：</strong>{grokIntent.grokTip}
              </div>
            </div>
          </div>
        )}

        <div className="ios-quick-chips-row" aria-label="常用任务快捷标签">
          <span className="ios-quick-chip-label">{isEn ? 'Quick Tasks:' : '快捷场景：'}</span>
          {QUICK_TASKS.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className="ios-quick-chip"
              onClick={navigate}
            >
              {isEn ? item.labelEn : item.labelZh}
            </a>
          ))}
        </div>
      </section>

      {/* 5. 大学生情境场景速查 (Campus Scenarios) */}
      <section className="ios-scenarios-section" aria-label="大学生活情境速查">
        <div className="ios-scenarios-header">
          <div className="ios-scenarios-title">
            <Sparkles size={16} color="#FF9500" />
            <span>{isEn ? 'By Campus Scenarios:' : '按大学生活情境速查：'}</span>
          </div>
          {activeScenario && (
            <button
              type="button"
              className="ios-scenario-clear-btn"
              onClick={() => setActiveScenario(null)}
            >
              {isEn ? 'Reset Scenario ✕' : '重置场景 ✕'}
            </button>
          )}
        </div>
        <div className="ios-scenarios-pills-row">
          {CAMPUS_SCENARIOS.map((sc) => {
            const isActive = activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                className={`ios-scenario-pill${isActive ? ' active' : ''}`}
                onClick={() => {
                  playHoverTick(readStoredSoundEnabled());
                  if (isActive) {
                    setActiveScenario(null);
                  } else {
                    setActiveScenario(sc.id);
                    setActiveGroup('all');
                    emitImmersionTelemetry({
                      code: 'SCENARIO.FILTER',
                      label: `${sc.name} · ${sc.badge}`,
                    });
                  }
                }}
              >
                <span className="ios-scenario-icon">{sc.icon}</span>
                <span className="ios-scenario-name">{isEn && SCENARIO_NAMES_EN[sc.id] ? SCENARIO_NAMES_EN[sc.id].name : sc.name}</span>
                <span className="ios-scenario-badge">{isEn && SCENARIO_NAMES_EN[sc.id] ? SCENARIO_NAMES_EN[sc.id].badge : sc.badge}</span>
              </button>
            );
          })}
        </div>
        {currentScenarioObj && (
          <div className="ios-scenario-active-banner">
            <span>🎯 <strong>{isEn && SCENARIO_NAMES_EN[currentScenarioObj.id] ? SCENARIO_NAMES_EN[currentScenarioObj.id].name : currentScenarioObj.name}</strong>：{isEn && SCENARIO_NAMES_EN[currentScenarioObj.id] ? SCENARIO_NAMES_EN[currentScenarioObj.id].tagline : currentScenarioObj.tagline}</span>
            <button
              type="button"
              className="ios-scenario-clear-btn"
              onClick={() => {
                playHoverTick(readStoredSoundEnabled());
                setActiveScenario(null);
              }}
            >
              {isEn ? 'Clear Filter' : '清除筛选'}
            </button>
          </div>
        )}
      </section>

      {/* 6. iOS Segmented Control (分段控制器 - 分组筛选) */}
      <nav className="ios-segmented-wrap" aria-label="工具分类分段控制器">
        <div className="ios-segmented-control" role="tablist">
          <button
            type="button"
            className={`ios-segmented-btn${activeGroup === 'all' && !activeScenario ? ' active' : ''}`}
            aria-pressed={activeGroup === 'all' && !activeScenario}
            onClick={() => {
              playHoverTick(readStoredSoundEnabled());
              setActiveGroup('all');
              setActiveScenario(null);
              emitImmersionTelemetry({
                code: 'CATEGORY.ALL',
                label: `全站 ${PUBLIC_TOOL_COUNT} 款工具就绪`,
              });
            }}
          >
            {isEn ? 'All Tools' : '全部工具'} <span className="ios-segmented-count">{found.length}</span>
          </button>
          {GROUPS.map((group) => {
            const count = found.filter((t) => t.group === group).length;
            if (!count && query.trim()) return null;
            return (
              <button
                key={group}
                type="button"
                className={`ios-segmented-btn${activeGroup === group ? ' active' : ''}`}
                aria-pressed={activeGroup === group}
                onClick={() => {
                  playHoverTick(readStoredSoundEnabled());
                  setActiveGroup(group);
                  setActiveScenario(null);
                  emitImmersionTelemetry({
                    code: 'CATEGORY.FILTER',
                    label: `${group} (${count} 款)`,
                  });
                }}
              >
                {getGroupLabel(group)} <span className="ios-segmented-count">{count}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 7. iOS Inset Grouped List (设置与快捷指令风格分组列表 - 实用性满分) */}
      <div ref={groupedListRef}>
      {filteredGroups.map((group) => {
        const list = found.filter((t) => t.group === group);
        return list.length ? (
          <section key={group} className="ios-grouped-section">
            <div className="ios-grouped-header">
              <span>{getGroupLabel(group)}</span>
              <span>{isEn ? `${list.length} Tools` : `${list.length} 款工具`}</span>
            </div>
            <div className="ios-grouped-card">
              {list.map((t) => {
                const isNew = NEW_TOOL_IDS.has(t.id);
                const isHot = HOT_TOOL_IDS.has(t.id);
                return (
                  <a
                    key={t.id}
                    href={t.path}
                    className="ios-list-row"
                    onClick={navigate}
                  >
                    <IosAppIcon id={t.id} size={42} />
                    <div className="ios-list-row-main">
                      <div className="ios-list-row-title-line">
                        <span className="ios-list-row-title">{getToolName(t.id, t.name)}</span>
                        {isNew && <span className="home-card-tag new">NEW</span>}
                        {!isNew && isHot && <span className="home-card-tag hot">高频</span>}
                      </div>
                      <p className="ios-list-row-task">{getToolTask(t.id, t.task)}</p>
                    </div>
                    <div className="ios-list-row-right">
                      <span className="ios-open-btn">{isEn ? 'Open' : '打开'}</span>
                      <span className="ios-chevron" aria-hidden="true">›</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null;
      })}
      </div>

      {!found.length && (
        <section className="study-card" role="status">
          <h2>{isEn ? `No tools matched "${query}"` : `暂未收录匹配「${query}」的工具`}</h2>
          <p>{isEn ? 'Try searching for other keywords (e.g. PDF, watermark, photo, timetable, Excel) or visit the Wishlist to request a tool.' : '请换个关键词（如 PDF、水印、照片、课表、Excel），或前往功能许愿池告诉我们你遇到的收费痛点。'}</p>
          <div className="study-actions">
            <button
              type="button"
              className="study-btn alt"
              onClick={() => {
                setQuery('');
                setActiveScenario(null);
              }}
            >
              {isEn ? 'Show All Tools' : '显示全部工具'}
            </button>
            <a className="study-btn" href="/tools/wishes" onClick={navigate}>
              {isEn ? 'Go to Feature Wishlist' : '前往功能许愿池'}
            </a>
          </div>
        </section>
      )}

      {/* 8. iOS 说明与透明架构卡片 */}
      <section className="novip-trust-grid" aria-label="诚实说明与透明架构">
        <div className="novip-trust-card">
          <span className="novip-trust-eyebrow">{isEn ? 'TRANSPARENCY · BOUNDARIES' : 'TRANSPARENCY · 能力边界'}</span>
          <h3>{isEn ? 'Transparency & Capability Boundaries' : '诚实说明与能力边界'}</h3>
          <p>
            NOVIP 与 WPS 等商业办公软件无隶属关系，不提供任何破解或绕过订阅服务。外部经过核实的合法开源/免费替代方案请查看{' '}
            <a href="/tools/cost" onClick={navigate}>
              会员成本 / 免费替代
            </a>
            。
          </p>
          <p>
            纯浏览器 Office 基础转换可能重新排版；扫描版 PDF 需先经 OCR 识别；参考文献生成后请对照原文与学校规范复核；报名照片尺寸合规不代表人工审核必然通过。
          </p>
        </div>
        <div className="novip-trust-card">
          <span className="novip-trust-eyebrow">{isEn ? 'PRIVACY FIRST · ARCHITECTURE' : 'PRIVACY FIRST · 本机架构'}</span>
          <h3>{isEn ? 'Privacy Protection & Public Audit Matrix' : '隐私保护与公开验收文档'}</h3>
          <p>
            关键词与同义词搜索基于本地维护清单匹配，不是联网 AI 问答。所有文档、证件照、课表与表格默认仅在你的浏览器内存中运算，不会上传服务器。
          </p>
          <p>
            <a href="/tools/wishes" onClick={navigate}>
              遇到新的付费墙？提交功能心愿
            </a>{' '}
            ·{' '}
            <a href="/reports/acceptance-report.md" target="_blank" rel="noreferrer">
              完整验收报告（Markdown）
            </a>{' '}
            ·{' '}
            <a href="/reports/feature-matrix.md" target="_blank" rel="noreferrer">
              逐项功能与限制矩阵
            </a>
          </p>
        </div>
      </section>
    </ToolPage>
  );
}
