import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_AI_CONFIG,
  extractToolIds,
  cleanAssistantReply,
  loadAiConfig,
  saveAiConfig,
  callNovipAi,
  testAiConnection,
  type AiConfig,
} from '../src/tools/ai-api-client';

describe('NOVIP 助手 · 多提供商与 Gemini 优先调用引擎', () => {
  it('01. 默认优先配置为 Google Gemini 官方大模型与 EdgeOne 同域路由', () => {
    assert.strictEqual(DEFAULT_AI_CONFIG.provider, 'gemini');
    assert.strictEqual(DEFAULT_AI_CONFIG.geminiModel, 'gemini-1.5-flash');
    assert.strictEqual(DEFAULT_AI_CONFIG.geminiBaseUrl, '/api/ai/chat');
  });

  it('02. extractToolIds 能从大模型文本中精准提取站内有效工具 ID', () => {
    const sample = '建议你先制作蓝底一寸照片 [NOVIP_TOOL:photo]，然后如果体积太大，可以使用图片压缩 [NOVIP_TOOL:image-compress]；无效工具 [NOVIP_TOOL:non-existent-tool] 会被自动过滤。';
    const extracted = extractToolIds(sample);
    assert.ok(extracted.includes('photo'));
    assert.ok(extracted.includes('image-compress'));
    assert.strictEqual(extracted.includes('non-existent-tool' as any), false);
  });

  it('03. cleanAssistantReply 能清除标记标签，保持正文阅读整洁', () => {
    const raw = '你可以打开 [NOVIP_TOOL:files] 合并您的 PDF 文件。';
    const cleaned = cleanAssistantReply(raw);
    assert.strictEqual(cleaned, '你可以打开  合并您的 PDF 文件。');
  });

  it('04. testAiConnection 在外部模式未填写 Key 时给出友好的中文引导提示', async () => {
    const geminiRes = await testAiConnection({
      ...DEFAULT_AI_CONFIG,
      provider: 'gemini',
      geminiBaseUrl: 'https://generativelanguage.googleapis.com',
      geminiKey: '',
    });
    assert.strictEqual(geminiRes.ok, false);
    assert.ok(geminiRes.message.includes('Google Gemini API Key'));

    const zhipuRes = await testAiConnection({ ...DEFAULT_AI_CONFIG, provider: 'zhipu', zhipuKey: '' });
    assert.strictEqual(zhipuRes.ok, false);
    assert.ok(zhipuRes.message.includes('智谱 API Key'));

    const localRes = await testAiConnection({ ...DEFAULT_AI_CONFIG, provider: 'local' });
    assert.strictEqual(localRes.ok, true);
    assert.ok(localRes.message.includes('本地端侧智能引擎就绪'));
  });

  it('05. callNovipAi 在本地模式下毫秒级返回高质量专家解答', async () => {
    const res = await callNovipAi('我要把红底一寸照片换成蓝底并且压到100KB以内', [], {
      ...DEFAULT_AI_CONFIG,
      provider: 'local',
    });
    assert.strictEqual(res.providerUsed, 'local');
    assert.strictEqual(res.isFallback, false);
    assert.ok(res.matchedToolIds.includes('photo') || res.matchedToolIds.includes('background'));
    assert.ok(res.reply.includes('蓝底') || res.reply.includes('100KB'));
  });

  it('06. callNovipAi 在外部模式未填 Key 时无缝降级到本地引擎，不崩溃', async () => {
    const res = await callNovipAi('怎么做大学生课程表导入手机日历？', [], {
      ...DEFAULT_AI_CONFIG,
      provider: 'gemini',
      geminiBaseUrl: 'https://generativelanguage.googleapis.com',
      geminiKey: '',
    });
    assert.strictEqual(res.isFallback, true);
    assert.ok(res.fallbackReason?.includes('Gemini API Key'));
    assert.ok(res.matchedToolIds.includes('timetable'));
  });

  it('07. callNovipAi 成功调用同域 /api/ai/chat 边缘网关并解析推荐工具', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // 模拟 EdgeOne /api/ai/chat 边缘网关返回
      globalThis.fetch = async (url: any) => {
        if (String(url).includes('/api/ai/chat')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reply: '建议使用 NOVIP 的专属工具制作：[NOVIP_TOOL:photo] 可以自动更换蓝底并锁定小于 100KB。',
              model: 'gemini-1.5-flash',
              provider: 'gemini',
            }),
          } as Response;
        }
        return originalFetch(url);
      };

      const res = await callNovipAi('怎么弄蓝底一寸照片？', [], {
        ...DEFAULT_AI_CONFIG,
        provider: 'gemini',
        geminiKey: '', // 全站免配置模式，不需要客户端填 Key
      });

      assert.strictEqual(res.providerUsed, 'gemini');
      assert.strictEqual(res.isFallback, false);
      assert.strictEqual(res.modelUsed, 'gemini-1.5-flash');
      assert.ok(res.matchedToolIds.includes('photo'));
      assert.ok(res.reply.includes('建议使用 NOVIP 的专属工具制作： 可以自动更换蓝底并锁定小于 100KB。'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('08. callNovipAi 遇到网络异常自动平滑降级至本地引擎，确保服务高可用', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        throw new Error('Connection timeout to /api/ai/chat');
      };

      const res = await callNovipAi('毕业设计开题报告答辩PPT怎么构思？', [], {
        ...DEFAULT_AI_CONFIG,
        provider: 'gemini',
        geminiKey: '',
      });

      assert.strictEqual(res.isFallback, true);
      assert.strictEqual(res.providerUsed, 'local');
      assert.ok(res.fallbackReason?.includes('自动切换为本地专家引擎'));
      assert.ok(res.matchedToolIds.includes('ppt-generate') || res.matchedToolIds.includes('course'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
