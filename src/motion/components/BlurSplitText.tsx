import React from 'react';

export interface BlurSplitTextProps {
  /**
   * 完整标题文本，如 "大学生，别花冤枉钱。"
   */
  text: string;
  /**
   * 按语义拆分的片段数组（若不传则按标点自动切分，避免拆成过多单字 DOM）
   */
  chunks?: string[];
  className?: string;
}

/**
 * BlurSplitText — 融合 React Bits BlurText (#11) + SplitText (#12) 与 Motion Sites 首屏层级 (#01)
 * - 保持 DOM 文本连续可读，完全兼容全文搜索、SEO 与自动化测试 textContent 断言
 * - 在支持动画的终端上呈现 520ms 克制的高斯模糊渐进聚焦入场
 */
export function BlurSplitText({text, chunks, className}: BlurSplitTextProps) {
  const segments =
    chunks && chunks.length > 0
      ? chunks
      : text
          .split(/(?<=[，。！？、·\s])/)
          .map((s) => s.trim())
          .filter(Boolean);

  if (segments.length <= 1) {
    return <span className={`novip-blur-split-root ${className ?? ''}`.trim()}>{text}</span>;
  }

  return (
    <span className={`novip-blur-split-root ${className ?? ''}`.trim()}>
      {segments.map((seg, idx) => (
        <span
          key={`${idx}-${seg}`}
          className="novip-blur-split-chunk"
          style={{'--chunk-index': idx} as React.CSSProperties}
        >
          {seg}
        </span>
      ))}
    </span>
  );
}
