import { useState } from 'react';
import { ToolPage, saveLocal, useJob } from './common';
import {
  PPT_THEMES,
  PPT_SCENARIOS,
  generatePptxBlob,
  type PptDeck,
  type PptThemeId,
  type PptScenarioId,
  type PptSlide,
} from './ppt-generate-core';
import {
  Presentation,
  Download,
  Copy,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Palette,
  FileText,
  RotateCcw,
} from 'lucide-react';

export default function PptGenerate() {
  const job = useJob();
  const [deck, setDeck] = useState<PptDeck>(() => PPT_SCENARIOS.thesis.defaultDeck());
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const activeSlide: PptSlide | undefined = deck.slides[activeSlideIndex] || deck.slides[0];
  const theme = PPT_THEMES[deck.themeId] || PPT_THEMES['apple-dark'];

  const handleScenarioChange = (scenarioId: PptScenarioId) => {
    const newDeck = PPT_SCENARIOS[scenarioId].defaultDeck();
    setDeck(newDeck);
    setActiveSlideIndex(0);
    showToast(`已载入「${PPT_SCENARIOS[scenarioId].name}」预设大纲`);
  };

  const handleThemeChange = (themeId: PptThemeId) => {
    setDeck(prev => ({ ...prev, themeId }));
  };

  const handleMetaChange = (field: keyof PptDeck, val: string) => {
    setDeck(prev => ({ ...prev, [field]: val }));
  };

  const handleSlideChange = (updater: (slide: PptSlide) => PptSlide) => {
    setDeck(prev => {
      const nextSlides = [...prev.slides];
      if (nextSlides[activeSlideIndex]) {
        nextSlides[activeSlideIndex] = updater(nextSlides[activeSlideIndex]);
      }
      return { ...prev, slides: nextSlides };
    });
  };

  const handleAddSlide = () => {
    const newSlide: PptSlide = {
      id: 'slide-' + Date.now(),
      layout: 'cards-2',
      title: '新幻灯片标题',
      subtitle: 'SUBTITLE HERE',
      cards: [
        { title: '核心要点 A', content: '在此输入相关分析与阐述内容…' },
        { title: '核心要点 B', content: '在此输入对比或结论要点…' },
      ],
    };
    setDeck(prev => ({
      ...prev,
      slides: [...prev.slides.slice(0, activeSlideIndex + 1), newSlide, ...prev.slides.slice(activeSlideIndex + 1)],
    }));
    setActiveSlideIndex(prev => prev + 1);
  };

  const handleDeleteSlide = (idx: number) => {
    if (deck.slides.length <= 1) {
      showToast('至少保留一张幻灯片');
      return;
    }
    setDeck(prev => ({
      ...prev,
      slides: prev.slides.filter((_, i) => i !== idx),
    }));
    if (activeSlideIndex >= idx && activeSlideIndex > 0) {
      setActiveSlideIndex(prev => prev - 1);
    }
  };

  const handleMoveSlide = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= deck.slides.length) return;
    setDeck(prev => {
      const slides = [...prev.slides];
      const temp = slides[idx];
      slides[idx] = slides[targetIdx];
      slides[targetIdx] = temp;
      return { ...prev, slides };
    });
    setActiveSlideIndex(targetIdx);
  };

  const handleGeneratePptx = async () => {
    job.run(
      async () => {
        const blob = await generatePptxBlob(deck);
        const fileName = (deck.title.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 30) || '演示文稿') + '.pptx';
        saveLocal(blob, fileName);
        return true;
      },
      () => {
        showToast('已生成 PPTX 演示文稿并开始下载');
      }
    );
  };

  const handleCopyMarkdown = () => {
    let md = `# ${deck.title}\n> ${deck.subtitle}\n\n- 作者：${deck.author}\n- 单位：${deck.affiliation}\n- 时间：${deck.date}\n\n---\n\n`;
    deck.slides.forEach((s, idx) => {
      md += `## Slide ${idx + 1}: ${s.title}\n`;
      if (s.subtitle) md += `*${s.subtitle}*\n\n`;
      if (s.bullets) s.bullets.forEach(b => (md += `- ${b}\n`));
      if (s.cards) s.cards.forEach(c => (md += `### ${c.title}\n${c.content}\n\n`));
      if (s.metrics) s.metrics.forEach(m => (md += `- **${m.value}** (${m.label}): ${m.desc || ''}\n`));
      if (s.timeline) s.timeline.forEach(t => (md += `- [${t.time}] ${t.event}\n`));
      md += '\n---\n\n';
    });
    navigator.clipboard.writeText(md).then(() => {
      showToast('大纲已复制为 Markdown 文本');
    });
  };

  const showToast = (message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:toast', { detail: { message } }));
    }
  };

  return (
    <ToolPage
      id="ppt-generate"
      title="PPT 生成与答辩大纲"
      description="针对大学期末大作业、毕业答辩、学术论文汇报和竞赛路演，在线编排幻灯片大纲并一键导出标准 16:9 PPTX 演示文稿。"
      job={job}
    >
      {/* 场景预设选择器 */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Presentation size={18} color="#0071e3" />
          <span>选择大学生高频场景预设</span>
        </h3>
        <div className="ppt-scenario-grid">
          {(Object.keys(PPT_SCENARIOS) as PptScenarioId[]).map(sId => {
            const sc = PPT_SCENARIOS[sId];
            const isSelected = deck.scenarioId === sId;
            return (
              <button
                key={sId}
                type="button"
                onClick={() => handleScenarioChange(sId)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: isSelected ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  background: isSelected ? 'rgba(0, 113, 227, 0.05)' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15, color: isSelected ? '#0071e3' : '#1d1d1f' }}>
                  {sc.name}
                </div>
                <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 4, lineHeight: 1.4 }}>
                  {sc.desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 主题配色与基础信息 */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Palette size={18} color="#0071e3" />
              <span>选择演示视觉风格</span>
            </h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(Object.keys(PPT_THEMES) as PptThemeId[]).map(tId => {
                const th = PPT_THEMES[tId];
                const isSelected = deck.themeId === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => handleThemeChange(tId)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid #0071e3' : '1px solid #e2e8f0',
                      background: '#' + th.bgColor,
                      color: '#' + th.textColor,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#' + th.primaryColor,
                      }}
                    />
                    <span>{th.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleCopyMarkdown}
              style={{
                padding: '9px 14px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Copy size={14} />
              <span>复制 Markdown 大纲</span>
            </button>
            <button
              type="button"
              onClick={() => handleScenarioChange(deck.scenarioId)}
              style={{
                padding: '9px 14px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: '#6e6e73',
              }}
            >
              <RotateCcw size={14} />
              <span>重置大纲</span>
            </button>
          </div>
        </div>

        {/* 基础信息输入框 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>答辩汇报总标题</label>
            <input
              type="text"
              value={deck.title}
              onChange={e => handleMetaChange('title', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>副标题 / 课程名</label>
            <input
              type="text"
              value={deck.subtitle}
              onChange={e => handleMetaChange('subtitle', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>汇报人 / 答辩小组</label>
            <input
              type="text"
              value={deck.author}
              onChange={e => handleMetaChange('author', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>院系 / 班级 / 日期</label>
            <input
              type="text"
              value={deck.affiliation}
              onChange={e => handleMetaChange('affiliation', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
            />
          </div>
        </div>
      </section>

      {/* 工作区：左侧幻灯片列表，中间实时 16:9 画布预览，右侧内容编辑器 */}
      <div className="ppt-layout-grid">
        {/* 左侧幻灯片索引列表 */}
        <div className="novip-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>幻灯片 ({deck.slides.length})</span>
            <button
              type="button"
              onClick={handleAddSlide}
              style={{
                padding: '4px 8px',
                borderRadius: 8,
                border: '1px solid #0071e3',
                background: '#0071e3',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Plus size={12} />
              <span>加页</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
            {deck.slides.map((s, idx) => {
              const isActive = idx === activeSlideIndex;
              return (
                <div
                  key={s.id || idx}
                  className="ppt-slide-thumb"
                  data-slide-index={idx}
                  onClick={() => setActiveSlideIndex(idx)}
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    border: isActive ? '2px solid #0071e3' : '1px solid #e2e8f0',
                    background: isActive ? '#f0f7ff' : '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6e6e73', marginBottom: 4 }}>
                    <span>P{idx + 1} · {s.layout}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleMoveSlide(idx, 'up'); }}
                        disabled={idx === 0}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2 }}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleMoveSlide(idx, 'down'); }}
                        disabled={idx === deck.slides.length - 1}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2 }}
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleDeleteSlide(idx); }}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2, color: '#d70015' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.title || '（未命名幻灯片）'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 中间 16:9 画布模拟预览 */}
        <div className="novip-card ppt-canvas-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#6e6e73' }}>
              预览第 {activeSlideIndex + 1} 页 (16:9 演示效果)
            </span>
            <span style={{ fontSize: 12, color: '#0071e3' }}>
              布局：{activeSlide?.layout}
            </span>
          </div>

          {/* 16:9 模拟幻灯片视口 */}
          <div
            style={{
              aspectRatio: '16 / 9',
              width: '100%',
              borderRadius: 16,
              background: '#' + theme.bgColor,
              border: '1px solid #' + theme.borderColor,
              padding: '24px 32px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: activeSlide?.layout === 'title' || activeSlide?.layout === 'conclusion' ? 'center' : 'flex-start',
              position: 'relative',
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: 12, left: 24, fontSize: 10, color: '#' + theme.subTextColor }}>
              NOVIP · 大学生免费工具箱
            </div>

            {/* 标题 */}
            <div
              style={{
                fontSize: activeSlide?.layout === 'title' ? 24 : 18,
                fontWeight: 700,
                color: '#' + theme.primaryColor,
                textAlign: activeSlide?.layout === 'title' || activeSlide?.layout === 'conclusion' ? 'center' : 'left',
                marginBottom: 6,
              }}
            >
              {activeSlide?.title}
            </div>

            {/* 副标题 */}
            {activeSlide?.subtitle && (
              <div
                style={{
                  fontSize: 12,
                  color: '#' + theme.subTextColor,
                  textAlign: activeSlide?.layout === 'title' || activeSlide?.layout === 'conclusion' ? 'center' : 'left',
                  marginBottom: 16,
                }}
              >
                {activeSlide?.subtitle}
              </div>
            )}

            {/* 封面补充作者信息 */}
            {activeSlide?.layout === 'title' && (
              <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#' + theme.textColor }}>
                {[deck.author, deck.affiliation, deck.date].filter(Boolean).join('  |  ')}
              </div>
            )}

            {/* 列表 / 目录 */}
            {activeSlide?.layout === 'agenda' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                {(activeSlide.bullets || []).map((b, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#' + theme.cardBgColor,
                      border: '1px solid #' + theme.borderColor,
                      color: '#' + theme.textColor,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {b}
                  </div>
                ))}
              </div>
            )}

            {/* 双卡片 / 三卡片 */}
            {(activeSlide?.layout === 'cards-2' || activeSlide?.layout === 'cards-3') && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                  gap: 12,
                  width: '100%',
                  marginTop: 8,
                }}
              >
                {(activeSlide.cards || []).map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: '#' + theme.cardBgColor,
                      border: '1px solid #' + theme.borderColor,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#' + theme.primaryColor, marginBottom: 4 }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#' + theme.textColor, lineHeight: 1.4 }}>
                      {c.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 指标数据页 */}
            {activeSlide?.layout === 'metrics' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap: 12, width: '100%', marginTop: 12 }}>
                {(activeSlide.metrics || []).map((m, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: '#' + theme.cardBgColor,
                      border: '1px solid #' + theme.borderColor,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#' + theme.primaryColor }}>
                      {m.value}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#' + theme.textColor, margin: '4px 0' }}>
                      {m.label}
                    </div>
                    {m.desc && <div style={{ fontSize: 10, color: '#' + theme.subTextColor }}>{m.desc}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* 时间轴页 */}
            {activeSlide?.layout === 'timeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 8 }}>
                {(activeSlide.timeline || []).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      padding: '6px 10px',
                      background: '#' + theme.cardBgColor,
                      borderRadius: 8,
                      border: '1px solid #' + theme.borderColor,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#' + theme.primaryColor, minWidth: 70 }}>
                      {t.time}
                    </span>
                    <span style={{ fontSize: 11, color: '#' + theme.textColor }}>
                      {t.event}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧当前页内容属性修改 */}
        <div className="novip-card" style={{ padding: 14 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#1d1d1f' }}>编辑当前第 {activeSlideIndex + 1} 页</h4>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>页面布局</label>
            <select
              value={activeSlide?.layout || 'cards-2'}
              onChange={e => handleSlideChange(s => ({ ...s, layout: e.target.value as any }))}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            >
              <option value="title">封面大标题页 (Title)</option>
              <option value="agenda">目录大纲页 (Agenda)</option>
              <option value="cards-2">双栏对比卡片 (2-Cards)</option>
              <option value="cards-3">三栏模块卡片 (3-Cards)</option>
              <option value="metrics">数据指标高亮页 (Metrics)</option>
              <option value="timeline">进度时间轴 (Timeline)</option>
              <option value="conclusion">结语与致谢 (Conclusion)</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>幻灯片标题</label>
            <input
              type="text"
              value={activeSlide?.title || ''}
              onChange={e => handleSlideChange(s => ({ ...s, title: e.target.value }))}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>副标题 / 英文注释</label>
            <input
              type="text"
              value={activeSlide?.subtitle || ''}
              onChange={e => handleSlideChange(s => ({ ...s, subtitle: e.target.value }))}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            />
          </div>

          {activeSlide?.cards && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 4 }}>卡片内容</label>
              {activeSlide.cards.map((c, i) => (
                <div key={i} style={{ marginBottom: 8, padding: 8, background: '#f8fafc', borderRadius: 8 }}>
                  <input
                    type="text"
                    value={c.title}
                    placeholder="卡片标题"
                    onChange={e => {
                      const newCards = [...(activeSlide.cards || [])];
                      newCards[i].title = e.target.value;
                      handleSlideChange(s => ({ ...s, cards: newCards }));
                    }}
                    style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, marginBottom: 4 }}
                  />
                  <textarea
                    rows={2}
                    value={c.content}
                    placeholder="卡片阐述"
                    onChange={e => {
                      const newCards = [...(activeSlide.cards || [])];
                      newCards[i].content = e.target.value;
                      handleSlideChange(s => ({ ...s, cards: newCards }));
                    }}
                    style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部悬浮/操作按钮 */}
      <div
        style={{
          marginTop: 24,
          padding: '16px 20px',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6e6e73' }}>
          <FileText size={16} />
          <span>共 {deck.slides.length} 页 16:9 幻灯片 · 纯端侧快速生成</span>
        </div>

        <button
          type="button"
          onClick={handleGeneratePptx}
          disabled={job.busy}
          style={{
            padding: '12px 28px',
            borderRadius: 14,
            border: 0,
            background: '#0071e3',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0, 113, 227, 0.28)',
          }}
        >
          <Download size={18} />
          <span>{job.busy ? '正在生成 PPTX…' : '生成并下载 .pptx (PowerPoint / WPS)'}</span>
        </button>
      </div>
    </ToolPage>
  );
}
