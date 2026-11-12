import type { ReactNode } from 'react';
import type { ToolID } from '../tools/registry';

export type Language = 'zh-CN' | 'en-US';

export interface ToolMetaLocale {
  name: string;
  task: string;
  group: string;
  guide?: {
    intro: string;
    steps: [string, string, string];
    saveTip: string;
  };
  note?: string;
}

export interface LocaleDictionary {
  common: {
    brandName: string;
    brandSlogan: string;
    brandFreeBadge: string;
    nav: {
      home: string;
      ai: string;
      pdfMergeSplit: string;
      handwrite: string;
      files: string;
      references: string;
      sheets: string;
      photo: string;
      collegeNav: string;
      cost: string;
      wishes: string;
      stats: string;
      quickSwitch: string;
      share: string;
      allTools: string;
      backToHome: string;
      openCommandPalette: string;
      dockHome: string;
      dockFiles: string;
      dockPhoto: string;
      dockNav: string;
      dockAllTools: string;
    };
    shell: {
      immersive: string;
      daylight: string;
      minimal: string;
      sfxOn: string;
      sfxMute: string;
      sfxTitleOn: string;
      sfxTitleOff: string;
      telemetryWebgl: string;
      pulseOrbTitle: string;
      pulseOrbAria: string;
      langSwitchAria: string;
    };
    actions: {
      copy: string;
      copied: string;
      copyFailed: string;
      download: string;
      downloading: string;
      save: string;
      clear: string;
      reset: string;
      retry: string;
      cancel: string;
      close: string;
      expand: string;
      collapse: string;
      preview: string;
      shareCard: string;
      systemShare: string;
      selectFile: string;
      upload: string;
      viewMore: string;
      search: string;
      execute: string;
      confirm: string;
    };
    status: {
      processing: string;
      ready: string;
      completed: string;
      failed: string;
      success: string;
      loading: string;
      offlineReady: string;
      localMemory: string;
      noLogin: string;
      zeroWatermark: string;
    };
    workbench: {
      backToLibrary: string;
      trustBadge: string;
      privacyNote: string;
      timetablePrivacy: string;
      adviceTitle: string;
    };
    errors: {
      boundaryTitle: string;
      boundaryDesc: string;
      chunkLoadDesc: string;
      loopDesc: string;
      loopActionDesc: string;
      reloadBtn: string;
      defaultErr: string;
      emptyResultErr: string;
    };
    feedback: {
      triggerText: string;
      triggerCta: string;
      title: string;
      close: string;
      desc: string;
      catWish: string;
      catBug: string;
      catMobile: string;
      catPraise: string;
      placeholder: string;
      copyBtn: string;
      copiedBtn: string;
      wechatBtn: string;
      wishlistLink: string;
      dialogTitle: string;
      wechatId: string;
      wechatNote: string;
      copyMsg: string;
    };
    share: {
      eyebrow: string;
      title: string;
      badge: string;
      desc: string;
      copyBtn: string;
      copiedBtn: string;
      downloadCardBtn: string;
      drawingCard: string;
      previewCard: string;
      collapsePreview: string;
      systemShareBtn: string;
      mobileSaveTip: string;
      copySuccessMsg: string;
      cardSuccessMsg: string;
      footerHint: string;
    };
    author: {
      eyebrow: string;
      title: string;
      desc: string;
      qrBtn: string;
      wechatLabel: string;
      copyWechat: string;
      copiedWechat: string;
      dialogTitle: string;
      saveQr: string;
    };
    footer: {
      privacyNotice: string;
      openSourceLicense: string;
      notices: string;
    };
  };
  home: {
    hero: {
      title: string;
      chunks: [string, string];
      subtitle: string;
      highlight: string;
      metricTools: string;
      metricLocal: string;
      metricFree: string;
      ctaFlagship: string;
      ctaAi: string;
    };
    island: {
      tag: string;
      desktopText: string;
      mobileText: string;
      toolsChip: string;
      expandTip: string;
      pwaTitle: string;
      pwaDesc: string;
      status1Title: string;
      status1Desc: string;
      status2Title: string;
      status2Desc: string;
      status3Title: string;
      status3Desc: string;
      status4Title: string;
      status4Desc: string;
    };
    showcase: {
      tabPhoto: string;
      tabPdf: string;
      tabGrades: string;
      tabCompress: string;
      badgePhoto: string;
      badgePdf: string;
      badgeGrades: string;
      badgeCompress: string;
      titlePhoto: string;
      titlePdf: string;
      titleGrades: string;
      titleCompress: string;
      descPhoto: string;
      descPdf: string;
      descGrades: string;
      descCompress: string;
      ctaPhoto: string;
      ctaPdf: string;
      ctaGrades: string;
      ctaCompress: string;
      bgBlue: string;
      bgWhite: string;
      bgRed: string;
    };
    ribbon: {
      btnPdf: string;
      btnPhoto: string;
      btnCompress: string;
      spec1: string;
      spec2: string;
      spec3: string;
    };
    everyday: {
      badge: string;
      title: string;
      subtitle: string;
      card1Title: string;
      card1Desc: string;
      card1Pill: string;
      card1Cta: string;
      card2Title: string;
      card2Desc: string;
      card2Pill: string;
      card2Cta: string;
      card3Title: string;
      card3Desc: string;
      card3Pill: string;
      card3Cta: string;
      card4Title: string;
      card4Desc: string;
      card4Pill: string;
      card4Cta: string;
    };
    flagship: {
      title: string;
      subtitle: string;
    };
    search: {
      placeholder: string;
      badge: string;
      scenarioAll: string;
      scenarioAcademic: string;
      scenarioExam: string;
      scenarioCampus: string;
      scenarioFiles: string;
      scenarioDev: string;
      clearSearch: string;
      resultCount: string;
      noResultTitle: string;
      noResultDesc: string;
    };
    springboard: {
      title: string;
      expandAll: string;
      collapseAll: string;
    };
    novip20: {
      badge: string;
      title: string;
      subtitle: string;
      cardWrongbookTitle: string;
      cardWrongbookDesc: string;
      cardBudgetTitle: string;
      cardBudgetDesc: string;
      cardHoursTitle: string;
      cardHoursDesc: string;
      cardMatrixTitle: string;
      cardMatrixDesc: string;
      cardDefenseTitle: string;
      cardDefenseDesc: string;
    };
    faq: {
      title: string;
      q1: string;
      a1: string;
      q2: string;
      a2: string;
      q3: string;
      a3: string;
      q4: string;
      a4: string;
    };
  };
  tools: Record<string, ToolMetaLocale>;
  searchAliases: Record<string, string[]>;
  ai: {
    title: string;
    desc: string;
    statusBadge: string;
    configBtn: string;
    clearBtn: string;
    wechatHint: string;
    welcomeMsg: string;
    queryPlaceholder: string;
    sendBtn: string;
    thinking: string;
    copyDraft: string;
    copiedDraft: string;
  };
}

export interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>, defaultVal?: string) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (d: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  dict: LocaleDictionary;
}
