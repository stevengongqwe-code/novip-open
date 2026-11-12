import React, {useState, useMemo} from 'react';
import {ToolPage, copyLocal} from './common';
import {
  WECHAT_THEMES,
  renderMarkdownToWechatHtml,
  type WechatThemeId,
} from './md-to-wechat-core';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import './md-to-wechat.css';

const TOOL_ID = 'md-to-wechat';

const DEFAULT_SAMPLE = `# 大学社团秋季招新公告

亲爱的各位新同学：

金秋九月，欢迎来到大学！在这个充满无限可能的校园里，**科技创新协会**正在寻找心怀热爱、敢于探索的你。

> “大学的意义，不仅在于专业课堂，更在于与一群志同道合的朋友，把心中的奇思妙想变为现实。”

## 🌟 我们能为你带来什么？
- **硬件极客工作坊**：Arduino / 树莓派从零入门
- **算法与前端实战**：带你动手做出能跑在手机上的真实小工具
- **零花钱补贴与比赛组队**：挑战杯、互联网+、蓝桥杯学长学姐带飞

## 📅 招新流程与宣讲时间
- **第一轮宣讲**：本周四 19:00 学生活动中心 201
- **面试考核**：大白话交流，无需任何先验代码基础！

期待在招新现场见到闪闪发光的你！`;

export default function MdToWechat() {
  const [markdown, setMarkdown] = useState<string>(DEFAULT_SAMPLE);
  const [themeId, setThemeId] = useState<WechatThemeId>('academic-blue');
  const [copied, setCopied] = useState<boolean>(false);

  const previewHtml = useMemo(
    () => renderMarkdownToWechatHtml(markdown, themeId),
    [markdown, themeId],
  );

  const handleCopyRichText = async () => {
    playHoverTick(readStoredSoundEnabled());
    try {
      if (typeof window !== 'undefined' && window.ClipboardItem && navigator.clipboard?.write) {
        const blobHtml = new Blob([previewHtml], {type: 'text/html'});
        const blobPlain = new Blob([markdown], {type: 'text/plain'});
        const item = new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobPlain,
        });
        await navigator.clipboard.write([item]);
      } else {
        await copyLocal(previewHtml);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      await copyLocal(previewHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
  };

  return (
    <ToolPage
      id={TOOL_ID}
      title="Markdown 转微信排版小助手"
      description="专为大学生社团推文、班级通告与学业笔记设计，一键转为微信公众号内联高保真排版，一键复制富文本直接粘贴。"
    >
      <div className="md-wechat-container">
        {/* Theme Selectors */}
        <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap'}}>
          <span style={{fontSize: 13, fontWeight: 600, color: '#64748b'}}>公众号主题配色：</span>
          {WECHAT_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`button secondary ${themeId === t.id ? 'active' : ''}`}
              style={{
                borderRadius: 9999,
                fontSize: 12.5,
                padding: '6px 14px',
                borderColor: themeId === t.id ? t.primaryColor : undefined,
                background: themeId === t.id ? t.secondaryColor : undefined,
                color: themeId === t.id ? t.primaryColor : undefined,
                fontWeight: themeId === t.id ? 700 : 500,
              }}
              onClick={() => {
                playHoverTick(readStoredSoundEnabled());
                setThemeId(t.id);
              }}
            >
              <span style={{display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: t.primaryColor, marginRight: 6}} />
              {t.name}
            </button>
          ))}

          <button
            type="button"
            className="button primary"
            onClick={handleCopyRichText}
            style={{marginLeft: 'auto', padding: '8px 20px', fontSize: 13.5}}
          >
            {copied ? '已复制微信富文本 ✓ (直接在公众号编辑器 Ctrl+V)' : '一键复制到微信公众号'}
          </button>
        </div>

        {/* Dual Layout */}
        <div className="md-wechat-layout">
          <div className="md-wechat-editor-pane">
            <div style={{fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#64748b'}}>
              输入 Markdown 文本
            </div>
            <textarea
              className="md-wechat-textarea"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="在此粘贴或输入 Markdown 正文..."
              aria-label="Markdown 正文输入框"
            />
          </div>

          <div className="md-wechat-editor-pane">
            <div style={{fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#64748b'}}>
              微信排版效果实时预览
            </div>
            <div
              className="md-wechat-preview-pane"
              dangerouslySetInnerHTML={{__html: previewHtml}}
              aria-label="微信排版预览区"
            />
          </div>
        </div>
      </div>
    </ToolPage>
  );
}
