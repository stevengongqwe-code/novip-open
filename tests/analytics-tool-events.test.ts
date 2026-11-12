/**
 * 工具任务埋点接线测试（OPERATION NIGHT SHIFT 2026-10-27）。
 * 背景：服务端 collect/public 一直支持 tool_start/tool_success/tool_error，
 * 但客户端从未发送，/stats 的开始/成功/失败只能来自过期或测试流量。
 * 本测试锁死三个 helper 的事件类型、toolId 与载荷卫生（无文件名/正文）。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';

type Payload = {type: string; toolId?: string; path: string; eid: string; ts: number; vid?: string};
const sent: Payload[] = [];

before(async () => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as Record<string, unknown>).location = {pathname: '/tools/references', hash: ''};
  Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true});
  (globalThis as Record<string, unknown>).fetch = async (_url: string, init: {body: string}) => {
    sent.push(JSON.parse(init.body) as Payload);
    return {ok: true, status: 200};
  };
});

describe('工具任务生命周期埋点', () => {
  it('trackToolStart/Success/Error 发送正确事件类型与 toolId', async () => {
    const {trackToolStart, trackToolSuccess, trackToolError} = await import('../src/analytics/client');
    trackToolStart('references');
    trackToolSuccess('references');
    trackToolError('references');
    assert.deepEqual(
      sent.map((p) => p.type),
      ['tool_start', 'tool_success', 'tool_error'],
    );
    assert.ok(sent.every((p) => p.toolId === 'references'));
    assert.ok(sent.every((p) => p.path === '/tools/references'));
  });

  it('每条事件 eid 唯一、ts 为数字（服务端重试幂等口径）', () => {
    assert.equal(new Set(sent.map((p) => p.eid)).size, sent.length, 'eid 不得重复');
    assert.ok(sent.every((p) => typeof p.ts === 'number' && Number.isSafeInteger(p.ts)));
  });

  it('载荷不含文件名、正文等用户数据字段', () => {
    const allowed = new Set(['type', 'toolId', 'path', 'vid', 'eid', 'ts', 'wmt']);
    for (const p of sent) {
      for (const key of Object.keys(p)) assert.ok(allowed.has(key), `出现未预期字段: ${key}`);
    }
  });
});
