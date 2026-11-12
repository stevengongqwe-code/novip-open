import {useEffect, useRef} from 'react';
import {shouldReduceMotion} from '../useNovipMotion';

interface SparkBurst {
  x: number;
  y: number;
  startedAt: number;
  color: string;
}

/**
 * ClickSparkLayer — 全局按需激活点击/触控微火花反馈层 (React Bits #16 + Uiverse #29)
 * - 平时 0% CPU/GPU 占用（不运行常驻 rAF 循环）
 * - 仅在用户点击/触摸交互控件（按钮、工具卡片、导航项）时启动 360ms 轻量绘制，绘制完毕立即停止 rAF
 * - `pointer-events: none` 绝不阻断任何点击、输入、滚动或下载
 */
export function ClickSparkLayer({enabled = true}: {enabled?: boolean}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled || shouldReduceMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const bursts: SparkBurst[] = [];
    let rafId = 0;
    const DURATION_MS = 340;
    const RAY_COUNT = 8;

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncSize();

    const renderLoop = (now: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const elapsed = now - b.startedAt;
        if (elapsed >= DURATION_MS) {
          bursts.splice(i, 1);
          continue;
        }
        const t = elapsed / DURATION_MS;
        const easeOut = 1 - Math.pow(1 - t, 3);
        const innerR = 4 + easeOut * 14;
        const outerR = innerR + (1 - easeOut) * 10;

        ctx.save();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.8 * (1 - t * 0.6);
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.max(0, 1 - t);

        for (let r = 0; r < RAY_COUNT; r++) {
          const angle = (r * Math.PI * 2) / RAY_COUNT;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          ctx.beginPath();
          ctx.moveTo(b.x + cos * innerR, b.y + sin * innerR);
          ctx.lineTo(b.x + cos * outerR, b.y + sin * outerR);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (bursts.length > 0) {
        rafId = window.requestAnimationFrame(renderLoop);
      } else {
        rafId = 0;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (shouldReduceMotion()) return;
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      const interactive = target.closest(
        'a, button, [role="button"], [role="tab"], input[type="submit"], input[type="button"], .novip-flagship-card, .novip-scenario-card',
      );
      if (!interactive) return;

      const isImmersive =
        document.documentElement.getAttribute('data-novip-visual-mode') === 'immersive';
      bursts.push({
        x: e.clientX,
        y: e.clientY,
        startedAt: performance.now(),
        color: isImmersive ? '#38bdf8' : '#0071e3',
      });

      if (bursts.length > 6) {
        bursts.shift();
      }
      if (!rafId) {
        rafId = window.requestAnimationFrame(renderLoop);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, {passive: true});
    window.addEventListener('resize', syncSize, {passive: true});

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', syncSize);
    };
  }, [enabled]);

  return (
    <canvas
      ref={canvasRef}
      className="novip-click-spark-canvas"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    />
  );
}
