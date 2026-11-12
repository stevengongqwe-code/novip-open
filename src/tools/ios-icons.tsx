import React from 'react';
import {
  Camera,
  ImageDown,
  Calendar,
  ShieldCheck,
  Stamp,
  Files,
  PenTool,
  BookOpen,
  Table,
  Sparkles,
  SlidersHorizontal,
  Layers,
  Pipette,
  Terminal,
  Clock,
  GraduationCap,
  HeartPulse,
  Trophy,
  Calculator,
  AlignLeft,
  Compass,
  Hash,
  Crop,
  MessageSquareQuote,
  FolderArchive,
  FolderSync,
  ScanText,
  CheckCircle2,
  GitCompare,
  FileText,
  Kanban,
  FlaskConical,
  Coins,
  Sparkle,
  ClipboardCheck,
  FileSpreadsheet,
  Scan,
  Scissors,
  Wrench,
  Wallet,
  Presentation,
  FileCheck,
  GitFork,
  Film,
  Smartphone,
  QrCode,
  Shuffle,
  Contact,
  Zap,
  PlugZap,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type {ToolID} from './registry';

export interface ToolIosConfig {
  gradient: string;
  icon: LucideIcon;
  shortName: string;
  badge?: 'NEW' | 'HOT';
  iconColor?: string;
}

export const TOOL_IOS_CONFIG: Record<ToolID, ToolIosConfig> = {
  wrongbook: {gradient:'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',icon:BookOpen,shortName:'错题复习',badge:'NEW'},
  'campus-budget': {gradient:'linear-gradient(135deg, #10B981 0%, #34D399 100%)',icon:Wallet,shortName:'生活费账本',badge:'NEW'},
  'internship-hours': {gradient:'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',icon:Clock,shortName:'实习工时',badge:'NEW'},
  'priority-matrix': {gradient:'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)',icon:Kanban,shortName:'四象限任务',badge:'NEW'},
  'defense-pacer': {gradient:'linear-gradient(135deg, #DB2777 0%, #F472B6 100%)',icon:Presentation,shortName:'答辩计时',badge:'NEW'},
  'photo-check': {
    gradient: 'linear-gradient(135deg, #FF2D55 0%, #FF3B30 100%)',
    icon: CheckCircle2,
    shortName: '照片体检',
    badge: 'HOT',
  },
  'pdf-merge-split': {
    gradient: 'linear-gradient(135deg, #0071E3 0%, #5AC8FA 100%)',
    icon: Files,
    shortName: 'PDF合并拆分',
    badge: 'HOT',
  },
  'pdf-compress': {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FFCC00 100%)',
    icon: FolderArchive,
    shortName: 'PDF压缩',
    badge: 'HOT',
  },
  // 旗舰与图片
  photo: {
    gradient: 'linear-gradient(135deg, #FF2D55 0%, #FF9500 50%, #4CD964 100%)',
    icon: Camera,
    shortName: '报名照片',
    badge: 'HOT',
  },
  'ppt-extract': {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FF5E3A 100%)',
    icon: ImageDown,
    shortName: 'PPT提图',
    badge: 'NEW',
  },
  timetable: {
    gradient: 'linear-gradient(135deg, #FF3B30 0%, #FF2D55 100%)',
    icon: Calendar,
    shortName: '大学课表',
    badge: 'NEW',
  },
  'pdf-watermark': {
    gradient: 'linear-gradient(135deg, #FF3B30 0%, #B80012 100%)',
    icon: ShieldCheck,
    shortName: 'PDF加水印',
    badge: 'NEW',
  },
  'image-watermark': {
    gradient: 'linear-gradient(135deg, #32ADE6 0%, #007AFF 100%)',
    icon: Stamp,
    shortName: '图片水印',
    badge: 'NEW',
  },
  'pdf-page-number': {
    gradient: 'linear-gradient(135deg, #FF453A 0%, #E02828 100%)',
    icon: Hash,
    shortName: 'PDF加页码',
    badge: 'NEW',
  },
  'pdf-crop': {
    gradient: 'linear-gradient(135deg, #FF9F0A 0%, #FF453A 100%)',
    icon: Crop,
    shortName: 'PDF裁剪',
    badge: 'NEW',
  },

  // 核心高频与学习
  files: {
    gradient: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
    icon: Files,
    shortName: '文件转换',
    badge: 'HOT',
  },
  handwrite: {
    gradient: 'linear-gradient(135deg, #3A3A3C 0%, #1C1C1E 100%)',
    icon: PenTool,
    shortName: '手写生成',
    badge: 'HOT',
  },
  references: {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FFCC00 100%)',
    icon: BookOpen,
    shortName: '参考文献',
    badge: 'HOT',
  },
  sheets: {
    gradient: 'linear-gradient(135deg, #34C759 0%, #28CD41 100%)',
    icon: Table,
    shortName: 'Excel合并',
  },
  'table-clean': {
    gradient: 'linear-gradient(135deg, #30D158 0%, #00A86B 100%)',
    icon: Sparkles,
    shortName: '表格清洗',
  },
  images: {
    gradient: 'linear-gradient(135deg, #AF52DE 0%, #5856D6 100%)',
    icon: SlidersHorizontal,
    shortName: '批量图片',
  },
  stitch: {
    gradient: 'linear-gradient(135deg, #5856D6 0%, #32ADE6 100%)',
    icon: Layers,
    shortName: '长图拼接',
    badge: 'HOT',
  },
  'color-picker': {
    gradient: 'linear-gradient(135deg, #FF375F 0%, #AF52DE 50%, #007AFF 100%)',
    icon: Pipette,
    shortName: '图片取色',
  },
  developer: {
    gradient: 'linear-gradient(135deg, #1C1C1E 0%, #2C2C2E 100%)',
    icon: Terminal,
    shortName: '开发者工具',
    iconColor: '#30D158',
  },
  timestamp: {
    gradient: 'linear-gradient(135deg, #0A84FF 0%, #0040DD 100%)',
    icon: Clock,
    shortName: '时间戳',
  },
  grades: {
    gradient: 'linear-gradient(135deg, #5856D6 0%, #8944AB 100%)',
    icon: GraduationCap,
    shortName: '成绩GPA',
    badge: 'HOT',
  },
  health: {
    gradient: 'linear-gradient(135deg, #FF2D55 0%, #FF375F 100%)',
    icon: HeartPulse,
    shortName: 'BMI体脂',
  },
  finance: {
    gradient: 'linear-gradient(135deg, #34C759 0%, #007A3D 100%)',
    icon: Calculator,
    shortName: '房贷利息',
  },
  text: {
    gradient: 'linear-gradient(135deg, #64D2FF 0%, #007AFF 100%)',
    icon: AlignLeft,
    shortName: '文本整理',
  },
  'college-nav': {
    gradient: 'linear-gradient(135deg, #007AFF 0%, #00C7BE 100%)',
    icon: Compass,
    shortName: '大学导航',
  },
  'leave-helper': {
    gradient: 'linear-gradient(135deg, #30D158 0%, #34C759 100%)',
    icon: MessageSquareQuote,
    shortName: '请假助手',
  },
  'material-collector': {
    gradient: 'linear-gradient(135deg, #FF9F0A 0%, #FFD60A 100%)',
    icon: FolderArchive,
    shortName: '材料收集',
    badge: 'HOT',
  },
  'file-organizer': {
    gradient: 'linear-gradient(135deg, #0A84FF 0%, #5E5CE6 100%)',
    icon: FolderSync,
    shortName: '文件改名',
  },
  ocr: {
    gradient: 'linear-gradient(135deg, #64D2FF 0%, #0A84FF 100%)',
    icon: ScanText,
    shortName: '提取文字',
  },
  'docx-check': {
    gradient: 'linear-gradient(135deg, #007AFF 0%, #0040DD 100%)',
    icon: CheckCircle2,
    shortName: '格式检查',
  },
  compare: {
    gradient: 'linear-gradient(135deg, #BF5AF2 0%, #5E5CE6 100%)',
    icon: GitCompare,
    shortName: '文字比较',
  },
  resume: {
    gradient: 'linear-gradient(135deg, #32ADE6 0%, #007AFF 100%)',
    icon: FileText,
    shortName: '免费简历',
  },
  ai: {
    gradient: 'linear-gradient(135deg, #FF2D55 0%, #AF52DE 50%, #5856D6 100%)',
    icon: Sparkles,
    shortName: 'AI 助手',
    badge: 'NEW',
  },
  course: {
    gradient: 'linear-gradient(135deg, #FF9F0A 0%, #FF6482 100%)',
    icon: Kanban,
    shortName: '课设助手',
  },
  lab: {
    gradient: 'linear-gradient(135deg, #64D2FF 0%, #BF5AF2 100%)',
    icon: FlaskConical,
    shortName: '实验数据',
  },
  cost: {
    gradient: 'linear-gradient(135deg, #30D158 0%, #00C7BE 100%)',
    icon: Coins,
    shortName: '免费平替',
  },
  wishes: {
    gradient: 'linear-gradient(135deg, #FF2D55 0%, #FF375F 100%)',
    icon: Sparkle,
    shortName: '许愿池',
  },
  'batch-pdf': {
    gradient: 'linear-gradient(135deg, #FF3B30 0%, #AF52DE 100%)',
    icon: Files,
    shortName: '批量PDF',
  },
  materials: {
    gradient: 'linear-gradient(135deg, #FF9F0A 0%, #FF453A 100%)',
    icon: ClipboardCheck,
    shortName: '材料检查',
  },
  ppt: {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #E05600 100%)',
    icon: FileSpreadsheet,
    shortName: 'PPT瘦身',
  },
  scan: {
    gradient: 'linear-gradient(135deg, #0A84FF 0%, #64D2FF 100%)',
    icon: Scan,
    shortName: '扫描增强',
  },
  privacy: {
    gradient: 'linear-gradient(135deg, #34C759 0%, #007A3D 100%)',
    icon: ShieldCheck,
    shortName: '元数据清理',
  },
  background: {
    gradient: 'linear-gradient(135deg, #FF375F 0%, #BF5AF2 100%)',
    icon: Scissors,
    shortName: '抠图换底',
  },
  'ppt-generate': {
    gradient: 'linear-gradient(135deg, #FF6A00 0%, #EE0979 100%)',
    icon: Presentation,
    shortName: 'PPT生成',
    badge: 'NEW',
  },
  'pdf-form': {
    gradient: 'linear-gradient(135deg, #007AFF 0%, #00C6FF 100%)',
    icon: FileCheck,
    shortName: 'PDF填表',
    badge: 'NEW',
  },
  'image-compress': {
    gradient: 'linear-gradient(135deg, #30CFD0 0%, #330867 100%)',
    icon: SlidersHorizontal,
    shortName: '精准压缩',
    badge: 'NEW',
  },
  flowchart: {
    gradient: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
    icon: GitFork,
    shortName: '流程图',
    badge: 'NEW',
  },
  'media-converter': {
    gradient: 'linear-gradient(135deg, #F355DA 0%, #7000FF 100%)',
    icon: Film,
    shortName: '音视频转换',
    badge: 'NEW',
  },
  'web-to-apk': {
    gradient: 'linear-gradient(135deg, #0071E3 0%, #00C6FF 100%)',
    icon: Smartphone,
    shortName: '网站转APK',
    badge: 'NEW',
  },
  qr: {
    gradient: 'linear-gradient(135deg, #111111 0%, #555555 100%)',
    icon: QrCode,
    shortName: '二维码',
    badge: 'NEW',
  },
  'random-pick': {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FF3B30 100%)',
    icon: Shuffle,
    shortName: '随机抽签',
    badge: 'NEW',
  },
  'id-card-layout': {
    gradient: 'linear-gradient(135deg, #0A84FF 0%, #30B0C7 100%)',
    icon: Contact,
    shortName: '证件拼版',
    badge: 'NEW',
  },
  'split-bill': {
    gradient: 'linear-gradient(135deg, #34C759 0%, #30B0C7 100%)',
    icon: Coins,
    shortName: 'AA分账',
    badge: 'NEW',
  },
  'class-fund': {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FFCC00 100%)',
    icon: Wallet,
    shortName: '班费账本',
    badge: 'NEW',
  },
  'exam-plan': {
    gradient: 'linear-gradient(135deg, #5856D6 0%, #AF52DE 100%)',
    icon: GraduationCap,
    shortName: '考试规划',
    badge: 'NEW',
  },
  'fitness-test': {
    gradient: 'linear-gradient(135deg, #34C759 0%, #32ADE6 100%)',
    icon: HeartPulse,
    shortName: '体测成绩',
    badge: 'NEW',
  },
  'composite-score': {
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FF2D55 100%)',
    icon: Trophy,
    shortName: '综测计算',
    badge: 'NEW',
  },
  'internship-tax': {
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
    icon: Wallet,
    shortName: '实习个税',
    badge: 'NEW',
  },
  'student-loan': {
    gradient: 'linear-gradient(135deg, #059669 0%, #0EA5E9 100%)',
    icon: GraduationCap,
    shortName: '助学贷款',
    badge: 'NEW',
  },
  'thesis-check': {
    gradient: 'linear-gradient(135deg, #0F766E 0%, #7C3AED 100%)',
    icon: FileCheck,
    shortName: '论文自查',
    badge: 'NEW',
  },
  'docx-format': {
    gradient: 'linear-gradient(135deg, #1D4ED8 0%, #0F766E 100%)',
    icon: FileText,
    shortName: '一键排版',
    badge: 'NEW',
  },
  'group-free-time': {
    gradient: 'linear-gradient(135deg, #059669 0%, #0EA5E9 100%)',
    icon: Calendar,
    shortName: '小组空闲',
    badge: 'NEW',
  },
  // Claude 体检门户（/verify）：本机应用体检页，不面向学生计数，但同样配图标以便顶栏显示。
  verify: {
    gradient: 'linear-gradient(135deg, #D97757 0%, #7C3AED 100%)',
    icon: ShieldCheck,
    shortName: 'Claude体检',
    badge: 'NEW',
  },
  focus: {
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
    icon: Timer,
    shortName: '自习番茄钟',
    badge: 'NEW',
  },
  'postgrad-score': {
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    icon: Calculator,
    shortName: '考研成绩',
    badge: 'NEW',
  },
  'dorm-power': {
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    icon: Zap,
    shortName: '宿舍电费',
    badge: 'NEW',
  },
  'dorm-power-limit': {
    gradient: 'linear-gradient(135deg, #dc2626 0%, #f59e0b 100%)',
    icon: PlugZap,
    shortName: '宿舍限电',
    badge: 'NEW',
  },
  countdown: {
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    icon: Clock,
    shortName: '大考倒计',
    badge: 'NEW',
  },
  'md-to-wechat': {
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    icon: FileText,
    shortName: '微信排版',
    badge: 'NEW',
  },
};

