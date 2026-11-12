import {useEffect, useRef, useState} from 'react';

export interface DecryptedTextProps {
  text: string;
  speedMs?: number;
  maxIterations?: number;
  className?: string;
}

const CIPHER_GLYPHS = '01ABCDEF#/*+<>:;=[]_';

/**
 * DecryptedText — 灵感源自 React Bits DecryptedText (#54)
 * 当 text 变化时（例如点击 3D 星环或触摸/悬停工具卡片触发遥测状态切换），
 * 以极客矩阵字符快速解码过渡到目标文本，纯状态驱动、零外部依赖。
 */
export function DecryptedText({
  text,
  speedMs = 22,
  maxIterations = 8,
  className = '',
}: DecryptedTextProps) {
  const [display, setDisplay] = useState(text);
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (prevTextRef.current === text) {
      setDisplay(text);
      return;
    }
    prevTextRef.current = text;

    if (
      typeof window === 'undefined' ||
      (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) ||
      (typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-novip-visual-mode') === 'minimal')
    ) {
      setDisplay(text);
      return;
    }

    let step = 0;
    const len = text.length;
    const timer = window.setInterval(() => {
      step += 1;
      if (step >= maxIterations) {
        setDisplay(text);
        window.clearInterval(timer);
        return;
      }
      const revealedCount = Math.floor((step / maxIterations) * len);
      let nextStr = '';
      for (let i = 0; i < len; i++) {
        const ch = text[i];
        if (i < revealedCount || ch === ' ' || ch === '·' || ch === '/') {
          nextStr += ch;
        } else {
          nextStr += CIPHER_GLYPHS[(i + step * 3) % CIPHER_GLYPHS.length];
        }
      }
      setDisplay(nextStr);
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [text, speedMs, maxIterations]);

  return (
    <span className={`novip-decrypted-text ${className}`.trim()} data-raw-text={text}>
      {display}
    </span>
  );
}
