import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

type AnyRecord = Record<string, unknown>;

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (container: Element) => {render: (node: unknown) => void; unmount: () => void};
let ImageWatermark: () => unknown;
let dom: import('jsdom').JSDOM;
let root: {render: (node: unknown) => void; unmount: () => void};
const downloads: {name: string; size: number}[] = [];

const pngHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(2048);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes[11] = 13;
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const pngFile = (name: string, width: number, height: number) => {
  const bytes = pngHeader(width, height);
  return new dom.window.File([bytes], name, {type: 'image/png'});
};

const btn = (text: string): HTMLButtonElement => {
  const found = [...dom.window.document.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(text),
  );
  assert.ok(found, `找不到按钮：${text}`);
  return found as HTMLButtonElement;
};

const setInputValue = (element: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
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
    url: 'http://localhost/tools/image-watermark',
  });
  (globalThis as AnyRecord).window = dom.window;
  (globalThis as AnyRecord).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
  (globalThis as AnyRecord).Blob = dom.window.Blob;
  (globalThis as AnyRecord).File = dom.window.File;
  (globalThis as AnyRecord).URL = dom.window.URL;
  (globalThis as AnyRecord).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(dom.window.URL, 'createObjectURL', {
    value: (blob: Blob) => {
      downloads.push({name: '__pending__', size: blob.size});
      return `blob:wm-${downloads.length}`;
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'revokeObjectURL', {value: () => undefined, configurable: true});
  dom.window.HTMLAnchorElement.prototype.click = function () {
    const anchor = this as unknown as HTMLAnchorElement;
    if (downloads.length > 0 && downloads[downloads.length - 1].name === '__pending__') {
      downloads[downloads.length - 1].name = anchor.download;
    } else {
      downloads.push({name: anchor.download, size: 0});
    }
  };

  (dom.window.HTMLCanvasElement.prototype as AnyRecord).getContext = function () {
    return {
      canvas: this,
      fillStyle: '#000000',
      strokeStyle: '#ffffff',
      lineWidth: 1,
      lineJoin: 'round',
      font: '16px sans-serif',
      textAlign: 'center',
      textBaseline: 'middle',
      globalAlpha: 1,
      clearRect: () => undefined,
      fillRect: () => undefined,
      drawImage: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      measureText: (txt: string) => ({width: txt.length * 16}),
      fillText: () => undefined,
      strokeText: () => undefined,
    };
  };
  (dom.window.HTMLCanvasElement.prototype as AnyRecord).toBlob = function (
    callback: (blob: Blob) => void,
    type?: string,
  ) {
    callback(new dom.window.Blob([new Uint8Array(1536)], {type: type ?? 'image/png'}));
  };
  (globalThis as AnyRecord).createImageBitmap = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 24 || bytes[0] !== 137) throw new Error('图片解码失败');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {width: view.getUint32(16), height: view.getUint32(20), close: () => undefined};
  };

  React = (await import('react')).default;
  ({act} = await import('react'));
  ({createRoot} = await import('react-dom/client'));
  ImageWatermark = (await import('../src/tools/ImageWatermark.tsx')).default;
  root = createRoot(dom.window.document.getElementById('root')!);
});

describe('图片加水印页 UI 集成测试', () => {
  it('首屏渲染模拟证件预览，切换校园预设与九宫格定位，空文字触发校验提示', async () => {
    await act(async () => {
      root.render(React.createElement(ImageWatermark as never));
    });
    await settle(60);
    assert.ok(bodyText().includes('图片加水印 / 证件防盗用水印'), '应渲染页面主标题');
    assert.ok(bodyText().includes('示例证件底图'), '未选图片时应显示示例证件底图预览');

    // 切换「右下角署名+日期戳」预设，自动切到九宫格模式
    await click(btn('右下角署名+日期戳'));
    await settle(40);
    assert.ok(bodyText().includes('九宫格位置'), '应出现九宫格位置选择器');
    await click(btn('左上'));
    await settle(30);

    // 清空主文字和副标题，应触发中文校验提示
    const mainInput = dom.window.document.querySelector('input[aria-label="水印主文字"]') as HTMLInputElement;
    assert.ok(mainInput);
    await act(async () => setInputValue(mainInput, ''));
    await click(btn('清空副标题'));
    await settle(30);
    assert.ok(bodyText().includes('请先输入水印文字'), '文字全空且无 Logo 时应显示校验警告');

    // 恢复报名证件预设
    await click(btn('报名证件防盗用'));
    await settle(40);
    assert.ok(!bodyText().includes('请先输入水印文字'), '恢复预设后警告消失');
  });

  it('批量上传 2 张图片 + Logo 图标，生成带水印图片并打包下载 ZIP', async () => {
    const fileInput = dom.window.document.querySelector(
      'input[aria-label="选择要加水印的图片"]',
    ) as HTMLInputElement;
    assert.ok(fileInput);
    Object.defineProperty(fileInput, 'files', {
      value: [pngFile('身份证正面.png', 1000, 630), pngFile('身份证反面.png', 1000, 630)],
      configurable: true,
    });
    await act(async () => {
      fileInput.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    });
    await settle(100);
    assert.ok(bodyText().includes('身份证正面.png'), '应展示第 1 张文件名');
    assert.ok(bodyText().includes('身份证反面.png'), '应展示第 2 张文件名');

    // 上传 Logo 图标
    const logoInput = dom.window.document.querySelector(
      'input[aria-label="上传 Logo 水印图片"]',
    ) as HTMLInputElement;
    Object.defineProperty(logoInput, 'files', {
      value: [pngFile('badge.png', 160, 160)],
      configurable: true,
    });
    await act(async () => {
      logoInput.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    });
    await settle(80);
    assert.ok(bodyText().includes('启用该 Logo 水印'), '应显示已加载的 Logo 选项');

    // 批量生成
    await click(btn('批量生成 2 张带水印图片'));
    await settle(150);
    assert.ok(bodyText().includes('身份证正面-加水印.png'), '应生成第 1 张结果');
    assert.ok(bodyText().includes('身份证反面-加水印.png'), '应生成第 2 张结果');

    // 一键打包下载 ZIP
    downloads.length = 0;
    await click(btn('一键打包下载 ZIP'));
    await settle(40);
    assert.equal(downloads.length, 1, '应触发一次 ZIP 下载');
    assert.ok(downloads[0].name.endsWith('.zip'), `下载文件名应以 .zip 结尾: ${downloads[0].name}`);
    assert.ok(downloads[0].size > 100, 'ZIP 字节流不应为空');
  });
});

after(async () => {
  await act(async () => {
    root?.unmount();
  });
  dom?.window.close();
});

