// 文本工具箱 · UI 集成测试（jsdom + React 19 act）
// 覆盖：渲染 → 实时统计 → 整理操作叠加 → 行号/前后缀 → 大小写全半角 → 中文标点 →
//       查找替换 → 复制/下载/清空 → 超限中文错误。
// 浏览器无法访问本机回环地址时，此测试是 UI 层的真实执行验证。
// 运行：npm test（node --import tsx --test tests/*.test.ts）
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => { render: (n: unknown) => void };
let TextToolkit: () => unknown;
let dom: import('jsdom').JSDOM;

const downloads: { blob: Blob; name: string }[] = [];
let clipboardText = '';

const doc = () => dom.window.document;

async function settle(ms = 150) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle(40);
}

function button(label: string): HTMLButtonElement {
  const found = [...doc().querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === label);
  assert.ok(found, `找不到按钮：${label}`);
  return found as HTMLButtonElement;
}

function checkbox(label: string): HTMLInputElement {
  const found = [...doc().querySelectorAll('label')].find((l) => (l.textContent ?? '').trim() === label);
  assert.ok(found, `找不到复选框：${label}`);
  const input = found!.querySelector('input[type="checkbox"]');
  assert.ok(input, `复选框缺少 input：${label}`);
  return input as HTMLInputElement;
}

async function toggle(label: string) {
  await click(checkbox(label));
}

function textarea(ariaLabel: string): HTMLTextAreaElement {
  const found = doc().querySelector(`textarea[aria-label="${ariaLabel}"]`);
  assert.ok(found, `找不到文本框：${ariaLabel}`);
  return found as HTMLTextAreaElement;
}

function labelInput(label: string): HTMLInputElement {
  const found = [...doc().querySelectorAll('label')].find((l) => (l.textContent ?? '').trim() === label);
  assert.ok(found, `找不到输入框：${label}`);
  const input = found!.querySelector('input:not([type="checkbox"])');
  assert.ok(input, `输入框缺少 input：${label}`);
  return input as HTMLInputElement;
}

function stat(key: string): string {
  const found = doc().querySelector(`[data-stat="${key}"]`);
  assert.ok(found, `找不到统计项：${key}`);
  return (found!.textContent ?? '').trim();
}

function result(): HTMLTextAreaElement {
  return textarea('处理结果');
}

function alerts(): string {
  return [...doc().querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? '').join(' ');
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    el instanceof dom.window.HTMLTextAreaElement
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  assert.ok(descriptor?.set, '无法取得原生 value setter');
  descriptor!.set!.call(el, value);
}

