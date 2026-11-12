// 房贷与利息计算器 · UI 集成测试（jsdom + React 19 act）
// 覆盖：渲染 → 等额本息计算 → 下载 CSV → 复制结果 → 非法利率拒绝 → 等额本金 →
//       提前还款模拟 → 单利/复利计算与频率切换。
// 运行：npm test（node --import tsx --test tests/*.test.ts）
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

const downloads: { blob: Blob; name: string }[] = [];
let clipboardText = '';
let dom: import('jsdom').JSDOM;
let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (container: Element) => { render: (node: unknown) => void };
let Finance: () => unknown;

async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...dom.window.document.querySelectorAll('button')].find((item) => (item.textContent ?? '').includes(text));
  assert.ok(found, `找不到按钮：${text}`);
  return found as HTMLButtonElement;
}

function input(label: string): HTMLInputElement {
  const found = dom.window.document.querySelector(`input[aria-label="${label}"]`);
  assert.ok(found, `找不到输入框：${label}`);
  return found as HTMLInputElement;
}

function select(label: string): HTMLSelectElement {
  const found = dom.window.document.querySelector(`select[aria-label="${label}"]`);
  assert.ok(found, `找不到下拉框：${label}`);
  return found as HTMLSelectElement;
}

/** 通过 React 受控组件认可的 input/change 事件写入值 */
async function setControlValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    if (element instanceof dom.window.HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    } else {
      element.value = value;
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }
  });
}

async function settle(ms = 200) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function bodyText(): string {
  return dom.window.document.body.textContent ?? '';
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new dom.window.FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// saveLocal 下载后会挂一个 60 秒的 revokeObjectURL 计时器；测试收尾时清理长计时器，
// 避免 node --test 进程空转等待 60 秒（不影响被测逻辑）。
const originalSetTimeout = globalThis.setTimeout;
const pendingLongTimers: ReturnType<typeof setTimeout>[] = [];

before(async () => {
  const { JSDOM } = await import('jsdom');
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const timer = originalSetTimeout(handler, timeout, ...args);
    if ((timeout ?? 0) >= 5000) pendingLongTimers.push(timer);
    return timer;
  }) as unknown as typeof setTimeout;
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  (globalThis as Record<string, unknown>).Blob = dom.window.Blob;
  (globalThis as Record<string, unknown>).File = dom.window.File;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
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
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function clickAnchor(this: HTMLAnchorElement) {
    const anchor = this as unknown as HTMLAnchorElement;
    if (downloads.length > 0 && anchor.download) downloads[downloads.length - 1].name = anchor.download;
    return originalClick.call(this);
  };

  React = (await import('react')).default;
  ({ act } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  Finance = (await import('../src/tools/Finance.tsx')).default;
});

after(() => {
  globalThis.setTimeout = originalSetTimeout;
  for (const timer of pendingLongTimers) clearTimeout(timer);
  dom.window.close();
});

