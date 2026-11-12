// 404 副标题契约测试（jsdom + React act）
// 覆盖：not-found-core NOT_FOUND_SUBTITLE 常量值 → NotFound.tsx 实际渲染
// 背景：phase8-share-recent-404.test.ts 已锁定 NOT_FOUND_TITLE 与 NOT_FOUND_ATTITUDE 的
// 文案值，但 NOT_FOUND_SUBTITLE 在主分支 tests/ 与全部 open PR 分支 tests/ 中均零直接
// 引用（Round 105 全量运行时导出审计：792 项导出 → 去重后剩余 38 项之一）。
// 本文件只新增测试，不改生产代码。
// 运行：npm test（node --import tsx --test tests/*.test.ts）
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

import {
  NOT_FOUND_SUBTITLE,
  NOT_FOUND_TITLE,
  NOT_FOUND_ATTITUDE,
} from '../src/tools/not-found-core';
import {tools} from '../src/tools/registry';

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => {render: (n: unknown) => void; unmount: () => void};
let NotFound: (props: {navigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void}) => unknown;
let dom: import('jsdom').JSDOM;

const savedWindow = (globalThis as Record<string, unknown>).window;
const savedDocument = (globalThis as Record<string, unknown>).document;
const savedNavigator = (globalThis as Record<string, unknown>).navigator;

function subtitleEl(): HTMLElement {
  const el = dom.window.document.querySelector('.not-found-subtitle');
  assert.ok(el, '404 页应当渲染 .not-found-subtitle');
  return el as HTMLElement;
}

let currentRoot: {render: (n: unknown) => void; unmount: () => void} | null = null;

async function renderNotFound(navigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void) {
  if (currentRoot) {
    const old = currentRoot;
    currentRoot = null;
    await act(async () => {
      old.unmount();
    });
  }
  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  currentRoot = root;
  await act(async () => {
    root.render(React.createElement(NotFound, navigate ? {navigate} : {}));
  });
  return root;
}

before(async () => {
  const {JSDOM} = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url: 'http://localhost/'});
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react');
  ({act} = React);
  ({createRoot} = await import('react-dom/client'));
  ({default: NotFound} = await import('../src/tools/NotFound'));
});

after(() => {
  (globalThis as Record<string, unknown>).window = savedWindow;
  (globalThis as Record<string, unknown>).document = savedDocument;
  Object.defineProperty(globalThis, 'navigator', {value: savedNavigator, configurable: true});
});

describe('404 副标题 — 常量值（not-found-core）', () => {
  it('NOT_FOUND_SUBTITLE 逐字锁定', () => {
    assert.equal(NOT_FOUND_SUBTITLE, '你可能访问了失效的链接，或者这个页面已经调整了地址。');
  });

  it('文案形状：非空、无首尾空白、以中文句号结尾、与标题不同、不含 VIP 字样', () => {
    assert.ok(NOT_FOUND_SUBTITLE.length > 0);
    assert.equal(NOT_FOUND_SUBTITLE, NOT_FOUND_SUBTITLE.trim());
    assert.ok(NOT_FOUND_SUBTITLE.endsWith('。'));
    assert.notEqual(NOT_FOUND_SUBTITLE, NOT_FOUND_TITLE);
    assert.ok(!NOT_FOUND_SUBTITLE.includes('VIP'));
    assert.ok(!NOT_FOUND_SUBTITLE.includes('充值'));
  });
});