async function typeInto(value: string, waitMs = 150) {
  const el = textarea('待处理文本');
  await act(async () => {
    setNativeValue(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle(waitMs);
}

async function setLabelInput(label: string, value: string) {
  const el = labelInput(label);
  await act(async () => {
    setNativeValue(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle(40);
}

before(async () => {
  const { JSDOM } = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  (globalThis as Record<string, unknown>).Blob = dom.window.Blob;
  (globalThis as Record<string, unknown>).File = dom.window.File;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // saveLocal 下载后会挂一个 60 秒的 revokeObjectURL 定时器；测试里丢掉长延时，避免进程多等 60 秒。
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  (globalThis as unknown as Record<string, unknown>).setTimeout = ((
    handler: (...args: unknown[]) => void,
    timeout?: number,
    ...args: unknown[]
  ) => (timeout !== undefined && timeout > 5000 ? 0 : nativeSetTimeout(handler, timeout, ...args))) as typeof setTimeout;
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: {
      writeText: async (text: string) => {
        clipboardText = text;
      },
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'createObjectURL', {
    value: (blob: Blob) => {
      downloads.push({ blob, name: '' });
      return `blob:fake-${downloads.length}`;
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
  (globalThis as Record<string, unknown>).URL = dom.window.URL;
  // 记录下载文件名：拦截 a.click
  const origClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    const anchor = this as unknown as HTMLAnchorElement;
    if (downloads.length && anchor.download) downloads[downloads.length - 1].name = anchor.download;
    return origClick.call(this);
  };
  // jsdom Blob.arrayBuffer 兜底
  if (typeof dom.window.Blob.prototype.arrayBuffer !== 'function') {
    (dom.window.Blob.prototype as unknown as Record<string, unknown>).arrayBuffer = async function (this: Blob) {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new dom.window.FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this as unknown as Blob);
      });
    };
  }

  React = (await import('react')).default;
  ({ act } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  TextToolkit = (await import('../src/tools/TextToolkit.tsx')).default;

  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => {
    root.render(React.createElement(TextToolkit as never));
  });
  await settle(50);
});

describe('文本工具箱 UI 流程', () => {
  it('渲染：标题、输入框、结果区、统计项，空输入给出中文错误', async () => {
    const body = doc().body.textContent ?? '';
    assert.ok(body.includes('文本工具箱'), '应渲染标题');
    assert.ok(body.includes('输入与实时统计'), '应有输入与统计区');
    assert.ok(body.includes('结果与导出'), '应有结果区');
    assert.ok(textarea('待处理文本'), '应有输入框');
    assert.equal(stat('chars'), '0', '空输入字符数应为 0');
    assert.equal(stat('lines'), '0', '空输入行数应为 0');

    await click(button('复制结果'));
    assert.match(alerts(), /请先输入文本/, '空输入复制应提示中文错误');
  });

  it('实时统计：中英文、emoji 按码点、换行与段落', async () => {
    await typeInto('你好 world😀\n第二行');
    assert.equal(stat('chars'), '13');
    assert.equal(stat('charsNoSpaces'), '11');
    assert.equal(stat('chinese'), '5');
    assert.equal(stat('englishWords'), '1');
    assert.equal(stat('lines'), '2');
    assert.equal(stat('paragraphs'), '1');
    assert.equal(stat('bytes'), '26');
    assert.equal(stat('readingMinutes'), '0.1');
    assert.equal(result().value, '你好 world😀\n第二行', '未勾选操作时结果等于输入');
  });

  it('整理操作叠加：去重行 → 删除空行 → 升序/降序', async () => {
    await click(button('清空'));
    await typeInto('b\na\nb\n\nc');
    await toggle('去重行（保留首次）');
    assert.equal(result().value, 'b\na\n\nc');
    await toggle('删除空行');
    assert.equal(result().value, 'b\na\nc');
    await click(button('升序'));
    assert.equal(result().value, 'a\nb\nc');
    await click(button('降序'));
    assert.equal(result().value, 'c\nb\na');
    await click(button('不排序'));
    assert.equal(result().value, 'b\na\nc');
  });

  it('行号与每行前后缀：去除行号后可重新编号', async () => {
    await click(button('清空'));
    await typeInto('1. 甲\n2) 乙\n（3）丙');
    await toggle('去除行号');
    assert.equal(result().value, '甲\n乙\n丙');
    await toggle('添加行号');
    assert.equal(result().value, '1. 甲\n2. 乙\n3. 丙');
    await setLabelInput('每行前缀', '> ');
    assert.equal(result().value, '1. > 甲\n2. > 乙\n3. > 丙');
    await setLabelInput('每行后缀', ' <');
    assert.equal(result().value, '1. > 甲 <\n2. > 乙 <\n3. > 丙 <');
    await toggle('添加行号');
    assert.equal(result().value, '> 甲 <\n> 乙 <\n> 丙 <');
  });

  it('大写与全角/半角转换', async () => {
    await click(button('清空'));
    await typeInto('ＡＢＣ　１２３，hello world！');
    await click(button('全部大写'));
    assert.equal(result().value, 'ＡＢＣ　１２３，HELLO WORLD！');
    await click(button('全角→半角'));
    assert.equal(result().value, 'ABC 123,HELLO WORLD!');
    await click(button('半角→全角'));
    assert.equal(result().value, 'ＡＢＣ　１２３，ＨＥＬＬＯ　ＷＯＲＬＤ！');
    await click(button('保持原宽'));
    assert.equal(result().value, 'ＡＢＣ　１２３，HELLO WORLD！');
  });

  it('中文标点→英文标点（常见一批）', async () => {
    await click(button('清空'));
    await typeInto('「你好」。\n《标题》——完');
    await toggle('中文标点→英文标点（常见一批）');
    assert.equal(result().value, '"你好".\n<标题>--完');
    assert.ok((doc().body.textContent ?? '').includes('不处理全部 Unicode 标点'), '应说明转换范围有限');
  });

  it('查找替换：字面量、全部替换可关闭', async () => {
    await click(button('清空'));
    await typeInto('a.b.a');
    await setLabelInput('查找内容（字面量）', '.');
    await setLabelInput('替换为', '$&');
    assert.equal(result().value, 'a$&b$&a', '默认替换全部，且 $& 按字面量处理');
    await toggle('全部替换（关闭时只替换第一处）');
    assert.equal(result().value, 'a$&b.a', '关闭全部替换时只替换第一处');
  });

  it('复制结果、下载 TXT 与清空', async () => {
    await click(button('清空'));
    await typeInto('第一行\n第二行');
    clipboardText = '';
    await click(button('复制结果'));
    await settle(80);
    assert.equal(clipboardText, '第一行\n第二行', '剪贴板应为结果文本');

    downloads.length = 0;
    await click(button('下载 TXT'));
    await settle(120);
    assert.equal(downloads.length, 1, '应触发一次下载');
    assert.equal(downloads[0].name, '文本工具箱结果.txt');
    const bytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
    // TextDecoder 会吞掉 BOM，所以直接检查原始字节 EF BB BF
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'TXT 应带 UTF-8 BOM');
    const decoded = new TextDecoder('utf-8').decode(bytes);
    assert.ok(decoded.includes('第一行\n第二行'), 'TXT 内容应与结果一致');

    await click(button('清空'));
    assert.equal(textarea('待处理文本').value, '');
    assert.equal(stat('chars'), '0');
    assert.equal(result().value, '');
  });

  it('超限输入给出中文错误且不生成结果', async () => {
    await typeInto('a'.repeat(500_001), 250);
    assert.match(alerts(), /50 万字符上限/);
    assert.equal(result().value, '');

    await typeInto('x'.repeat(2 * 1024 * 1024 + 1), 350);
    assert.match(alerts(), /2MB 上限/);
    assert.equal(result().value, '');

    await click(button('清空'));
    assert.equal(textarea('待处理文本').value, '');
  });
});