describe('房贷与利息计算器 UI 流程', () => {
  it('渲染标题与两块计算表单', async () => {
    const root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => {
      root.render(React.createElement(Finance as never));
    });
    const text = bodyText();
    assert.ok(text.includes('房贷与利息计算器'), '应渲染标题');
    assert.ok(text.includes('房贷计算'), '应有房贷表单');
    assert.ok(text.includes('单利 / 复利计算'), '应有单利/复利表单');
    assert.ok(text.includes('贷款金额'), '应有金额字段');
    assert.ok(text.includes('还款方式'), '应有还款方式字段');
  });

  it('等额本息：默认 100 万 / 4.9% / 30 年，月供 5307.27 元', async () => {
    await click(button('计算房贷'));
    await settle();
    assert.ok(!dom.window.document.querySelector('[role="alert"]'), '不应出现错误提示');
    const text = bodyText();
    assert.ok(text.includes('房贷结果'), '应展示房贷结果');
    assert.ok(text.includes('每月月供'), '等额本息应展示每月月供');
    assert.ok(text.includes('5,307.27 元'), `月供应为 5307.27 元：${text.slice(0, 200)}`);
    assert.ok(text.includes('910,615.12 元'), '应展示总利息');
    assert.ok(text.includes('1,910,615.12 元'), '应展示总还款');
    assert.ok(text.includes('47.66%'), '应展示利息占比');
    const tableRows = dom.window.document.querySelectorAll('.study-table-wrap tbody tr');
    assert.equal(tableRows.length, 13, '应展示表头 + 前 12 期');
    const tableText = dom.window.document.querySelector('.study-table-wrap')?.textContent ?? '';
    assert.ok(tableText.includes('期数') && tableText.includes('剩余本金'), '表头应完整');
  });

  it('下载完整还款表 CSV：360 期、表头正确', async () => {
    downloads.length = 0;
    await click(button('下载完整还款表 CSV'));
    await settle(100);
    assert.equal(downloads.length, 1, '应触发一次下载');
    assert.ok(downloads[0].name.endsWith('.csv'), `文件名应为 csv，实际 ${downloads[0].name}`);
    const csv = await blobText(downloads[0].blob);
    const lines = csv.replace(/^\ufeff/, '').trim().split('\n');
    assert.equal(lines.length, 361, '应为表头 + 360 期');
    assert.equal(lines[0], '期数,月供（元）,本金（元）,利息（元）,剩余本金（元）');
    assert.ok(lines[360].endsWith(',0.00'), '末期剩余本金应为 0.00');
  });

  it('复制房贷结果到剪贴板', async () => {
    clipboardText = '';
    await click(button('复制结果'));
    await settle(100);
    assert.ok(clipboardText.includes('【房贷计算结果】'), '应复制房贷结果');
    assert.ok(clipboardText.includes('月供：5,307.27 元'), '复制内容应含月供');
    assert.ok(clipboardText.includes('前 12 期还款'), '复制内容应含前 12 期');
  });

  it('非法年利率：中文错误提示，且不产生新结果', async () => {
    await setControlValue(input('年利率'), '30');
    await click(button('计算房贷'));
    await settle();
    const alert = dom.window.document.querySelector('[role="alert"]');
    assert.ok(alert, '应显示错误提示');
    assert.ok((alert.textContent ?? '').includes('年利率需在 0–24%'), `错误文案应含利率范围：${alert.textContent}`);
  });

  it('清空后切换等额本金：展示首月/末月月供', async () => {
    await click(button('清空'));
    await settle(50);
    await setControlValue(select('还款方式'), 'equal-principal');
    await click(button('计算房贷'));
    await settle();
    const text = bodyText();
    assert.ok(text.includes('首月月供'), '等额本金应展示首月月供');
    assert.ok(text.includes('末月月供'), '等额本金应展示末月月供');
    assert.ok(text.includes('6,861.11 元'), '首月月供应为 6861.11 元');
    assert.ok(text.includes('每月本金'), '应展示每月本金');
    const resultSection = dom.window.document.querySelector('section[aria-label="房贷计算结果"]');
    assert.ok(resultSection, '应有房贷结果区');
    assert.ok(!(resultSection.textContent ?? '').includes('每月月供'), '等额本金结果不应展示固定月供');
  });

  it('提前还款模拟：额外 1000 元/月显示节省利息与缩短期限', async () => {
    await click(button('清空'));
    await settle(50);
    await setControlValue(input('每月额外还款'), '1000');
    await click(button('计算房贷'));
    await settle();
    const text = bodyText();
    assert.ok(text.includes('提前还款估算'), '应展示提前还款估算');
    assert.ok(text.includes('297,160.44 元'), '应展示节省利息');
    assert.ok(text.includes('8 年 8 个月（104 期）'), '应展示缩短期限');
    assert.ok(text.includes('下载完整还款表 CSV（256 期）'), 'CSV 按钮应显示缩短后的期数');
  });

  it('单利/复利计算：默认按年复利 10927.27 元，切换按月 10940.51 元', async () => {
    await click(button('计算利息'));
    await settle();
    let text = bodyText();
    assert.ok(text.includes('利息结果'), '应展示利息结果');
    assert.ok(text.includes('10,927.27 元'), '按年复利本息合计应为 10927.27 元');
    assert.ok(text.includes('复利比单利多'), '应展示与单利差额标签');
    assert.ok(text.includes('27.27 元'), '应展示与单利差额金额');
    await setControlValue(select('复利频率'), 'month');
    await click(button('计算利息'));
    await settle();
    text = bodyText();
    assert.ok(text.includes('10,940.51 元'), '按月复利本息合计应为 10940.51 元');
    assert.ok(text.includes('40.51 元'), '与单利差额应为 40.51 元');
  });

  it('切换单利：展示单利结果，复利频率禁用', async () => {
    await setControlValue(select('计息方式'), 'simple');
    await click(button('计算利息'));
    await settle();
    const text = bodyText();
    assert.ok(text.includes('10,900.00 元'), '单利本息合计应为 10900.00 元');
    assert.equal(select('复利频率').disabled, true, '单利模式下复利频率应禁用');
    clipboardText = '';
    const copyButtons = [...dom.window.document.querySelectorAll('button')].filter((item) => (item.textContent ?? '').includes('复制结果'));
    assert.ok(copyButtons.length >= 2, '房贷与利息结果都应有复制按钮');
    await click(copyButtons[copyButtons.length - 1]);
    await settle(100);
    assert.ok(clipboardText.includes('【利息计算结果】'), '应复制利息结果');
    assert.ok(clipboardText.includes('本息合计：10,900.00 元'), '复制内容应含本息合计');
  });
});
