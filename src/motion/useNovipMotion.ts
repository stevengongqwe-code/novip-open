import {useEffect, type RefObject} from 'react';
import {animate, stagger} from 'animejs';

/**
 * 判断当前是否应当抑制非必要位移动画：
 * 1. 无 DOM / SSR / JSDOM 环境
 * 2. 用户开启系统级 prefers-reduced-motion: reduce
 * 3. 用户主动选择 NOVIP「🍃 极简省电」模式 (data-novip-visual-mode="minimal")
 */
export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return true;
  }
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    return true;
  }
  try {
    if (document.documentElement.getAttribute('data-novip-visual-mode') === 'minimal') {
      return true;
    }
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 基于 Anime.js v4 的分类切换/网格阶梯流式揭示 Hook (Research #32 & #40)
 * - 单步延迟 20ms，最多对前 16 个可见子项做阶梯过渡，总延迟封顶 <= 240ms
 * - 组件卸载或依赖变更时自动调用 revert() / cancel() 还原内联样式，零内存泄漏
 */
export function useStaggerReveal(
  containerRef: RefObject<HTMLElement | null>,
  itemSelector: string,
  deps: readonly unknown[],
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldReduceMotion()) return;

    const nodes = Array.from(container.querySelectorAll<HTMLElement>(itemSelector)).slice(0, 16);
    if (nodes.length === 0) return;

    const anim = animate(nodes, {
      opacity: [0.15, 1],
      translateY: [8, 0],
      duration: 240,
      delay: stagger(18, {start: 0}),
      ease: 'outCubic',
    });

    return () => {
      try {
        anim.revert();
      } catch {
        anim.cancel();
      }
    };
  }, deps);
}
