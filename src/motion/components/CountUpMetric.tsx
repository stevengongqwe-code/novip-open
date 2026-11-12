import {useEffect, useRef, useState} from 'react';
import {animate} from 'animejs';
import {shouldReduceMotion} from '../useNovipMotion';

export interface CountUpMetricProps {
  value: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}

/**
 * CountUpMetric — 真实业务指标递增组件 (React Bits #14 + Motion Sites Wealth Builder #04 + Anime.js v4)
 * - 初始渲染直接输出真实目标值 `value`，保证 SSR、SEO 爬虫与无头测试首帧即读取到准确数字
 * - 在真实浏览器视口中首次可见时，使用 Anime.js v4 在 560ms 内平滑递增至目标值
 * - 严禁伪造数据：只展示传入的真实工具数（60）、本地率（100%）等实测指标
 */
export function CountUpMetric({
  value,
  suffix = '',
  prefix = '',
  durationMs = 560,
  className = '',
}: CountUpMetricProps) {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const elRef = useRef<HTMLSpanElement | null>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    setDisplayValue(value);
    if (hasAnimatedRef.current || shouldReduceMotion() || value <= 0) {
      return;
    }
    const node = elRef.current;
    if (!node) return;

    const runAnimation = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;
      const counter = {current: Math.max(0, Math.floor(value * 0.25))};
      const anim = animate(counter, {
        current: value,
        duration: durationMs,
        ease: 'outExpo',
        onUpdate: () => {
          setDisplayValue(Math.round(counter.current));
        },
        onComplete: () => {
          setDisplayValue(value);
        },
      });
      return () => {
        anim.cancel();
      };
    };

    if (typeof IntersectionObserver === 'undefined') {
      return runAnimation();
    }

    let cleanupAnim: (() => void) | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          cleanupAnim = runAnimation();
        }
      },
      {threshold: 0.2},
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cleanupAnim?.();
    };
  }, [value, durationMs]);

  return (
    <span ref={elRef} className={`novip-metric-value ${className}`.trim()}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}
