import { describe, it } from 'node:test';
import assert from 'node:assert';
import { onRequestGet, onRequestPost } from '../edge-functions/api/ai/chat.js';

describe('EdgeOne 边缘函数 · NOVIP AI 直连网关 (edge-functions/api/ai/chat.js)', () => {
  it('01. onRequestGet 返回就绪状态与服务元数据', async () => {
    const res = onRequestGet();
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.service, 'NOVIP Edge AI Chat Gateway');
    assert.ok(data.model.includes('gemini'));
  });

  it('02. onRequestPost 处理 Ping 探测请求秒级响应', async () => {
    const req = new Request('https://novip.site/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': 'https://novip.site',
      },
      body: JSON.stringify({ query: 'Ping' }),
    });

    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.ok(data.message.includes('正常'));
  });

  it('03. onRequestPost 在服务端与客户端均无 Key 时给出明确的 503 与配置引导', async () => {
    const req = new Request('https://novip.site/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': 'https://novip.site',
      },
      body: JSON.stringify({ query: '如何向辅导员请假？' }),
    });

    const res = await onRequestPost({ request: req, env: { GEMINI_API_KEY: '' } });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.ok, false);
    assert.strictEqual(data.error, 'NO_KEY_CONFIGURED');
    assert.strictEqual(data.needConfig, true);
  });

  it('04. onRequestPost 拒绝空提问', async () => {
    const req = new Request('https://novip.site/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': 'https://novip.site',
      },
      body: JSON.stringify({ query: '   ' }),
    });

    const res = await onRequestPost({ request: req, env: { GEMINI_API_KEY: 'mock_key' } });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'EMPTY_PROMPT');
  });

  it('05. onRequestPost 成功转发 Google Gemini 并解析回复文本', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any, opts: any) => {
        if (String(url).includes('generativelanguage.googleapis.com')) {
          assert.ok(String(url).includes('key=test_server_key'));
          const body = JSON.parse(opts.body);
          assert.strictEqual(body.contents.length, 1);
          assert.strictEqual(body.contents[0].parts[0].text, '制作蓝底一寸照片');
          assert.ok(body.systemInstruction.parts[0].text.includes('NOVIP 助手'));

          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: '制作蓝底一寸照片可以使用 [NOVIP_TOOL:photo]，一键搞定。',
                      },
                    ],
                  },
                },
              ],
            }),
          } as Response;
        }
        return originalFetch(url, opts);
      };

      const req = new Request('https://novip.site/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://novip.site',
        },
        body: JSON.stringify({ query: '制作蓝底一寸照片' }),
      });

      const res = await onRequestPost({ request: req, env: { GEMINI_API_KEY: 'test_server_key' } });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.provider, 'gemini');
      assert.strictEqual(data.reply, '制作蓝底一寸照片可以使用 [NOVIP_TOOL:photo]，一键搞定。');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('06. onRequestPost 优先采用客户端请求头携带的私有 x-gemini-key', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let capturedKey = '';
      globalThis.fetch = async (url: any) => {
        const u = new URL(String(url));
        capturedKey = u.searchParams.get('key') || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              { content: { parts: [{ text: '回答来自私有 key' }] } },
            ],
          }),
        } as Response;
      };

      const req = new Request('https://novip.site/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://novip.site',
          'x-gemini-key': 'AIzaSyClientPersonalKey',
        },
        body: JSON.stringify({ query: '你好' }),
      });

      const res = await onRequestPost({ request: req, env: { GEMINI_API_KEY: 'server_default_key' } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(capturedKey, 'AIzaSyClientPersonalKey');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('07. onRequestPost 拦截恶意非法跨域调用', async () => {
    const req = new Request('https://novip.site/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': 'https://malicious-scam-site.com',
      },
      body: JSON.stringify({ query: '盗用你的 API' }),
    });

    const res = await onRequestPost({ request: req, env: { GEMINI_API_KEY: 'test_server_key' } });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.error, 'FORBIDDEN');
  });
});
