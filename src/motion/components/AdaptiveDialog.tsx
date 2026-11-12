import React, {useEffect, useRef, useState, type ReactNode} from 'react';

export interface AdaptiveDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * AdaptiveDialog — 统一响应式模态框与移动端底部抽屉 (Requirement 四.6)
 * - 桌面端 (> 640px)：居中毛玻璃弹簧模态框
 * - 手机与微信端 (<= 640px)：贴底单手可操作的 Bottom Sheet，支持顶部拖拽把手下滑关闭
 * - 无障碍保障：支持 Escape 键关闭、遮罩点击关闭、自动聚焦与焦点归还
 */
export function AdaptiveDialog({
  open,
  onClose,
  title,
  closeLabel = '收起面板 ✕',
  ariaLabel,
  className = '',
  children,
}: AdaptiveDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  useEffect(() => {
    if (!open) {
      setDragOffsetY(0);
      dragStartYRef.current = null;
      return;
    }

    const previousFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocused && typeof previousFocused.focus === 'function') {
        try {
          previousFocused.focus({preventScroll: true});
        } catch {
          /* Safe ignore */
        }
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      dragStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0) {
      setDragOffsetY(Math.min(180, dy));
    }
  };

  const handleTouchEnd = () => {
    if (dragOffsetY > 68) {
      setDragOffsetY(0);
      dragStartYRef.current = null;
      onClose();
      return;
    }
    setDragOffsetY(0);
    dragStartYRef.current = null;
  };

  return (
    <div
      className="novip-adaptive-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'NOVIP 详情面板')}
        className={`novip-adaptive-dialog ${className}`.trim()}
        style={
          dragOffsetY > 0
            ? {
                transform: `translate3d(0, ${dragOffsetY}px, 0)`,
                transition: 'none',
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="novip-adaptive-handle-bar"
          aria-hidden="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        <div className="novip-adaptive-header ios-island-sheet-head">
          <div className="novip-adaptive-title ios-island-sheet-title">{title}</div>
          <button
            type="button"
            className="novip-adaptive-close ios-island-close-btn ios-island-sheet-close"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
