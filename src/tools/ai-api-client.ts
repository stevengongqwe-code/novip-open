/**
 * ai-api-client.ts
 * NOVIP 助手 · 外部免费 AI API 客户端与端侧多引擎调度中心
 *
 * 核心特性：
 * 1. 优先调用 Google Gemini 官方免费 API（gemini-1.5-flash / gemini-2.0-flash，1500次/天免费额度）；
 * 2. 支持国内直连永久免费模型（智谱 GLM-4-Flash，免翻墙、免代理）；
 * 3. 支持 SiliconFlow（硅基流动 Qwen/DeepSeek）与任意自定义 OpenAI 兼容接口；
 * 4. 零配置与离线自愈：未配置 Key 或网络不可达时，无缝降级至 NOVIP 端侧本地学业求解引擎；
 * 5. 严格保护隐私：API Key 仅保存在用户本地浏览器 LocalStorage，绝不上传至 NOVIP 服务端。
 */

import { tools, type ToolID } from './registry';
import { solveAiQuery, type AiChatMessage } from './ai-core';

export type AiProvider = 'gemini' | 'zhipu' | 'siliconflow' | 'custom' | 'local';

export interface AiConfig {
  provider: AiProvider;
  geminiKey: string;
  geminiBaseUrl: string; // 默认同域 EdgeOne 边缘路由 /api/ai/chat，也可自定义
  geminiModel: string;   // 默认 gemini-1.5-flash
  zhipuKey: string;
  zhipuModel: string;    // 默认 glm-4-flash
  customKey: string;
  customBaseUrl: string;
  customModel: string;
  temperature: number;
}

const STORAGE_KEY = 'novip_ai_api_config_v1';

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'gemini',
  geminiKey: '',
  geminiBaseUrl: '/api/ai/chat',
  geminiModel: 'gemini-1.5-flash',
  zhipuKey: '',
  zhipuModel: 'glm-4-flash',
  customKey: '',
  customBaseUrl: 'https://api.siliconflow.cn/v1',
  customModel: 'Qwen/Qwen2.5-7B-Instruct',
  temperature: 0.7,
};

export const NOVIP_SYSTEM_PROMPT = `你是 NOVIP 助手（No VIP Assistant），专门面向中国大学生的免费学业、生活与文件处理 AI 助手。
网站核心宗旨是：「大学生，别花冤枉钱。」
网站收录了 46 款高频纯前端免充值、无需登录、端侧处理文件的精品工具。

你的核心原则：
1. 语言真诚、清晰、接地气，直击大学生痛点，拒绝官话套话，给出第一步点哪里的实操指导；
2. 当用户的问题可以通过 NOVIP 站内现有工具解决时，请在回答中包含特殊的工具跳转标签：[NOVIP_TOOL:工具ID]（例如提到报名照时附带 [NOVIP_TOOL:photo]，多份PDF合并附带 [NOVIP_TOOL:files]）；
3. 擅长帮学生起草生病请假文案、开题与毕业答辩PPT大纲、期末成绩与GPA反推计算、参考文献 GB/T 7714 排版、简历求职、公式推导与代码编写。

站内常用核心工具ID与功能对照：
- photo: 蓝底/红底一寸二寸报名照制作，锁定100KB以内
- files: PDF合并、拆分、旋转、转Word/PPT
- timetable: 大学课程表排课与导出手机日历（ICS/Wakeup）
- leave-helper: 向辅导员和老师请假合规理由与微信措辞生成
- ppt-generate: 论文答辩、开题报告、课程设计 PPT 智能大纲与一键导出
- pdf-form: 奖学金申请表、审批表免打印在线打字填写与手写电子签名
- image-compress: 学信网、考研网图片精准压缩到指定 KB
- web-to-apk: 网页一键打包安卓 APK 安装包与 PWA 套件
- material-collector: 班长收作业与材料名单比对
- file-organizer: 考研/答辩材料批量重命名与编号
- docx-check: 毕业论文格式与排版规范自检
- references: 参考文献 GB/T 7714 规范生成
- grades: 平时分反推期末需考多少分、GPA绩点换算
- flowchart: Mermaid 算法、时序图、系统架构流程图制作
- media-converter: 视频提取 MP3、网课录音转音频、GIF动图制作
- handwrite: 打印文字转大学软面抄、方格信笺手写图片
- background: 证件照纯端侧红白蓝抠图换底色
- ocr: 图片与扫描件文字识别提取
- developer: JSON/Base64/URL/SHA256/UUID 开发者小工具
- college-nav: 全国高校教务系统与研招网直达导航
- cost: 商业软件收费替代与成本计算
- wishes: 功能许愿池`;

