import React, {useEffect, useRef, useState, useMemo} from 'react';
import {tools, type Page} from '../../tools/registry';
import {playHoverTick, readStoredSoundEnabled} from '../../immersive/soundEngine';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectTool?: (toolId: Page) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onSelectTool,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Filtered tools
  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools.slice(0, 16);
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.task.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    );
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playHoverTick(readStoredSoundEnabled());
        setActiveIndex((prev) => (prev + 1) % Math.max(1, filteredTools.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playHoverTick(readStoredSoundEnabled());
        setActiveIndex((prev) => (prev - 1 + filteredTools.length) % Math.max(1, filteredTools.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredTools[activeIndex];
        if (selected) {
          playHoverTick(readStoredSoundEnabled());
          handlePick(selected.id as Page);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredTools, activeIndex, onClose]);

  const handlePick = (id: Page) => {
    onClose();
    if (onSelectTool) {
      onSelectTool(id);
    } else {
      const targetTool = tools.find((t) => t.id === id);
      const href = targetTool?.path || `/tools/${id}`;
      history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({top: 0});
    }
  };

  if (!open) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        className="command-palette-modal"
        role="dialog"
        aria-label="全站极速速查命令台"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 620,
          borderRadius: 20,
          background: 'var(--novip-glass-bg, rgba(255, 255, 255, 0.88))',
          border: '1px solid rgba(129, 236, 254, 0.35)',
          boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.4), 0 0 32px rgba(129, 236, 254, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
            gap: 12,
          }}
        >
          <span style={{fontSize: 20, color: '#0071e3'}}>✦</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="搜索全站 60+ 款免充值工具、格式转换或关键词..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text, #0f172a)',
            }}
          />
          <kbd
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(148, 163, 184, 0.2)',
              fontSize: 11,
              fontWeight: 600,
              color: '#64748b',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          style={{
            overflowY: 'auto',
            padding: '8px 10px',
            flex: 1,
          }}
        >
          {filteredTools.length === 0 ? (
            <div style={{padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: 14}}>
              未找到匹配工具，试着去功能许愿池提需求吧~
            </div>
          ) : (
            filteredTools.map((t, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <div
                  key={t.id}
                  onClick={() => handlePick(t.id as Page)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'linear-gradient(90deg, rgba(0, 113, 227, 0.14) 0%, rgba(129, 236, 254, 0.1) 100%)'
                      : 'transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{minWidth: 0, flex: 1}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <span style={{fontSize: 14.5, fontWeight: 700, color: isSelected ? '#0071e3' : 'inherit'}}>
                        {t.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(148, 163, 184, 0.16)',
                          color: '#64748b',
                        }}
                      >
                        {t.group}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#64748b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 2,
                      }}
                    >
                      {t.task}
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{fontSize: 12, color: '#0071e3', fontWeight: 600, marginLeft: 8}}>
                      回车直达 ↵
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            borderTop: '1px solid rgba(148, 163, 184, 0.15)',
            fontSize: 11.5,
            color: '#64748b',
            background: 'rgba(148, 163, 184, 0.05)',
          }}
        >
          <span>100% 浏览器本地运算 · 零上传 · 零VIP</span>
          <div style={{display: 'flex', gap: 10}}>
            <span>↑↓ 切换</span>
            <span>↵ 直达</span>
            <span>ESC 关闭</span>
          </div>
        </div>
      </div>
    </div>
  );
};
