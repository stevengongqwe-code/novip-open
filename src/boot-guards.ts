/**
 * NOVIP boot safety helpers. The ES5 boot watchdog in index.html is responsible
 * for the recovery UI even when this module cannot be parsed or loaded.
 *
 * A failed dynamic import is NOT retried here: browsers may cache the failure
 * for the same module URL. The user gets a controlled reload instead.
 */
export interface ReloadHistory {
  count: number;
  first: number;
}
export interface ReloadDecision {
  allow: boolean;
  history: ReloadHistory;
}
declare global {
  interface Window {
    __NOVIP_BOOTED?: boolean;
    __NOVIP_BOOT_FALLBACK?: () => void;
    __NOVIP_BOOT_SUCCESS?: () => void;
    __NOVIP_GUARDED_RELOAD?: () => boolean;
  }
}
const RELOAD_KEY = 'novip-reload-guard-v1';
const MAX_RELOADS = 2;
const RELOAD_WINDOW_MS = 5 * 60 * 1000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /dynamically imported module|loading chunk|failed to fetch|importing a module script failed|chunk load/i.test(msg);
}

export function nextReloadDecision(prev: ReloadHistory | null, now: number): ReloadDecision {
  if (!prev || now - prev.first > RELOAD_WINDOW_MS || now < prev.first) {
    return {allow: true, history: {count: 1, first: now}};
  }
  if (prev.count >= MAX_RELOADS) return {allow: false, history: prev};
  return {allow: true, history: {count: prev.count + 1, first: prev.first}};
}

/**
 * Both boot fallback and React error boundary use the same ES5 reload handler.
 * This TS fallback is only for environments where the inline handler is absent.
 */
export function guardedReload(): boolean {
  if (typeof window.__NOVIP_GUARDED_RELOAD === 'function') {
    return window.__NOVIP_GUARDED_RELOAD();
  }
  let previous: ReloadHistory | null = null;
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Partial<ReloadHistory>;
      if (typeof value.count === 'number' && Number.isFinite(value.count) &&
          typeof value.first === 'number' && Number.isFinite(value.first) &&
          value.count >= 0 && value.first >= 0) {
        previous = {count: value.count, first: value.first};
      }
    }
  } catch {/* Some WebViews deny storage. Do not prevent manual recovery. */}
  const result = nextReloadDecision(previous, Date.now());
  if (!result.allow) return false;
  try { sessionStorage.setItem(RELOAD_KEY, JSON.stringify(result.history)); }
  catch {/* Still permit this user-initiated reload. */}
  location.reload();
  return true;
}

/** Called only after the initial requested page successfully commits, not at Root mount. */
export function signalBooted(): void {
  window.__NOVIP_BOOTED = true;
  if (typeof window.__NOVIP_BOOT_SUCCESS === 'function') window.__NOVIP_BOOT_SUCCESS();
}
