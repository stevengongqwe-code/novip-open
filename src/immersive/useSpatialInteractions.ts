import {useEffect} from 'react';
import {playHoverTick, readStoredSoundEnabled} from './soundEngine';
import {emitImmersionTelemetry} from './telemetryBus';

const TILT_CARD_SELECTOR =
  '.novip-flagship-card, .novip-scenario-card, .novip-highfreq-card, .x-foryou-card, .ios-spotlight-quick-item, .novip-trust-card, .ios-widget-card';

const SPOTLIGHT_SURFACE_SELECTOR =
  '.novip-flagship-card, .novip-scenario-card, .novip-highfreq-card, .x-foryou-card, .ios-spotlight-quick-item, .novip-trust-card, .ios-widget-card, .ios-grouped-card, .ios-springboard-card, .novip-showcase-box, .study-card, .panel, .novip-card-box, .beginner-guide, .home-ai-entry';

/**
 * 桌面端卡片 3D 光影跟随与视差倾斜 + 遥测声波联动 + IntersectionObserver 空间渐显控制
 * 严格遵循性能预算：通过事件委托单监听器处理，不在每个卡片上绑定独立监听器，
 * 且在移动端、微信端、WebGL 不可用或 prefers-reduced-motion 下自动停用 3D 倾斜。
 */
export function useSpatialInteractions(options: {
  enableCardTilt: boolean;
  prefersReducedMotion: boolean;
}) {
  const {enableCardTilt, prefersReducedMotion} = options;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!enableCardTilt) return;

    let activeCard: HTMLElement | null = null;
    let rafId = 0;
    let releaseTimer: number | null = null;

    const resetCard = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--card-rx');
      el.style.removeProperty('--card-ry');
      el.removeAttribute('data-spatial-hover');
    };

    const processInteractionAt = (
      clientX: number,
      clientY: number,
      target: HTMLElement | null,
      isTouch: boolean,
    ) => {
      const card = target?.closest?.(SPOTLIGHT_SURFACE_SELECTOR) as HTMLElement | null;

      if (activeCard && activeCard !== card) {
        resetCard(activeCard);
        activeCard = null;
      }

      if (!card) return;

      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }

      if (activeCard !== card) {
        activeCard = card;
        playHoverTick(readStoredSoundEnabled());
        const titleEl = card.querySelector(
          'h2, h3, h4, .novip-flagship-title, .x-foryou-title, .ios-spotlight-item-title, .novip-highfreq-name, strong'
        );
        const titleText = titleEl?.textContent?.trim();
        if (titleText && titleText.length <= 28) {
          emitImmersionTelemetry({
            code: 'MODULE.READY',
            label: `${titleText} · 本地零上传算力待命`,
          });
        }
      }

      if (rafId !== 0) return;

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (!activeCard) return;
        const rect = activeCard.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        activeCard.setAttribute('data-spatial-hover', 'true');
        activeCard.style.setProperty('--spot-x', `${Math.round(x)}px`);
        activeCard.style.setProperty('--spot-y', `${Math.round(y)}px`);

        if (!prefersReducedMotion && activeCard.matches(TILT_CARD_SELECTOR)) {
          const nx = Math.max(0, Math.min(1, x / rect.width));
          const ny = Math.max(0, Math.min(1, y / rect.height));
          const maxTiltDeg = isTouch ? 3.2 : 5.5;
          const rx = (0.5 - ny) * maxTiltDeg;
          const ry = (nx - 0.5) * maxTiltDeg;
          activeCard.style.setProperty('--card-rx', `${rx.toFixed(2)}deg`);
          activeCard.style.setProperty('--card-ry', `${ry.toFixed(2)}deg`);
        }
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      processInteractionAt(e.clientX, e.clientY, e.target as HTMLElement | null, e.pointerType === 'touch');
    };

    const handlePointerDown = (e: PointerEvent) => {
      processInteractionAt(e.clientX, e.clientY, e.target as HTMLElement | null, e.pointerType === 'touch');
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && activeCard) {
        const toRelease = activeCard;
        releaseTimer = window.setTimeout(() => {
          resetCard(toRelease);
          if (activeCard === toRelease) activeCard = null;
        }, 360);
      } else if (activeCard) {
        resetCard(activeCard);
        activeCard = null;
      }
    };

    const handlePointerLeave = () => {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      if (activeCard) {
        resetCard(activeCard);
        activeCard = null;
      }
    };

    document.addEventListener('pointermove', handlePointerMove, {passive: true});
    document.addEventListener('pointerdown', handlePointerDown, {passive: true});
    document.addEventListener('pointerup', handlePointerUp, {passive: true});
    document.addEventListener('pointercancel', handlePointerLeave, {passive: true});
    window.addEventListener('blur', handlePointerLeave);

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      resetCard(activeCard);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
    };
  }, [enableCardTilt, prefersReducedMotion]);

  // 区块滚动渐入 (IntersectionObserver)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.novip-female-scenarios, .ios-widgets-grid, .novip-flagship-section, .novip-highfreq-section, .ios-springboard-card, .ios-spotlight-section, .ios-scenarios-section, .ios-grouped-section',
      ),
    );
    if (!sections.length) return;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      sections.forEach((sec) => sec.classList.add('is-spatial-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-spatial-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      {threshold: 0.06, rootMargin: '0px 0px -24px 0px'},
    );

    sections.forEach((sec) => {
      sec.classList.add('novip-spatial-section');
      observer.observe(sec);
    });

    return () => observer.disconnect();
  }, [prefersReducedMotion]);
}
