import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {tools, currentPage} from '../src/tools/registry';
import {
  generateShareCopy,
  getToolPitch,
  getToolUrl,
  renderShareCard,
  TOOL_PITCHES,
  SITE_URL,
} from '../src/tools/share-core';
import {
  recordRecentTool,
  getRecentTools,
  getLastUsedTool,
  clearRecentTools,
  RECENT_KEY,
  MAX_RECENT_TOOLS,
} from '../src/tools/recent-core';
import {
  getPopularTools,
  NOT_FOUND_TITLE,
  NOT_FOUND_ATTITUDE,
  POPULAR_RECOMMENDED_IDS,
} from '../src/tools/not-found-core';
import {pageSeo} from '../src/seo';

// 内存模拟 Storage 对象
function createMockStorage(initialData: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialData));
  let shouldThrow = false;

  return {
    getItem(key: string): string | null {
      if (shouldThrow) throw new Error('SecurityError: Access is denied');
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      if (shouldThrow) throw new Error('QuotaExceededError');
      store.set(key, value);
    },
    removeItem(key: string): void {
      if (shouldThrow) throw new Error('SecurityError');
      store.delete(key);
    },
    setThrow(val: boolean) {
      shouldThrow = val;
    },
    _raw() {
      return Object.fromEntries(store.entries());
    },
  };
}

// 模拟 Canvas 2D 上下文供 Node.js 环境测试
function createMockCanvasContext() {
  const calls: Array<{method: string; args: unknown[]}> = [];
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    fillRect(...args: unknown[]) {
      calls.push({method: 'fillRect', args});
    },
    strokeRect(...args: unknown[]) {
      calls.push({method: 'strokeRect', args});
    },
    fillText(...args: unknown[]) {
      calls.push({method: 'fillText', args});
    },
    beginPath() {
      calls.push({method: 'beginPath', args: []});
    },
    closePath() {
      calls.push({method: 'closePath', args: []});
    },
    moveTo(...args: unknown[]) {
      calls.push({method: 'moveTo', args});
    },
    lineTo(...args: unknown[]) {
      calls.push({method: 'lineTo', args});
    },
    arcTo(...args: unknown[]) {
      calls.push({method: 'arcTo', args});
    },
    fill() {
      calls.push({method: 'fill', args: []});
    },
    stroke() {
      calls.push({method: 'stroke', args: []});
    },
    save() {
      calls.push({method: 'save', args: []});
    },
    restore() {
      calls.push({method: 'restore', args: []});
    },
    measureText(text: string) {
      return {width: text.length * 8};
    },
  };
}

describe('目标 1：分享文案生成与本地卡片绘制 (share-core)', () => {
  it('所有核心反 VIP 工具均有一句话卖点', () => {
    const keyTools = ['photo-check', 'pdf-compress', 'pdf-merge-split', 'files', 'handwrite', 'references', 'sheets'];
    for (const id of keyTools) {
      const pitch = getToolPitch(id);
      assert.ok(pitch && pitch.length > 5, `工具 ${id} 卖点缺失或太短: ${pitch}`);
      assert.equal(pitch, TOOL_PITCHES[id]);
    }
  });

  it('未知工具 ID 优雅降级返回默认卖点', () => {
    const pitch = getToolPitch('unknown-non-existent-tool');
    assert.ok(pitch.includes('纯本地免费急救工具箱'));
  });

  it('生成合法直达链接，且不接任何第三方或付费短链服务', () => {
    for (const tool of tools) {
      const url = getToolUrl(tool.id);
      assert.ok(url.startsWith(SITE_URL), `URL 必须指向站点本身: ${url}`);
      // 严禁包含第三方短链服务域名
      assert.ok(!url.includes('bit.ly'), '禁止包含第三方短链 bit.ly');
      assert.ok(!url.includes('t.cn'), '禁止包含第三方短链 t.cn');
      assert.ok(!url.includes('dwz.cn'), '禁止包含第三方短链 dwz.cn');
    }
  });

  it('一键分享文案包含 NOVIP 标识、工具名、卖点、隐私优势与直达网址', () => {
    const copy = generateShareCopy('pdf-compress');
    assert.ok(copy.includes('【NOVIP】'), '必须包含 NOVIP 标识');
    assert.ok(copy.includes('PDF 压缩'), '必须包含工具名');
    assert.ok(copy.includes('卖点：'), '必须包含卖点字段');
    assert.ok(copy.includes('纯浏览器本地内存处理'), '必须声明本地处理优势');
    assert.ok(copy.includes('免登录无水印'), '必须声明免登录无水印');
    assert.ok(copy.includes('https://novip.site/tools/pdf-compress'), '必须包含直达链接');
  });

  it('本地 Canvas 分享卡片成功执行绘制指令且包含核心元素', () => {
    const mockCtx = createMockCanvasContext();
    const mockCanvas = {
      getContext: (type: string) => (type === '2d' ? (mockCtx as unknown as CanvasRenderingContext2D) : null),
      width: 640,
      height: 360,
    };

    renderShareCard(mockCanvas, 'photo-check');

    // 验证绘制指令被触发
    const filledTexts = mockCtx.calls
      .filter((c) => c.method === 'fillText')
      .map((c) => String(c.args[0]));

    assert.ok(filledTexts.some((t) => t.includes('NOVIP')), '卡片中必须绘制 NOVIP 品牌标识');
    assert.ok(filledTexts.some((t) => t.includes('报名照片') || t.includes('证件照')), '卡片中必须绘制工具名');
    assert.ok(filledTexts.some((t) => t.includes('novip.site')), '卡片中必须绘制网址');
    assert.ok(filledTexts.some((t) => t.includes('免登录 · 无水印 · 本地')), '卡片中必须绘制免登录特色标签');
  });
});

