import React, { useState, useEffect, useRef } from 'react';
import { ToolPage } from './common';
import { tools, PUBLIC_TOOL_COUNT, type ToolID } from './registry';
import { useI18n } from '../i18n';
import { IosAppIcon } from './ios-icons';
import {
  Sparkles,
  Send,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  Shield,
  ExternalLink,
  Calculator,
  FileText,
  HelpCircle,
  Settings,
  X,
  Key,
  Globe,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { solveAiQuery, type AiChatMessage } from './ai-core';
import {
  callNovipAi,
  loadAiConfig,
  saveAiConfig,
  testAiConnection,
  DEFAULT_AI_CONFIG,
  type AiConfig,
  type AiProvider,
} from './ai-api-client';
import { copyLocal } from '../tool-common';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  matchedToolIds?: ToolID[];
  draftTitle?: string;
  draftContent?: string;
  followUps?: string[];
  calcBreakdown?: string;
  timestamp: number;
  providerUsed?: AiProvider;
  modelUsed?: string;
  isFallback?: boolean;
  fallbackReason?: string;
}

const STORAGE_KEY = 'novip_main_ai_chat_v3';

const PRESET_PROMPTS = [
  { icon: '📸', label: '蓝底一寸报名照', query: '我想做一张蓝底一寸照片，怎么选尺寸换底色并压到100KB以内？' },
  { icon: '📑', label: '几个PDF拼成一个', query: '我有几份实验报告PDF，怎么按顺序合并在一起并加页码？' },
  { icon: '✍️', label: '打字变手写软面抄', query: '老师要求手写作业，怎么把文字转成大学软面抄的真实手写图片？' },
  { icon: '✉️', label: '辅导员请假文案', query: '生病找辅导员和老师请假，怎么委婉礼貌措辞？' },
  { icon: '📈', label: '平时分反推期末', query: '平时成绩占40%考了75分，期末考多少分总评才能上85分？' },
  { icon: '📝', label: '开题与答辩 PPT', query: '毕业设计开题报告答辩PPT怎么构思大纲和结构？' },
  { icon: '📚', label: 'GB/T 7714 参考文献', query: '毕业论文参考文献格式总被老师打回，怎么按 GB/T 7714 排版？' },
  { icon: '📱', label: '网站一键打包 APK', query: '怎么把我的网页博客打包成安卓手机能安装的 APK 安装包？' },
];