describe('404 副标题 — NotFound.tsx 实际渲染', () => {
  it('.not-found-subtitle 存在且唯一', async () => {
    await renderNotFound();
    assert.equal(dom.window.document.querySelectorAll('.not-found-subtitle').length, 1);
  });

  it('副标题文本逐字等于常量', async () => {
    await renderNotFound();
    assert.equal(subtitleEl().textContent, NOT_FOUND_SUBTITLE);
  });

  it('副标题是 <p> 元素', async () => {
    await renderNotFound();
    assert.equal(subtitleEl().tagName, 'P');
  });

  it('副标题位于 .not-found-banner 内', async () => {
    await renderNotFound();
    const banner = dom.window.document.querySelector('.not-found-banner');
    assert.ok(banner, '应当渲染 .not-found-banner');
    assert.ok(banner.contains(subtitleEl()));
  });

  it('DOM 顺序：404 码 → 标题 → 副标题 → 态度卡', async () => {
    await renderNotFound();
    const banner = dom.window.document.querySelector('.not-found-banner')!;
    const order = [...banner.querySelectorAll('.not-found-code, .not-found-title, .not-found-subtitle, .not-found-attitude-card')]
      .map((el) => el.className);
    assert.deepEqual(order, ['not-found-code', 'not-found-title', 'not-found-subtitle', 'not-found-attitude-card']);
    assert.equal(dom.window.document.querySelector('.not-found-code')?.textContent, '404');
  });

  it('标题逐字等于 NOT_FOUND_TITLE（副标题的同屏对照）', async () => {
    await renderNotFound();
    assert.equal(dom.window.document.querySelector('.not-found-title')?.textContent, NOT_FOUND_TITLE);
  });

  it('态度文本逐字等于 NOT_FOUND_ATTITUDE', async () => {
    await renderNotFound();
    assert.equal(
      dom.window.document.querySelector('.not-found-attitude-text')?.textContent,
      NOT_FOUND_ATTITUDE,
    );
  });

  it('推荐卡片恰好 6 张，每张有工具名、卖点与链接', async () => {
    await renderNotFound();
    const cards = [...dom.window.document.querySelectorAll('.not-found-card')];
    assert.equal(cards.length, 6);
    for (const card of cards) {
      assert.ok((card.querySelector('h3')?.textContent ?? '').length > 0, '卡片应当有工具名');
      assert.ok((card.querySelector('p')?.textContent ?? '').length > 0, '卡片应当有卖点文案');
      assert.ok((card as HTMLAnchorElement).getAttribute('href')?.startsWith('/tools/'), '卡片链接应当是 /tools/ 路径');
    }
  });

  it('推荐卡片链接全部是 registry 真实工具路径且无重复', async () => {
    await renderNotFound();
    const hrefs = [...dom.window.document.querySelectorAll('.not-found-card')]
      .map((card) => (card as HTMLAnchorElement).getAttribute('href'));
    const registryPaths = new Set(tools.map((t) => t.path));
    for (const href of hrefs) {
      assert.ok(href && registryPaths.has(href), `卡片链接 ${href} 应当是 registry 真实路径`);
    }
    assert.equal(new Set(hrefs).size, hrefs.length, '推荐卡片链接不应重复');
  });

  it('返回首页链接指向 /', async () => {
    await renderNotFound();
    const home = dom.window.document.querySelector('a.study-btn');
    assert.ok(home, '应当渲染返回首页链接');
    assert.equal((home as HTMLAnchorElement).getAttribute('href'), '/');
    assert.ok((home.textContent ?? '').includes('返回 NOVIP 工具首页'));
  });

  it('点击返回首页会调用 navigate 回调，且副标题仍在', async () => {
    let calls = 0;
    await renderNotFound(() => {
      calls += 1;
    });
    const home = dom.window.document.querySelector('a.study-btn') as HTMLElement;
    await act(async () => {
      home.click();
    });
    assert.equal(calls, 1);
    assert.equal(subtitleEl().textContent, NOT_FOUND_SUBTITLE);
  });

  it('卸载后重新挂载，副标题不变', async () => {
    const root = await renderNotFound();
    assert.equal(subtitleEl().textContent, NOT_FOUND_SUBTITLE);
    await act(async () => {
      root.unmount();
    });
    assert.equal(dom.window.document.querySelector('.not-found-subtitle'), null);
    await renderNotFound();
    assert.equal(subtitleEl().textContent, NOT_FOUND_SUBTITLE);
  });
});