/**
 * 读取本地 AI 配置
 */
export function loadAiConfig(): AiConfig {
  if (typeof window === 'undefined') return DEFAULT_AI_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_AI_CONFIG, ...parsed };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

/**
 * 保存 AI 配置到本地
 */
export function saveAiConfig(patch: Partial<AiConfig>): AiConfig {
  const current = loadAiConfig();
  const next = { ...current, ...patch };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }
  return next;
}

/**
 * 从模型回复中提取 [NOVIP_TOOL:toolId] 工具推荐标签
 */
export function extractToolIds(text: string): ToolID[] {
  const matched = new Set<ToolID>();
  const regex = /\[NOVIP_TOOL:([a-z0-9-]+)\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const toolId = m[1] as ToolID;
    if (tools.some(t => t.id === toolId)) {
      matched.add(toolId);
    }
  }
  return Array.from(matched);
}

/**
 * 过滤回复文本中的 [NOVIP_TOOL:toolId] 标记，供界面整洁渲染
 */
export function cleanAssistantReply(text: string): string {
  return text.replace(/\[NOVIP_TOOL:[a-z0-9-]+\]/g, '').trim();
}

/**
 * 连通性测试
 */
export async function testAiConnection(
  config: AiConfig
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const start = Date.now();
  try {
    if (config.provider === 'local') {
      return { ok: true, latencyMs: 1, message: '本地端侧智能引擎就绪，响应零延迟！' };
    }

    if (config.provider === 'gemini') {
      const key = (config.geminiKey || '').trim();
      const baseUrl = (config.geminiBaseUrl || '/api/ai/chat').trim();
      const isSameOriginEndpoint = baseUrl.startsWith('/') || baseUrl.includes('/api/ai/chat');

      if (isSameOriginEndpoint) {
        // 同域 EdgeOne 边缘代理连通性测试
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (key) {
          headers['x-gemini-key'] = key;
        }

        const res = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'Ping' }),
        });

        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const errMsg = errJson?.message || `HTTP ${res.status}`;
          return { ok: false, latencyMs, message: `Gemini 服务未就绪 (${errMsg})` };
        }
        return {
          ok: true,
          latencyMs,
          message: key
            ? `私有 Gemini Key 直连成功！延迟 ${latencyMs}ms`
            : `全站 Gemini 官方大模型直连正常！延迟 ${latencyMs}ms`,
        };
      }

      // 外部自定义 BaseUrl 模式
      if (!key) {
        return { ok: false, latencyMs: 0, message: '使用外部代理时请先填写 Google Gemini API Key' };
      }
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const model = config.geminiModel || 'gemini-1.5-flash';
      const url = `${cleanBase}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0.1 },
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, latencyMs, message: `Gemini API 响应异常 (HTTP ${res.status}): ${errText.slice(0, 150)}` };
      }
      return { ok: true, latencyMs, message: `Gemini API 连接成功！延迟 ${latencyMs}ms` };
    }

    if (config.provider === 'zhipu') {
      const key = (config.zhipuKey || '').trim();
      if (!key) {
        return { ok: false, latencyMs: 0, message: '请先填写智谱 API Key' };
      }
      const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: config.zhipuModel || 'glm-4-flash',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10,
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, latencyMs, message: `智谱 API 异常 (HTTP ${res.status}): ${errText.slice(0, 150)}` };
      }
      return { ok: true, latencyMs, message: `智谱 GLM-4-Flash 连接成功！延迟 ${latencyMs}ms` };
    }

    if (config.provider === 'siliconflow' || config.provider === 'custom') {
      const key = (config.customKey || '').trim();
      if (!key) {
        return { ok: false, latencyMs: 0, message: '请先填写 API Key' };
      }
      const baseUrl = (config.customBaseUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
      const url = `${baseUrl}/chat/completions`;
      const model = config.customModel || 'Qwen/Qwen2.5-7B-Instruct';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10,
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, latencyMs, message: `接口响应异常 (HTTP ${res.status}): ${errText.slice(0, 150)}` };
      }
      return { ok: true, latencyMs, message: `大模型接口连接成功！延迟 ${latencyMs}ms` };
    }

    return { ok: false, latencyMs: 0, message: '未知的模型提供商' };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return {
        ok: false,
        latencyMs,
        message: '网络无法连接或被浏览器安全策略阻止。如果您在中国大陆，调用 Gemini 建议配置国内中转代理或改用智谱清言（国内免代理直连）。',
      };
    }
    return { ok: false, latencyMs, message: `测试失败: ${msg}` };
  }
}

export interface CallAiResponse {
  reply: string;
  matchedToolIds: ToolID[];
  providerUsed: AiProvider;
  modelUsed: string;
  isFallback: boolean;
  fallbackReason?: string;
}

/**
 * 核心调度方法：调用配置的免费 AI API，失败或未配置时自动回退至端侧智能引擎
 */
export async function callNovipAi(
  query: string,
  history: AiChatMessage[] = [],
  overrideConfig?: AiConfig
): Promise<CallAiResponse> {
  const config = overrideConfig || loadAiConfig();

  // 若明确选了本地端侧引擎，或未配置任何远程 Key，直接执行本地专家求解
  if (config.provider === 'local') {
    const local = solveAiQuery(query, history);
    return {
      reply: local.reply,
      matchedToolIds: local.matchedToolIds,
      providerUsed: 'local',
      modelUsed: '端侧规则求解引擎',
      isFallback: false,
    };
  }

  // 1. 优先调用 Google Gemini API（通过同域 EdgeOne 边缘全球直连或外部配置）
  if (config.provider === 'gemini') {
    const key = (config.geminiKey || '').trim();
    const baseUrl = (config.geminiBaseUrl || '/api/ai/chat').trim();
    const isSameOriginEndpoint = baseUrl.startsWith('/') || baseUrl.includes('/api/ai/chat');

    if (isSameOriginEndpoint) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (key) {
          headers['x-gemini-key'] = key;
        }

        const res = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query,
            history: history.slice(-6).map(m => ({ role: m.role, content: m.content })),
            model: config.geminiModel || 'gemini-1.5-flash',
            temperature: config.temperature ?? 0.7,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const errMsg = errJson?.message || `HTTP ${res.status}`;
          throw new Error(errMsg);
        }

        const data = await res.json();
        const rawText = data?.reply;
        if (!rawText || typeof rawText !== 'string') {
          throw new Error(data?.message || 'Gemini 边缘路由未返回回答文本');
        }

        const extractedTools = extractToolIds(rawText);
        const cleanReply = cleanAssistantReply(rawText);

        // 若大模型回复中未提取到工具，从本地关键词库补充匹配
        const localHints = solveAiQuery(query, history).matchedToolIds;
        const combinedTools = Array.from(new Set([...extractedTools, ...localHints])).slice(0, 4);

        return {
          reply: cleanReply,
          matchedToolIds: combinedTools,
          providerUsed: 'gemini',
          modelUsed: data.model || config.geminiModel || 'gemini-1.5-flash',
          isFallback: false,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[NOVIP AI] 全站 Gemini 直连暂未响应，平滑降级至本地引擎:', msg);
        const local = solveAiQuery(query, history);
        return {
          reply: local.reply,
          matchedToolIds: local.matchedToolIds,
          providerUsed: 'local',
          modelUsed: '端侧规则求解引擎 (Gemini 离线兜底)',
          isFallback: true,
          fallbackReason: `Gemini 云端调用提示（${msg}），已自动切换为本地专家引擎为您解答。`,
        };
      }
    }

    // 外部自定义 BaseUrl 模式
    if (!key) {
      const local = solveAiQuery(query, history);
      return {
        reply: local.reply,
        matchedToolIds: local.matchedToolIds,
        providerUsed: 'local',
        modelUsed: '端侧求解引擎 (未填 Gemini Key)',
        isFallback: true,
        fallbackReason: '未填写 Gemini API Key，已无缝切换至本地智能引擎。',
      };
    }

    try {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const model = config.geminiModel || 'gemini-1.5-flash';
      const url = `${cleanBase}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

      // 组装多轮历史
      const contents = history.slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      contents.push({
        role: 'user',
        parts: [{ text: query }],
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: NOVIP_SYSTEM_PROMPT }],
          },
          generationConfig: {
            temperature: config.temperature ?? 0.7,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`HTTP ${res.status}: ${errDetail.slice(0, 150)}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText || typeof rawText !== 'string') {
        throw new Error('Gemini API 未返回文本内容');
      }

      const extractedTools = extractToolIds(rawText);
      const cleanReply = cleanAssistantReply(rawText);

      // 若大模型回复中未提取到工具，从本地关键词库补充匹配
      const localHints = solveAiQuery(query, history).matchedToolIds;
      const combinedTools = Array.from(new Set([...extractedTools, ...localHints])).slice(0, 4);

      return {
        reply: cleanReply,
        matchedToolIds: combinedTools,
        providerUsed: 'gemini',
        modelUsed: model,
        isFallback: false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[NOVIP AI] 外部 Gemini 调用失败，平滑降级至本地引擎:', msg);
      const local = solveAiQuery(query, history);
      return {
        reply: local.reply,
        matchedToolIds: local.matchedToolIds,
        providerUsed: 'local',
        modelUsed: '端侧规则求解引擎 (Gemini 故障降级)',
        isFallback: true,
        fallbackReason: `Gemini API 调用异常（${msg}），已自动切换为本地引擎为您解答。`,
      };
    }
  }

  // 2. 调用智谱 GLM-4-Flash
  if (config.provider === 'zhipu') {
    const key = (config.zhipuKey || '').trim();
    if (!key) {
      const local = solveAiQuery(query, history);
      return {
        reply: local.reply,
        matchedToolIds: local.matchedToolIds,
        providerUsed: 'local',
        modelUsed: '端侧求解引擎 (未填智谱 Key)',
        isFallback: true,
        fallbackReason: '未填写智谱 API Key，已自动切换至本地引擎。',
      };
    }

    try {
      const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
      const messages = [
        { role: 'system', content: NOVIP_SYSTEM_PROMPT },
        ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: query },
      ];

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: config.zhipuModel || 'glm-4-flash',
          messages,
          temperature: config.temperature ?? 0.7,
        }),
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`HTTP ${res.status}: ${errDetail.slice(0, 150)}`);
      }

      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText || typeof rawText !== 'string') {
        throw new Error('智谱 API 未返回有效内容');
      }

      const extractedTools = extractToolIds(rawText);
      const cleanReply = cleanAssistantReply(rawText);
      const localHints = solveAiQuery(query, history).matchedToolIds;
      const combinedTools = Array.from(new Set([...extractedTools, ...localHints])).slice(0, 4);

      return {
        reply: cleanReply,
        matchedToolIds: combinedTools,
        providerUsed: 'zhipu',
        modelUsed: config.zhipuModel || 'glm-4-flash',
        isFallback: false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[NOVIP AI] 智谱 API 调用失败，平滑降级至本地引擎:', msg);
      const local = solveAiQuery(query, history);
      return {
        reply: local.reply,
        matchedToolIds: local.matchedToolIds,
        providerUsed: 'local',
        modelUsed: '端侧规则求解引擎 (智谱 故障降级)',
        isFallback: true,
        fallbackReason: `智谱 API 异常（${msg}），已自动切换为本地引擎。`,
      };
    }
  }

  // 3. 自定义 OpenAI 兼容接口
  if (config.provider === 'siliconflow' || config.provider === 'custom') {
    const key = (config.customKey || '').trim();
    if (!key) {
      const local = solveAiQuery(query, history);
      return {
        reply: local.reply,
        matchedToolIds: local.matchedToolIds,
        providerUsed: 'local',
        modelUsed: '端侧求解引擎 (未填自定义 Key)',
        isFallback: true,
        fallbackReason: '未填写 API Key，已切换为本地引擎。',
      };
    }

    try {
      const baseUrl = (config.customBaseUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
      const url = `${baseUrl}/chat/completions`;
      const model = config.customModel || 'Qwen/Qwen2.5-7B-Instruct';

      const messages = [
        { role: 'system', content: NOVIP_SYSTEM_PROMPT },
        ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: query },
      ];

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: config.temperature ?? 0.7,
        }),
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`HTTP ${res.status}: ${errDetail.slice(0, 150)}`);
      }

      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText || typeof rawText !== 'string') {
        throw new Error('接口未返回文本内容');
      }

      const extractedTools = extractToolIds(rawText);
      const cleanReply = cleanAssistantReply(rawText);
      const localHints = solveAiQuery(query, history).matchedToolIds;
      const combinedTools = Array.from(new Set([...extractedTools, ...localHints])).slice(0, 4);

      return {
        reply: cleanReply,
        matchedToolIds: combinedTools,
        providerUsed: config.provider,
        modelUsed: model,
        isFallback: false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[NOVIP AI] 自定义大模型接口调用失败，平滑降级至本地引擎:', msg);
      const local = solveAiQuery(query, history);
      return {
        reply: local.reply,
        matchedToolIds: local.matchedToolIds,
        providerUsed: 'local',
        modelUsed: '端侧求解引擎 (接口故障降级)',
        isFallback: true,
        fallbackReason: `大模型接口调用异常（${msg}），已自动切换为本地引擎。`,
      };
    }
  }

  // 兜底本地
  const local = solveAiQuery(query, history);
  return {
    reply: local.reply,
    matchedToolIds: local.matchedToolIds,
    providerUsed: 'local',
    modelUsed: '端侧规则求解引擎',
    isFallback: false,
  };
}