describe('目标 2：微信二次打开体验与最近使用记录 (recent-core)', () => {
  it('正确记录最近使用的工具并置于首位', () => {
    const storage = createMockStorage();
    const res1 = recordRecentTool('pdf-compress', storage);
    assert.deepEqual(res1, ['pdf-compress']);

    const res2 = recordRecentTool('photo-check', storage);
    assert.deepEqual(res2, ['photo-check', 'pdf-compress']);
  });

  it('重复访问已有工具自动移至首位且不产生重复', () => {
    const storage = createMockStorage();
    recordRecentTool('pdf-compress', storage);
    recordRecentTool('photo-check', storage);
    recordRecentTool('files', storage);

    // 再次访问 pdf-compress
    const res = recordRecentTool('pdf-compress', storage);
    assert.deepEqual(res, ['pdf-compress', 'files', 'photo-check']);
    assert.equal(new Set(res).size, 3, '列表中不可有重复项');
  });

  it('严格只保留最近使用的 3 个工具（满足微信二次打开体验）', () => {
    const storage = createMockStorage();
    recordRecentTool('developer', storage);
    recordRecentTool('text', storage);
    recordRecentTool('finance', storage);
    // 第 4 个工具
    const res = recordRecentTool('pdf-merge-split', storage);

    assert.equal(res.length, MAX_RECENT_TOOLS);
    assert.equal(res.length, 3);
    assert.deepEqual(res, ['pdf-merge-split', 'finance', 'text']);
  });

  it('忽略非工具页面（home、stats、not-found 或非法 ID）', () => {
    const storage = createMockStorage();
    recordRecentTool('pdf-compress', storage);
    recordRecentTool('home', storage);
    recordRecentTool('stats', storage);
    recordRecentTool('not-found', storage);
    recordRecentTool('invalid-tool-xxx', storage);

    const res = getRecentTools(storage);
    assert.deepEqual(res, ['pdf-compress'], '非工具页面不得混入最近使用记录');
  });

  it('getLastUsedTool 返回最新一次使用的工具', () => {
    const storage = createMockStorage();
    assert.equal(getLastUsedTool(storage), undefined);

    recordRecentTool('references', storage);
    recordRecentTool('handwrite', storage);
    assert.equal(getLastUsedTool(storage), 'handwrite');
  });

  it('clearRecentTools 成功清空记录', () => {
    const storage = createMockStorage();
    recordRecentTool('photo-check', storage);
    assert.equal(getRecentTools(storage).length, 1);

    const success = clearRecentTools(storage);
    assert.equal(success, true);
    assert.equal(getRecentTools(storage).length, 0);
  });

  it('存储异常（例如 Safari 无痕隐私模式抛错或损坏数据）时不崩溃', () => {
    const storage = createMockStorage({[RECENT_KEY]: '{bad json}'});
    // 损坏数据优雅降级为空数组
    assert.deepEqual(getRecentTools(storage), []);

    // 存储抛错时静默处理
    storage.setThrow(true);
    assert.doesNotThrow(() => {
      recordRecentTool('pdf-compress', storage);
      clearRecentTools(storage);
    });
  });
});

describe('目标 4：404 态度与热门工具推荐 (not-found-core)', () => {
  it('404 态度文案包含 NOVIP 态度与「这里没有 VIP，也没有这个页面」', () => {
    assert.equal(NOT_FOUND_TITLE, '这里没有 VIP，也没有这个页面');
    assert.ok(NOT_FOUND_ATTITUDE.includes('在 NOVIP，你找不到充值 VIP 的弹窗，也找不到这个页面'));
    assert.ok(NOT_FOUND_ATTITUDE.includes('完全免费、无需登录、不加水印'));
  });

  it('getPopularTools 包含高频反 VIP 工具且无重复', () => {
    const popular = getPopularTools(6);
    assert.equal(popular.length, 6);
    const ids = popular.map((t) => t.id);

    // 验证核心工具均在推荐之列
    for (const expectedId of POPULAR_RECOMMENDED_IDS) {
      assert.ok(ids.includes(expectedId), `推荐应包含 ${expectedId}`);
    }

    // 验证无重复
    assert.equal(new Set(ids).size, popular.length);

    // 验证每个工具都有合法路径与卖点
    for (const tool of popular) {
      assert.ok(tool.path.startsWith('/'), `路径必须合法: ${tool.path}`);
      assert.ok(tool.pitch.length > 0, `卖点不能为空: ${tool.name}`);
    }
  });

  it('支持自定义推荐条数 limit', () => {
    const list = getPopularTools(3);
    assert.equal(list.length, 3);
  });

  it('路由支持 404 页面判定，且保留对未知路径的兼容兜底', () => {
    assert.equal(currentPage('/404', ''), 'not-found');
    assert.equal(currentPage('/404.html', ''), 'not-found');
    // smoke 测试原有断言：/tools/not-exist 依然兜底到 home
    assert.equal(currentPage('/tools/not-exist', ''), 'home');
  });

  it('pageSeo 为 404 页面生成规范的 noindex 指令且不设 canonical', () => {
    const seo = pageSeo('not-found');
    assert.ok(seo.title.includes('这里没有 VIP，也没有这个页面'));
    assert.equal(seo.robots, 'noindex,follow');
    assert.equal(seo.canonical, '', '404 页面 canonical 必须为空避免索引');
  });
});