/**
 * 极简安全的端侧 Markdown 解析器（不依赖臃肿第三方库，针对大学生场景排版）
 */
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let codeBlock: { lang: string; lines: string[] } | null = null;

  const flushList = (key: number) => {
    if (!currentList) return null;
    const list = currentList;
    currentList = null;
    if (list.type === 'ul') {
      return (
        <ul key={`ul-${key}`} className="novip-ai-md-list">
          {list.items.map((it, idx) => (
            <li key={idx}>{parseInline(it)}</li>
          ))}
        </ul>
      );
    }
    return (
      <ol key={`ol-${key}`} className="novip-ai-md-ol">
        {list.items.map((it, idx) => (
          <li key={idx}>{parseInline(it)}</li>
        ))}
      </ol>
    );
  };

  const parseInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let pKey = 0;

    while (remaining.length > 0) {
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(
          <code key={pKey++} className="novip-ai-inline-code">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        parts.push(
          <strong key={pKey++} className="novip-ai-strong">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      const nextSpecial = remaining.search(/[`*]/);
      if (nextSpecial === -1) {
        parts.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        parts.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return parts;
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (line.startsWith('```')) {
      if (codeBlock) {
        const blk = codeBlock;
        codeBlock = null;
        elements.push(
          <pre key={`code-${lineIdx}`} className="novip-ai-code-block">
            <code>{blk.lines.join('\n')}</code>
          </pre>
        );
      } else {
        if (currentList) elements.push(flushList(lineIdx));
        codeBlock = { lang: line.slice(3).trim(), lines: [] };
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      if (currentList) elements.push(flushList(lineIdx));
      const hText = line.replace(/^#{1,3}\s+/, '');
      elements.push(
        <h4 key={`h-${lineIdx}`} style={{ margin: '10px 0 4px', fontSize: '15px', color: '#1C1C1E' }}>
          {parseInline(hText)}
        </h4>
      );
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      const text = line.replace(/^[-*•]\s+/, '');
      if (currentList && currentList.type === 'ul') {
        currentList.items.push(text);
      } else {
        if (currentList) elements.push(flushList(lineIdx));
        currentList = { type: 'ul', items: [text] };
      }
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const text = line.replace(/^\d+\.\s+/, '');
      if (currentList && currentList.type === 'ol') {
        currentList.items.push(text);
      } else {
        if (currentList) elements.push(flushList(lineIdx));
        currentList = { type: 'ol', items: [text] };
      }
      continue;
    }

    if (currentList) {
      elements.push(flushList(lineIdx));
    }

    if (!line.trim()) {
      elements.push(<div key={`sp-${lineIdx}`} className="novip-ai-para-space" />);
      continue;
    }

    if (line.startsWith('>')) {
      elements.push(
        <blockquote key={`quote-${lineIdx}`} className="novip-ai-quote">
          {parseInline(line.replace(/^>\s*/, ''))}
        </blockquote>
      );
      continue;
    }

    elements.push(
      <p key={`p-${lineIdx}`} className="novip-ai-para">
        {parseInline(line)}
      </p>
    );
  }

  if (currentList) elements.push(flushList(99999));
  if (codeBlock) {
    const trailing = codeBlock as { lines: string[] };
    elements.push(
      <pre key="code-end" className="novip-ai-code-block">
        <code>{trailing.lines.join('\n')}</code>
      </pre>
    );
  }

  return elements;
}

export default function AiAssistant({ navigate }: { navigate: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
      const v2 = localStorage.getItem('novip_main_ai_chat_v2');
      if (v2) return JSON.parse(v2);
      const v1 = localStorage.getItem('novip_main_ai_chat_v1');
      return v1 ? JSON.parse(v1) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(loadAiConfig);
  const [showSettings, setShowSettings] = useState(false);

  // 弹窗内部暂存配置
  const [modalConfig, setModalConfig] = useState<AiConfig>(aiConfig);
  const [activeTab, setActiveTab] = useState<AiProvider>(aiConfig.provider || 'gemini');
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<{
    loading: boolean;
    result: { ok: boolean; latencyMs: number; message: string } | null;
  }>({ loading: false, result: null });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isWeChat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent);

  // 持久化存储与自动滚动
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore storage quota */
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // 打开弹窗时同步当前配置
  const handleOpenSettings = () => {
    const current = loadAiConfig();
    setAiConfig(current);
    setModalConfig(current);
    setActiveTab(current.provider || 'gemini');
    setTestState({ loading: false, result: null });
    setShowSettings(true);
  };

  // 保存设置
  const handleSaveSettings = () => {
    const updated = saveAiConfig({ ...modalConfig, provider: activeTab });
    setAiConfig(updated);
    setShowSettings(false);
  };

  // 测试连通性
  const handleTestConnection = async () => {
    setTestState({ loading: true, result: null });
    const targetConfig = { ...modalConfig, provider: activeTab };
    const res = await testAiConnection(targetConfig);
    setTestState({ loading: false, result: res });
  };

  // 发送问题处理
  const handleSend = async (textToSend = input) => {
    const q = textToSend.trim();
    if (!q || isThinking) return;

    const userMessage: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: q,
      timestamp: Date.now(),
    };

    const historyContext: AiChatMessage[] = messages.slice(-6).map(m => ({
      role: m.role,
      content: m.content,
    }));

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await callNovipAi(q, historyContext, aiConfig);

      // 若为纯本地引擎匹配，补充结构化草稿
      const localResult = solveAiQuery(q, historyContext);

      const assistantMessage: ChatMessage = {
        id: 'asst-' + (Date.now() + 1),
        role: 'assistant',
        content: res.reply,
        matchedToolIds: res.matchedToolIds.length > 0 ? res.matchedToolIds : localResult.matchedToolIds,
        draftTitle: localResult.draftTitle,
        draftContent: localResult.draftContent,
        followUps: localResult.followUps,
        calcBreakdown: localResult.calcBreakdown,
        timestamp: Date.now() + 1,
        providerUsed: res.providerUsed,
        modelUsed: res.modelUsed,
        isFallback: res.isFallback,
        fallbackReason: res.fallbackReason,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: unknown) {
      // 容错降级
      const msg = err instanceof Error ? err.message : String(err);
      const fallbackResult = solveAiQuery(q, historyContext);
      const assistantMessage: ChatMessage = {
        id: 'asst-' + (Date.now() + 1),
        role: 'assistant',
        content: fallbackResult.reply,
        matchedToolIds: fallbackResult.matchedToolIds,
        draftTitle: fallbackResult.draftTitle,
        draftContent: fallbackResult.draftContent,
        followUps: fallbackResult.followUps,
        calcBreakdown: fallbackResult.calcBreakdown,
        timestamp: Date.now() + 1,
        providerUsed: 'local',
        modelUsed: '端侧规则求解引擎 (网络异常兜底)',
        isFallback: true,
        fallbackReason: `远程调用失败（${msg}），已自动切换为本地引擎。`,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('novip_main_ai_chat_v2');
      localStorage.removeItem('novip_main_ai_chat_v1');
    } catch {
      /* empty */
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await copyLocal(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const { t, dict, lang } = useI18n();
  const isEn = lang === 'en-US';

  // 提供商展示文案
  const getProviderLabel = (p: AiProvider) => {
    switch (p) {
      case 'gemini':
        return isEn ? '🌟 Google Gemini Official Model (Free Access)' : '🌟 Google Gemini 官方大模型 (全站直连免费使用)';
      case 'zhipu':
        return isEn ? '🇨🇳 Zhipu GLM-4-Flash' : '🇨🇳 智谱 GLM-4-Flash (国内免代理直连)';
      case 'siliconflow':
      case 'custom':
        return `⚡️ ${aiConfig.customModel || (isEn ? 'LLM API' : '大模型 API')}`;
      case 'local':
      default:
        return isEn ? '🛡️ Local Campus Rule Engine (Zero Config)' : '🛡️ 端侧学业规则引擎 (零配置)';
    }
  };

  return (
    <ToolPage
      id="ai"
      title={dict.ai.title}
      description={t('ai.desc', { count: PUBLIC_TOOL_COUNT }, `连接市面上优质免费 AI API（优先调用 Google Gemini Flash），结合站内 ${PUBLIC_TOOL_COUNT} 款实用免充值工具，为大学生提供真诚、高智商的学业答疑、文案起草与工具直达。`)}
    >
      <div className="novip-ai-container" aria-label="NOVIP 助手对话界面">
        {/* 顶部运行状态与提供商切换卡 */}
        <div className="novip-ai-status-card">
          <div className="novip-ai-brand-badge">
            <span className="novip-ai-dot" />
            <span className="novip-ai-badge-text">
              {getProviderLabel(aiConfig.provider)}
            </span>
          </div>
          <div className="novip-ai-header-actions">
            <button
              type="button"
              className="novip-ai-settings-btn"
              onClick={handleOpenSettings}
              title={isEn ? "Configure free API Key and switch models" : "配置免费 API Key 与切换模型"}
            >
              <Settings size={13} />
              <span>{dict.ai.configBtn}</span>
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                className="novip-ai-action-btn"
                onClick={handleClear}
                title={isEn ? "Clear chat history" : "清空当前对话记录"}
              >
                <Trash2 size={13} />
                <span>{dict.ai.clearBtn}</span>
              </button>
            )}
          </div>
        </div>

        {/* 微信内置浏览器温馨提示 */}
        {isWeChat && (
          <div className="novip-ai-wechat-hint" role="note">
            <span>💡 微信内浏览：推荐卡片支持一键秒开对应工具；文案草稿支持一键复制。</span>
          </div>
        )}

        {/* 消息对话区域 */}
        <div className="novip-ai-chat-flow">
          {messages.length === 0 ? (
            <div className="novip-ai-welcome-box">
              <div className="novip-ai-icon-large">
                <Sparkles size={32} color="#FFFFFF" />
              </div>
              <h2>{dict.common.brandSlogan}</h2>
              <p>
                {dict.ai.welcomeMsg}
              </p>

              <div className="novip-ai-presets-container">
                <span className="novip-ai-presets-title">{isEn ? '✨ Suggested Student Questions:' : '✨ 大学生高频场景快速提问：'}</span>
                <div className="novip-ai-presets-grid">
                  {PRESET_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="novip-ai-preset-chip"
                      onClick={() => handleSend(item.query)}
                      disabled={isThinking}
                    >
                      <span className="novip-ai-preset-icon">{item.icon}</span>
                      <span className="novip-ai-preset-label">{item.label}</span>
                      <ArrowRight size={13} className="novip-ai-preset-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="novip-ai-messages-list">
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={`novip-ai-message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="novip-ai-avatar">
                    {msg.role === 'user' ? '我' : <Sparkles size={16} />}
                  </div>

                  <div className="novip-ai-bubble-wrap">
                    <div className="novip-ai-bubble">
                      {/* 模型标签 */}
                      {msg.role === 'assistant' && msg.modelUsed && (
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                          <span className="novip-ai-model-tag">
                            <Zap size={10} color="#0071e3" />
                            {msg.modelUsed}
                          </span>
                        </div>
                      )}

                      {/* 故障降级说明 */}
                      {msg.isFallback && msg.fallbackReason && (
                        <div className="novip-ai-fallback-banner">
                          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{msg.fallbackReason}</span>
                        </div>
                      )}

                      <div className="novip-ai-text-content">
                        {renderMarkdown(msg.content)}
                      </div>

                      {/* 真实计算推导结果高亮面板 */}
                      {msg.calcBreakdown && (
                        <div className="novip-ai-calc-box">
                          <div className="novip-ai-calc-title">
                            <Calculator size={13} />
                            <span>数学推导与计算凭据</span>
                          </div>
                          <div className="novip-ai-calc-content">{msg.calcBreakdown}</div>
                        </div>
                      )}

                      {/* 专属实战文案/大纲/代码草稿箱（一键复制即可用） */}
                      {msg.draftContent && (
                        <div className="novip-ai-draft-card">
                          <div className="novip-ai-draft-header">
                            <span className="novip-ai-draft-title">
                              <FileText size={14} color="#0071e3" />
                              <strong>{msg.draftTitle || '实操文案 / 代码模板'}</strong>
                            </span>
                            <button
                              type="button"
                              className="novip-ai-draft-copy-btn"
                              onClick={() => handleCopy(msg.id + '-draft', msg.draftContent!)}
                            >
                              {copiedId === msg.id + '-draft' ? (
                                <>
                                  <Check size={12} /> 已复制文案
                                </>
                              ) : (
                                <>
                                  <Copy size={12} /> 一键复制草稿
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="novip-ai-draft-body">{msg.draftContent}</pre>
                        </div>
                      )}

                      {/* 回答底部工具条 */}
                      {msg.role === 'assistant' && (
                        <div className="novip-ai-bubble-toolbar">
                          <button
                            type="button"
                            className="novip-ai-copy-btn"
                            onClick={() => handleCopy(msg.id, msg.content)}
                            title="复制完整回复内容"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={12} /> 已复制
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> 复制回答
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 推荐工具直达交互卡片 */}
                    {msg.role === 'assistant' && msg.matchedToolIds && msg.matchedToolIds.length > 0 && (
                      <div className="novip-ai-tools-shelf">
                        <span className="novip-ai-shelf-header">{isEn ? '🎯 Recommended Free Tools (Instant Launch):' : '🎯 为你推荐的最佳免费工具直达（点击秒开）：'}</span>
                        <div className="novip-ai-tools-list">
                          {msg.matchedToolIds.map(toolId => {
                            const t = tools.find(item => item.id === toolId);
                            if (!t) return null;
                            const isBluePhoto = t.id === 'photo' && (msg.content.includes('蓝底') || msg.content.includes('一寸'));
                            const targetHref = isBluePhoto ? '/tools/id-photo?spec=one&bg=blue&limit=100' : t.path;
                            return (
                              <a
                                key={t.id}
                                href={targetHref}
                                onClick={navigate}
                                className="novip-ai-tool-card"
                              >
                                <IosAppIcon id={t.id} size={36} />
                                <div className="novip-ai-tool-info">
                                  <div className="novip-ai-tool-name-line">
                                    <strong>{dict.tools[t.id]?.name || t.name}</strong>
                                    {isBluePhoto && <span className="novip-badge-pill" style={{ background: '#0071e3', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 6 }}>{isEn ? '1-inch Blue ID' : '一键已设蓝底一寸'}</span>}
                                    <span className="novip-ai-group-badge">{dict.tools[t.id]?.group || t.group}</span>
                                  </div>
                                  <span className="novip-ai-tool-desc">{isBluePhoto ? (isEn ? 'One-click standard 1-inch (295×413) blue background, strictly ≤ 100KB' : '一站式自动设为标准一寸（295×413）、天蓝底并严格锁定 ≤ 100KB') : (dict.tools[t.id]?.task || t.task)}</span>
                                </div>
                                <div className="novip-ai-open-pill">
                                  <span>{isBluePhoto ? (isEn ? 'Create Photo' : '一键做照') : (isEn ? 'Open' : '立即打开')}</span>
                                  <ExternalLink size={12} />
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 快捷追问胶囊 */}
                    {msg.role === 'assistant' && msg.followUps && msg.followUps.length > 0 && index === messages.length - 1 && (
                      <div className="novip-ai-followups-container">
                        <div className="novip-ai-followups-header">
                          <HelpCircle size={13} />
                          <span>猜你想问（点击一键提问）：</span>
                        </div>
                        <div className="novip-ai-followups-list">
                          {msg.followUps.map((fu, fuIdx) => (
                            <button
                              key={fuIdx}
                              type="button"
                              className="novip-ai-followup-pill"
                              onClick={() => handleSend(fu)}
                              disabled={isThinking}
                            >
                              <span>{fu}</span>
                              <ArrowRight size={11} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* 思考等待状态 */}
              {isThinking && (
                <div className="novip-ai-message-row assistant">
                  <div className="novip-ai-avatar">
                    <Sparkles size={16} />
                  </div>
                  <div className="novip-ai-bubble-wrap">
                    <div className="novip-ai-thinking-indicator">
                      <RefreshCw size={14} className="novip-ai-spin-icon" />
                      <span>正在调用 {getProviderLabel(aiConfig.provider).split(' ')[1] || 'AI'} 深度思考中…</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 底部输入框 */}
        <div className="novip-ai-composer-wrap">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="novip-ai-composer-form"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder={dict.ai.queryPlaceholder}
              className="novip-ai-textarea"
              aria-label={isEn ? "Enter your academic or document question" : "输入你的学业或文件处理问题"}
              disabled={isThinking}
            />

            <button
              type="submit"
              className="novip-ai-send-btn send"
              disabled={!input.trim() || isThinking}
              title={isEn ? "Send question" : "发送问题"}
            >
              <Send size={14} />
              <span>{isThinking ? dict.ai.thinking : dict.ai.sendBtn}</span>
            </button>
          </form>

          <div className="novip-ai-privacy-footer">
            <Shield size={12} />
            <span>
              {isEn
                ? 'Privacy Guarantee: API Keys and conversation history are stored solely in your browser memory and never touch NOVIP servers.'
                : '隐私保护承诺：API Key 与对话记录仅保存在您的手机浏览器中，不经过 NOVIP 服务器，安全无忧。'}
            </span>
          </div>
        </div>
      </div>

      {/* 免费 AI API 设置弹窗 */}
      {showSettings && (
        <div className="novip-ai-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="novip-ai-modal-card" onClick={e => e.stopPropagation()}>
            <div className="novip-ai-modal-header">
              <div className="novip-ai-modal-title">
                <Settings size={18} color="#0071e3" />
                <span>配置免费 AI 模型 API</span>
              </div>
              <button
                type="button"
                className="novip-ai-modal-close-btn"
                onClick={() => setShowSettings(false)}
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>

            {/* 顶栏提供商切换 Tab */}
            <div className="novip-ai-tabs-bar">
              <button
                type="button"
                className={`novip-ai-tab-btn ${activeTab === 'gemini' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('gemini');
                  setTestState({ loading: false, result: null });
                }}
              >
                <span>🌟 Google Gemini (推荐)</span>
              </button>
              <button
                type="button"
                className={`novip-ai-tab-btn ${activeTab === 'zhipu' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('zhipu');
                  setTestState({ loading: false, result: null });
                }}
              >
                <span>🇨🇳 智谱 GLM-4</span>
              </button>
              <button
                type="button"
                className={`novip-ai-tab-btn ${activeTab === 'custom' || activeTab === 'siliconflow' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('custom');
                  setTestState({ loading: false, result: null });
                }}
              >
                <span>⚡️ 自定义/硅基流动</span>
              </button>
              <button
                type="button"
                className={`novip-ai-tab-btn ${activeTab === 'local' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('local');
                  setTestState({ loading: false, result: null });
                }}
              >
                <span>🛡️ 本地纯端侧</span>
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="novip-ai-modal-body">
              {activeTab === 'gemini' && (
                <>
                  <div className="novip-ai-info-box">
                    <strong>🌟 NOVIP 全站直连：Google Gemini 官方免费大模型</strong>
                    <div style={{ marginTop: '4px', lineHeight: 1.6 }}>
                      NOVIP 生产环境已配置腾讯云 EdgeOne 边缘全球直连路由（<code>/api/ai/chat</code>），优先调用 Google Gemini Flash。<strong>全站大学生访客无需配置 Key、无需梯子、免登录即可直接免费使用！</strong>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#555' }}>
                      💡 <strong>站长提示</strong>：若在生产环境启用全站统一 Key，可在 GitHub 仓库 Secrets 添加 <code>GEMINI_API_KEY</code> 或在 EdgeOne 环境变量配置。
                    </div>
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>私有 Gemini API Key（可选，留空则默认使用全站免费直连通道）</span>
                      <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 'normal' }}>AIzaSy...</span>
                    </label>
                    <div className="novip-ai-input-wrap">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={modalConfig.geminiKey || ''}
                        onChange={e => setModalConfig({ ...modalConfig, geminiKey: e.target.value })}
                        placeholder="留空即使用全站共享直连，也可粘贴个人专属 Key"
                        className="novip-ai-input"
                      />
                      <button
                        type="button"
                        className="novip-ai-eye-btn"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="novip-ai-guide-link"
                      style={{ marginTop: '6px' }}
                    >
                      <ExternalLink size={12} />
                      获取个人免费 Gemini API Key（Google AI Studio 免费赠送 1500次/天额度）
                    </a>
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>API 服务路由（默认同域 EdgeOne 边缘代理，免梯子直连）</span>
                    </label>
                    <input
                      type="text"
                      value={modalConfig.geminiBaseUrl || '/api/ai/chat'}
                      onChange={e => setModalConfig({ ...modalConfig, geminiBaseUrl: e.target.value })}
                      placeholder="/api/ai/chat"
                      className="novip-ai-input"
                    />
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>模型版本</span>
                    </label>
                    <select
                      value={modalConfig.geminiModel || 'gemini-1.5-flash'}
                      onChange={e => setModalConfig({ ...modalConfig, geminiModel: e.target.value })}
                      className="novip-ai-input"
                    >
                      <option value="gemini-1.5-flash">gemini-1.5-flash（推荐 · 极速聪明，免费额度高）</option>
                      <option value="gemini-2.0-flash">gemini-2.0-flash（下一代前沿大模型）</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro（深度复杂逻辑推导）</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'zhipu' && (
                <>
                  <div className="novip-ai-info-box">
                    <strong>🇨🇳 国内免代理推荐：智谱清言 GLM-4-Flash</strong>
                    <div>
                      智谱 AI 开放平台官方对个人开发者永久免费开放 <code>glm-4-flash</code> 模型。国内服务器高速直连，<strong>免翻墙、免代理</strong>，在校园网与移动端最稳定。
                    </div>
                    <a
                      href="https://open.bigmodel.cn/usercenter/apikeys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="novip-ai-guide-link"
                    >
                      <ExternalLink size={13} />
                      前往智谱开放平台免费领取 API Key
                    </a>
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>智谱 API Key</span>
                    </label>
                    <div className="novip-ai-input-wrap">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={modalConfig.zhipuKey || ''}
                        onChange={e => setModalConfig({ ...modalConfig, zhipuKey: e.target.value })}
                        placeholder="粘贴智谱开放平台 API Key"
                        className="novip-ai-input"
                      />
                      <button
                        type="button"
                        className="novip-ai-eye-btn"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {(activeTab === 'custom' || activeTab === 'siliconflow') && (
                <>
                  <div className="novip-ai-info-box">
                    <strong>⚡️ 自定义 OpenAI 兼容接口 / 硅基流动</strong>
                    <div>
                      支持 SiliconFlow（含免费 DeepSeek / Qwen 模型）、Groq、Kimi、Ollama、OneAPI 等任何兼容 <code>/v1/chat/completions</code> 规范的服务。
                    </div>
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>API Base URL</span>
                    </label>
                    <input
                      type="text"
                      value={modalConfig.customBaseUrl || 'https://api.siliconflow.cn/v1'}
                      onChange={e => setModalConfig({ ...modalConfig, customBaseUrl: e.target.value })}
                      placeholder="https://api.siliconflow.cn/v1"
                      className="novip-ai-input"
                    />
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>模型名称 (Model)</span>
                    </label>
                    <input
                      type="text"
                      value={modalConfig.customModel || 'Qwen/Qwen2.5-7B-Instruct'}
                      onChange={e => setModalConfig({ ...modalConfig, customModel: e.target.value })}
                      placeholder="例如: Qwen/Qwen2.5-7B-Instruct 或 deepseek-ai/DeepSeek-V3"
                      className="novip-ai-input"
                    />
                  </div>

                  <div className="novip-ai-form-group">
                    <label className="novip-ai-form-label">
                      <span>API Key</span>
                    </label>
                    <div className="novip-ai-input-wrap">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={modalConfig.customKey || ''}
                        onChange={e => setModalConfig({ ...modalConfig, customKey: e.target.value })}
                        placeholder="sk-..."
                        className="novip-ai-input"
                      />
                      <button
                        type="button"
                        className="novip-ai-eye-btn"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'local' && (
                <div className="novip-ai-info-box">
                  <strong>🛡️ NOVIP 端侧内置规则求解引擎</strong>
                  <p style={{ marginTop: '6px' }}>
                    无需任何 API Key，无需网络连接，100% 在你的浏览器本地极速运算。针对大学生报名照规格、算分反推、请假文案、文献排版等高频场景提供精准定制解答。
                  </p>
                </div>
              )}

              {/* 连通性测试区 */}
              <div className="novip-ai-test-row">
                <button
                  type="button"
                  className="novip-ai-test-btn"
                  onClick={handleTestConnection}
                  disabled={testState.loading}
                >
                  <RefreshCw size={13} className={testState.loading ? 'novip-ai-spin-icon' : ''} />
                  <span>{testState.loading ? '正在测试连通性…' : '测试 API 连接'}</span>
                </button>

                {testState.result && (
                  <div
                    className={`novip-ai-test-feedback ${testState.result.ok ? 'success' : 'error'}`}
                  >
                    {testState.result.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span>{testState.result.message}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="novip-ai-modal-footer">
              <button
                type="button"
                className="novip-ai-cancel-btn"
                onClick={() => setShowSettings(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="novip-ai-save-btn"
                onClick={handleSaveSettings}
              >
                保存并启用
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolPage>
  );
}
