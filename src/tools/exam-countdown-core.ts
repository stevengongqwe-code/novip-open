/**
 * 考研/四六级目标倒计时微挂件 · 核心时间算法与预设计算
 */

export interface ExamPreset {
  id: string;
  name: string;
  targetDateStr: string; // ISO yyyy-mm-dd
  category: 'cet' | 'postgrad' | 'cert' | 'term';
  defaultSlogan: string;
}

export const EXAM_PRESETS: ExamPreset[] = [
  {
    id: 'postgrad-2027',
    name: '2027 考研初试',
    targetDateStr: '2026-12-26T08:30:00',
    category: 'postgrad',
    defaultSlogan: '一战成硕，岸上相见。别在能吃苦的年纪选择安逸！',
  },
  {
    id: 'cet4-winter',
    name: '全国大学英语四级 (CET-4)',
    targetDateStr: '2026-12-12T09:00:00',
    category: 'cet',
    defaultSlogan: '四级必过！单词刷透，听力稳住，425 分轻松拿下。',
  },
  {
    id: 'cet6-winter',
    name: '全国大学英语六级 (CET-6)',
    targetDateStr: '2026-12-12T15:00:00',
    category: 'cet',
    defaultSlogan: '六级稳上 500+，长篇阅读与翻译冲刺！',
  },
  {
    id: 'teacher-cert',
    name: '中小学教师资格证考试',
    targetDateStr: '2026-10-31T09:00:00',
    category: 'cert',
    defaultSlogan: '教资稳过，面试自信大方，早日持证上岗。',
  },
  {
    id: 'final-term',
    name: '期末考周突击冲刺',
    targetDateStr: '2026-12-30T08:00:00',
    category: 'term',
    defaultSlogan: '不挂科就是胜利！平时分拿满，期末考稳过高分。',
  },
];

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  totalSeconds: number;
}

export function calculateCountdown(targetDate: Date, now: Date = new Date()): CountdownTime {
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true, totalSeconds: 0};
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isPast: false,
    totalSeconds,
  };
}
