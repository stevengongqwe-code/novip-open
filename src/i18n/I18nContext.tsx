import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { I18nContextValue, Language, LocaleDictionary } from './types';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';

export const LOCALE_STORAGE_KEY = 'novip-locale';

const DICTIONARIES: Record<Language, LocaleDictionary> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

let currentLanguageGlobal: Language = 'zh-CN';

export function resolveInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en-US') {
      return saved;
    }
  } catch {
    /* Safe fallback if localStorage is denied */
  }
  return 'zh-CN';
}

// Immediately synchronize document.documentElement.lang on module load in browser
if (typeof document !== 'undefined') {
  currentLanguageGlobal = resolveInitialLanguage();
  document.documentElement.lang = currentLanguageGlobal;
}

export function getLanguage(): Language {
  return currentLanguageGlobal;
}

export function getLocaleDict(lang: Language = currentLanguageGlobal): LocaleDictionary {
  return DICTIONARIES[lang] || DICTIONARIES['zh-CN'];
}

function resolveNestedKey(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in params ? String(params[key]) : `{${key}}`;
  });
}

export function translate(
  key: string,
  params?: Record<string, string | number>,
  targetLang: Language = currentLanguageGlobal,
  defaultVal?: string,
): string {
  const dict = DICTIONARIES[targetLang] || DICTIONARIES['zh-CN'];
  let val = resolveNestedKey(dict, key);
  if (val === undefined && targetLang !== 'zh-CN') {
    val = resolveNestedKey(DICTIONARIES['zh-CN'], key);
  }
  if (val === undefined) {
    return defaultVal !== undefined ? defaultVal : key;
  }
  return interpolate(val, params);
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => resolveInitialLanguage());

  const setLang = useCallback((nextLang: Language) => {
    currentLanguageGlobal = nextLang;
    setLangState(nextLang);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLang);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = nextLang;
      window.dispatchEvent(
        new CustomEvent('novip:language-change', { detail: { lang: nextLang } }),
      );
    }
  }, []);

  useEffect(() => {
    currentLanguageGlobal = lang;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  // Synchronize across browser tabs / windows
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LOCALE_STORAGE_KEY && (e.newValue === 'zh-CN' || e.newValue === 'en-US')) {
        setLangState(e.newValue);
        currentLanguageGlobal = e.newValue;
        document.documentElement.lang = e.newValue;
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const dict = useMemo(() => DICTIONARIES[lang], [lang]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>, defaultVal?: string) => {
      let val = resolveNestedKey(dict, key);
      if (val === undefined && lang !== 'zh-CN') {
        val = resolveNestedKey(DICTIONARIES['zh-CN'], key);
      }
      if (val === undefined) {
        return defaultVal !== undefined ? defaultVal : key;
      }
      return interpolate(val, params);
    },
    [dict, lang],
  );

  const formatNumber = useCallback(
    (n: number, options?: Intl.NumberFormatOptions) => {
      return new Intl.NumberFormat(lang === 'zh-CN' ? 'zh-CN' : 'en-US', options).format(n);
    },
    [lang],
  );

  const formatDate = useCallback(
    (d: Date | number, options?: Intl.DateTimeFormatOptions) => {
      const date = typeof d === 'number' ? new Date(d) : d;
      return new Intl.DateTimeFormat(lang === 'zh-CN' ? 'zh-CN' : 'en-US', options).format(date);
    },
    [lang],
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t,
      formatNumber,
      formatDate,
      dict,
    }),
    [lang, setLang, t, formatNumber, formatDate, dict],
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Graceful fallback if called outside Provider (e.g. isolated test or early render)
    const fallbackLang = getLanguage();
    const fallbackDict = getLocaleDict(fallbackLang);
    return {
      lang: fallbackLang,
      setLang: () => {},
      t: (key: string, params?: Record<string, string | number>, defaultVal?: string) =>
        translate(key, params, fallbackLang, defaultVal),
      formatNumber: (n: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(fallbackLang === 'zh-CN' ? 'zh-CN' : 'en-US', options).format(n),
      formatDate: (d: Date | number, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(fallbackLang === 'zh-CN' ? 'zh-CN' : 'en-US', options).format(
          typeof d === 'number' ? new Date(d) : d,
        ),
      dict: fallbackDict,
    };
  }
  return ctx;
}
