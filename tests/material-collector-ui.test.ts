// 材料收集助手 · UI 集成测试（jsdom + React 18/19 act）
// 覆盖：渲染 → 加载虚构示例 → 人工指定 → 导出 XLSX/ZIP/提醒文案
// 浏览器无法访问本机回环地址时，此测试是 UI 层的真实执行验证。
// 运行：npm test（node --import tsx --test tests/*.test.ts）
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => { render: (n: unknown) => void };
let MaterialCollector: () => unknown;
let XLSX: typeof import('xlsx');
let unzipSync: (b: Uint8Array) => Record<string, Uint8Array>;
let dom: import('jsdom').JSDOM;

const downloads: { blob: Blob; name: string }[] = [];
let clipboardText = '';

async function click(el: Element) {
  await act(async () => { (el as HTMLElement).click(); });
}
function btn(text: string): HTMLButtonElement {
  const found = [...dom.window.document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(text));
  assert.ok(found, `找不到按钮：${text}`);
  return found as HTMLButtonElement;
}
async function settle(ms = 300) {
  await act(async () => { await new Promise(r => setTimeout(r, ms)); });
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
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText: async (t: string) => { clipboardText = t; } }, configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'createObjectURL', {
    value: (blob: Blob) => { downloads.push({ blob, name: '' }); return `blob:fake-${downloads.length}`; },
    configurable: true,
  });
  Object.defineProperty(dom.window.URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
  (globalThis as Record<string, unknown>).URL = dom.window.URL;
  // 记录下载文件名：拦截 a.click
  const origClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    const a = this as unknown as HTMLAnchorElement;
    if (downloads.length && a.download) downloads[downloads.length - 1].name = a.download;
    return origClick.call(this);
  };
  // jsdom Blob.arrayBuffer 兜底
  if (typeof dom.window.Blob.prototype.arrayBuffer !== 'function') {
    (dom.window.Blob.prototype as unknown as Record<string, unknown>).arrayBuffer = async function (this: Blob) {
      const buf = await new Promise<ArrayBuffer>((res, rej) => {
        const fr = new dom.window.FileReader();
        fr.onload = () => res(fr.result as ArrayBuffer);
        fr.onerror = () => rej(fr.error);
        fr.readAsArrayBuffer(this as unknown as Blob);
      });
      return buf;
    };
  }

  React = (await import('react')).default;
  ({ act } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  MaterialCollector = (await import('../src/tools/MaterialCollector.tsx')).default;
  XLSX = await import('xlsx');
  ({ unzipSync } = await import('fflate'));
});

describe('材料收集助手 UI 流程', () => {
  it('渲染 + 加载虚构示例进入核对页', async () => {
    const root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => { root.render(React.createElement(MaterialCollector as never)); });
    const text = dom.window.document.body.textContent ?? '';
    assert.ok(text.includes('材料收集助手'), '标题应渲染');
    await click(btn('加载虚构示例'));
    const t2 = dom.window.document.body.textContent ?? '';
    assert.ok(t2.includes('核对面板'), '应进入核对页');
    assert.ok(t2.includes('待确认文件'), '应有待确认区');
    assert.ok(t2.includes('未分配文件'), '应有未分配区');
    assert.ok(t2.includes('张伟'), '应含演示人员');
  });

  it('人工指定：待确认文件可分配并重算', async () => {
    const before = dom.window.document.body.textContent ?? '';
    const detailBtns = [...dom.window.document.querySelectorAll('button')].filter(b => (b.textContent ?? '').includes('详细指定'));
    assert.ok(detailBtns.length > 0, '应有详细指定按钮');
    await click(detailBtns[0]);
    const dialog = dom.window.document.querySelector('[role="dialog"]');
    assert.ok(dialog, '应弹出人工指定弹窗');
    const selects = dialog!.querySelectorAll('select');
    assert.equal(selects.length, 2, '应有人员/材料两个下拉框');
    // 选第一个人员与第一个材料
    await act(async () => {
      (selects[0] as HTMLSelectElement).selectedIndex = 1;
      selects[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      (selects[1] as HTMLSelectElement).selectedIndex = 1;
      selects[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click([...dialog!.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('确认分配'))!);
    await settle();
    assert.ok(!dom.window.document.querySelector('[role="dialog"]'), '弹窗应关闭');
    const after = dom.window.document.body.textContent ?? '';
    assert.ok(after.includes('人工指定'), '应显示人工指定标记');
    assert.notEqual(before.length, after.length, '页面内容应发生变化');
  });

  it('导出核对表 XLSX：13 行、状态列正确', async () => {
    downloads.length = 0;
    await click(btn('4 导出'));
    await click(btn('导出核对表 XLSX'));
    await settle();
    assert.equal(downloads.length, 1, '应触发一次下载');
    assert.ok(downloads[0].name.endsWith('.xlsx'), `文件名应为 xlsx，实际 ${downloads[0].name}`);
    const buf = new Uint8Array(await downloads[0].blob.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    assert.equal(rows.length, 13, `应为 12 人+表头，实际 ${rows.length}`);
    assert.equal(rows[0][0], '姓名');
    assert.ok(rows[0].includes('状态'), '应有状态列');
    assert.ok(rows.some(r => r[2] === '齐全' || r[2] === '缺材料' || r[2] === '规则异常' || r[2] === '待确认'), '状态值应为四种之一');
  });

  it('导出整理 ZIP：目录结构与清单完整', async () => {
    downloads.length = 0;
    await click(btn('导出整理后的 ZIP'));
    for (let i = 0; i < 40 && downloads.length === 0; i++) await new Promise(r => setTimeout(r, 200));
    assert.equal(downloads.length, 1, '应触发一次下载');
    assert.ok(downloads[0].name.endsWith('.zip'), `文件名应为 zip，实际 ${downloads[0].name}`);
    const buf = new Uint8Array(await downloads[0].blob.arrayBuffer());
    const entries = unzipSync(buf);
    const names = Object.keys(entries);
    assert.ok(names.includes('整理清单.csv'), '应含整理清单');
    assert.ok(names.includes('说明.txt'), '应含说明');
    assert.ok(names.some(n => n.startsWith('_未分配/')), '未分配文件应入 _未分配/');
    assert.ok(names.some(n => n.startsWith('_待确认/')), '待确认文件应入 _待确认/');
    assert.ok(names.some(n => !n.startsWith('_') && !n.includes('整理清单') && !n.includes('说明.txt')), '应有人员文件夹');
    // 内容完整性：清单行数 = 文件数 + 表头
    const csv = new TextDecoder('utf-8').decode(entries['整理清单.csv']);
    const lines = csv.trim().split('\r\n');
    assert.ok(lines.length >= 19, `清单应含 18 文件+表头，实际 ${lines.length}`);
    assert.ok(lines[0].includes('原始文件名') && lines[0].includes('导出路径'), '清单表头正确');
  });

  it('缺交提醒文案：生成并复制', async () => {
    await click(btn('生成提醒文案'));
    const ta = dom.window.document.querySelector('textarea[aria-label="缺交提醒文案"]') as HTMLTextAreaElement;
    assert.ok(ta && ta.value.length > 0, '应生成文案');
    assert.ok(!ta.value.includes('http'), '文案只含文字');
    await click(btn('复制文案'));
    await settle(100);
    assert.ok(clipboardText.length > 0, '应写入剪贴板');
    assert.equal(clipboardText, ta.value, '剪贴板内容与文案一致');
  });
});
