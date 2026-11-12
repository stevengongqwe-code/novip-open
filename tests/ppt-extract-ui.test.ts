import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

type AnyRecord = Record<string, unknown>;

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (container: Element) => {render: (node: unknown) => void; unmount: () => void};
let PptExtract: () => unknown;
let Home: (props: {navigate: (e: unknown) => void}) => unknown;
let dom: import('jsdom').JSDOM;
let root: {render: (node: unknown) => void; unmount: () => void};
const downloads: {name: string; size: number}[] = [];

const btn = (text: string): HTMLButtonElement => {
  const found = [...dom.window.document.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(text),
  );
  assert.ok(found, `找不到按钮：${text}`);
  return found as HTMLButtonElement;
};

const click = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).click();
  });
};

const settle = async (ms = 60) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const bodyText = () => dom.window.document.body.textContent ?? '';

before(async () => {
  const {JSDOM} = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/tools/ppt-extract',
  });
  (globalThis as AnyRecord).window = dom.window;
  (globalThis as AnyRecord).document = dom.window.document;
  (globalThis as AnyRecord).localStorage = dom.window.localStorage;
  (globalThis as AnyRecord).PopStateEvent = dom.window.PopStateEvent;
  (globalThis as AnyRecord).requestAnimationFrame =
    dom.window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
  (globalThis as AnyRecord).cancelAnimationFrame =
    dom.window.cancelAnimationFrame ?? ((id: number) => clearTimeout(id));
  Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
  (globalThis as AnyRecord).Blob = dom.window.Blob;
  (globalThis as AnyRecord).File = dom.window.File;
  (globalThis as AnyRecord).URL = dom.window.URL;
  (globalThis as AnyRecord).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(dom.window.URL, 'createObjectURL', {
    value: (blob: Blob) => {
      downloads.push({name: '__blob__', size: blob.size});
      return `blob:ppt-${downloads.length}`;
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'revokeObjectURL', {value: () => undefined, configurable: true});
  dom.window.HTMLAnchorElement.prototype.click = function () {
    const anchor = this as unknown as HTMLAnchorElement;
    if (downloads.length > 0 && downloads[downloads.length - 1].name === '__blob__') {
      downloads[downloads.length - 1].name = anchor.download;
    } else {
      downloads.push({name: anchor.download, size: 0});
    }
  };

  React = (await import('react')).default;
  ({act} = await import('react'));
  ({createRoot} = await import('react-dom/client'));
  PptExtract = (await import('../src/tools/PptExtract.tsx')).default;
  Home = (await import('../src/tools/Home.tsx')).default;
  root = createRoot(dom.window.document.getElementById('root')!);
});

describe('PPT图片提取页 UI 与新版首页分类交互', () => {
  it('载入示例课件 PPTX -> 展示幻灯片页码与去重统计 -> 切换幻灯片筛选 -> 打包下载 ZIP', async () => {
    await act(async () => {
      root.render(React.createElement(PptExtract as never));
    });
    await settle(40);
    assert.ok(bodyText().includes('PPT图片提取'), '应渲染页面标题');
    assert.ok(bodyText().includes('本机内存运算 · 零上传'), '应显示工作台顶部本地信任状态栏');

    await click(btn('载入示例课件 PPTX'));
    await settle(100);
    assert.ok(bodyText().includes('3 页'), '应显示 3 页幻灯片统计');
    assert.ok(bodyText().includes('P01-image1.png'), '应列出提取出的图表 PNG');
    assert.ok(bodyText().includes('P02-diagram.svg'), '应列出提取出的矢量 SVG');

    // 按幻灯片页码筛选第 2 页
    const slideSelect = dom.window.document.querySelector(
      'select[aria-label="按幻灯片页码筛选"]',
    ) as HTMLSelectElement;
    assert.ok(slideSelect);
    await act(async () => {
      slideSelect.value = '2';
      slideSelect.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    });
    await settle(40);
    assert.ok(bodyText().includes('P02-diagram.svg'));

    // 切回全部幻灯片并下载 ZIP
    await act(async () => {
      slideSelect.value = 'all';
      slideSelect.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    });
    await settle(40);
    downloads.length = 0;
    await click(btn('一键打包下载全部'));
    await settle(40);
    const zipDownload = downloads.find((d) => d.name.endsWith('.zip'));
    assert.ok(zipDownload, '应触发 ZIP 下载');
    assert.ok(zipDownload.size > 200, 'ZIP 内容非空');
  });

  it('新版 SaaS 首页：展示精选高频聚光灯、分类 Tab 筛选与搜索快捷直达', async () => {
    await act(async () => {
      root.render(React.createElement(Home as never, {navigate: () => undefined}));
    });
    await settle(40);
    assert.ok(bodyText().includes('精选高频 & 近期上新'), '应展示精选高频聚光灯专区');
    assert.ok(bodyText().includes('PPT图片提取'), '聚光灯与列表应包含新工具 PPT图片提取');

    // 点击「实用计算」分类 Tab，只显示实用计算工具
    await click(btn('实用计算'));
    await settle(30);
    assert.ok(bodyText().includes('房贷与利息计算器'), '应显示实用计算分类下的工具');
    assert.ok(!bodyText().includes('精选高频 & 近期上新'), '切换到单一分类时应收起聚光灯以聚焦当前分类');
  });
});

after(async () => {
  await act(async () => {
    root?.unmount();
  });
  dom?.window.close();
});