export function IosAppIcon({
  id,
  size = 56,
  className = '',
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const config = TOOL_IOS_CONFIG[id as ToolID] || {
    gradient: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
    icon: Wrench,
    shortName: '工具',
  };

  const IconComponent = config.icon;
  const iconPixel = Math.round(size * 0.52);

  return (
    <div
      className={`ios-app-icon-squircle ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: config.gradient,
      }}
      aria-hidden="true"
    >
      <div className="ios-app-icon-gloss" />
      <IconComponent
        size={iconPixel}
        color={config.iconColor || '#FFFFFF'}
        strokeWidth={2.3}
        className="ios-app-icon-glyph"
      />
    </div>
  );
}

export interface CampusScenario {
  id: string;
  name: string;
  icon: string;
  badge: string;
  tagline: string;
  toolIds: ToolID[];
}

export const CAMPUS_SCENARIOS: CampusScenario[] = [
  {
    id: 'exam',
    name: '考证与报名',
    icon: '🎓',
    badge: '教务/考公/四六级',
    tagline: '报名照剪裁压100KB、A4证件复印拼版、材料清单格式核查、准考证打印加页码',
    toolIds: ['photo', 'id-card-layout', 'image-compress', 'materials', 'pdf-page-number', 'background', 'grades'],
  },
  {
    id: 'coursework',
    name: '大作业与课件',
    icon: '📝',
    badge: 'PPT/论文/排版',
    tagline: 'PPT大纲生成、流程图制作、课件提取原图、参考文献GB/T 7714',
    toolIds: ['ppt-generate', 'flowchart', 'ppt-extract', 'handwrite', 'references', 'docx-check', 'thesis-check', 'docx-format', 'compare', 'course', 'text', 'ppt', 'ai'],
  },
  {
    id: 'document',
    name: '打印与脱敏',
    icon: '📄',
    badge: 'PDF/水印/转格式',
    tagline: '多份PDF合并拆分、PDF审批表填写签字、音视频转换提取、元数据清理',
    toolIds: ['pdf-form', 'media-converter', 'files', 'pdf-watermark', 'image-watermark', 'pdf-crop', 'batch-pdf', 'privacy', 'scan', 'stitch', 'images'],
  },
  {
    id: 'campus-life',
    name: '开学与班委日常',
    icon: '🎒',
    badge: '课表/收作业/请假',
    tagline: '周课表导入手机日历、班委收作业核对谁没交、批量改名、请假生成、综测排名公示',
    toolIds: ['timetable', 'group-free-time', 'material-collector', 'file-organizer', 'leave-helper', 'sheets', 'table-clean', 'college-nav', 'random-pick', 'split-bill', 'class-fund', 'exam-plan', 'composite-score'],
  },
  {
    id: 'tools-dev',
    name: '实用日常与计算',
    icon: '⚡',
    badge: '取色/时间/计算',
    tagline: '海报吸色转换、数字时间换算、物理化学实验数据计算、体测成绩换算、实习个税换算、助学贷款还款换算、网站一键转安卓APK、二维码生成解析',
    toolIds: ['web-to-apk', 'color-picker', 'timestamp', 'developer', 'ocr', 'lab', 'finance', 'health', 'cost', 'wishes', 'resume', 'qr', 'fitness-test', 'internship-tax', 'student-loan'],
  },
];

