// tool-common 共享原语 · UI 测试（jsdom + React 19 act）
// 覆盖：ToolHeader（品牌头 + 标题 + children）、Feedback（折叠/展开/报告 JSON/复制/下载）、
// StudyFooter（默认说明/自定义说明/开源许可链接）。
// 全部预期值先经 tsx 探针核对；运行：node --import tsx --test tests/tool-common.test.ts
// 说明：jsdom 只验证组件逻辑与文本输出，不模拟真实浏览器排版；样式仍由浏览器验收。
// 注意：点击“下载反馈记录”时 jsdom 会打印 "Not implemented: navigation"（a.click 导航未实现），
// 不影响断言；URL.createObjectURL 已在 setup 中 stub。
import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => { render: (n: unknown) => void; unmount: () => void };
let ToolHeader: (props: { label: string; children?: React.ReactNode }) => unknown;
let Feedback: (props: { tool: string }) => unknown;
let StudyFooter: (props?: { note?: string }) => unknown;
let dom: import('jsdom').JSDOM;
let clipboardText = '';
let currentRoot: { unmount: () => void } | null = null;

function text(): string {
  return dom.window.document.body.textContent ?? '';
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function rootEl(): Element {
  return dom.window.document.getElementById('root')!;
}
async function render(node: unknown) {
  currentRoot = createRoot(rootEl());
  await act(async () => {
    currentRoot!.render(node as never);
  });
}
async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}
function button(label: string): HTMLButtonElement {
  const found = [...dom.window.document.querySelectorAll('button')].find((item) =>
    (item.textContent ?? '').includes(label),
  );
  assert.ok(found, `找不到按钮：${label}`);
  return found as HTMLButtonElement;
}
function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set;
  assert.ok(setter, '应能取得原生 select value setter');
  setter.call(select, value);
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  assert.ok(setter, '应能取得原生 input value setter');
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function reportJson(): Record<string, unknown> {
  const pre = dom.window.document.querySelector('pre');
  assert.ok(pre, '展开后应有反馈报告 <pre>');
  return JSON.parse(pre.textContent ?? '{}') as Record<string, unknown>;
}
async function openFeedback(tool = 'probe-tool') {
  await render(React.createElement(Feedback as never, { tool }));
  assert.equal(text().includes('记录这次使用'), false, '初始应为折叠态');
  await click(button('完成任务'));
  assert.ok(text().includes('记录这次使用'), '点击后应展开');
}

before(async () => {
  const { JSDOM } = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/tools/probe',
  });
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: {
      writeText: async (value: string) => {
        clipboardText = value;
      },
    },
    configurable: true,
  });
  (dom.window.URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:fake';
  (dom.window.URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};
  (globalThis as Record<string, unknown>).URL = dom.window.URL;
  React = (await import('react')).default;
  ({ act } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  ({ ToolHeader, Feedback, StudyFooter } = await import('../src/tool-common.tsx'));
});

afterEach(async () => {
  if (currentRoot) {
    await act(async () => {
      currentRoot!.unmount();
    });
    currentRoot = null;
  }
  clipboardText = '';
});

describe('ToolHeader', () => {
  it('渲染标题、免费标识与 eyebrow', async () => {
    await render(React.createElement(ToolHeader as never, { label: '测试工具' }));
    assert.equal(dom.window.document.querySelector('h1')?.textContent, '测试工具');
    assert.ok(text().includes('免费 · 无登录 · 无水印'), '应有免费/无登录/无水印标识');
    assert.ok(text().includes('NOVIP / STUDY TOOLS'), '应有栏目 eyebrow');
    assert.ok(dom.window.document.querySelector('header.study-header'), '应有 study-header');
  });

  it('渲染 children 副标题', async () => {
    await render(
      React.createElement(ToolHeader as never, { label: '测试工具' }, React.createElement('p', null, '副标题文字')),
    );
    assert.ok(text().includes('副标题文字'), 'children 应渲染在标题区');
  });

  it('品牌链接回首页、logo 图为 /novip-logo.svg', async () => {
    await render(React.createElement(ToolHeader as never, { label: '测试工具' }));
    assert.equal(dom.window.document.querySelector('a.novip-brand')?.getAttribute('href'), '/');
    assert.equal(dom.window.document.querySelector('a.novip-brand img')?.getAttribute('src'), '/novip-logo.svg');
    assert.equal(dom.window.document.querySelector('a.novip-brand img')?.getAttribute('alt'), 'NOVIP Logo');
  });
});

describe('Feedback', () => {
  it('初始折叠：无表单、无报告', async () => {
    await render(React.createElement(Feedback as never, { tool: 'probe-tool' }));
    assert.ok(text().includes('完成任务 / 反馈问题'), '应有展开按钮');
    assert.equal(text().includes('记录这次使用'), false, '初始不应展开表单');
    assert.equal(dom.window.document.querySelector('pre'), null, '初始不应有报告 JSON');
  });

  it('点击展开：表单与许愿池链接出现', async () => {
    await openFeedback();
    assert.ok(text().includes('只生成你主动选择的反馈'), '应说明不自动上传');
    assert.equal(
      dom.window.document.querySelector('a[href="/tools/wishes"]')?.textContent,
      '建议新功能 / 又遇到付费墙了吗？',
    );
    assert.equal(dom.window.document.querySelectorAll('select').length, 2, '应有任务结果/问题类型两个下拉');
    assert.ok(dom.window.document.querySelector('input[type="checkbox"]'), '应有“已打开输出并核对”勾选');
  });

  it('报告 JSON 默认值与工具名、版本号、今日日期一致', async () => {
    await openFeedback('probe-tool');
    const report = reportJson();
    assert.equal(report.tool, 'probe-tool');
    assert.equal(report.version, '2.1.0');
    assert.equal(report.date, todayIso());
    assert.equal(report.result, '失败');
    assert.equal(report.problem, '无法完成');
    assert.equal(report.errorCode, '');
    assert.equal(report.outputOpenedAndChecked, false);
    assert.equal(report.device, '电脑');
  });

  it('改任务结果下拉：报告 result 跟随变化', async () => {
    await openFeedback();
    const selects = [...dom.window.document.querySelectorAll('select')];
    await act(async () => {
      setSelectValue(selects[0] as HTMLSelectElement, '独立完成');
    });
    assert.equal(reportJson().result, '独立完成');
  });

  it('改问题类型下拉：报告 problem 跟随变化', async () => {
    await openFeedback();
    const selects = [...dom.window.document.querySelectorAll('select')];
    await act(async () => {
      setSelectValue(selects[1] as HTMLSelectElement, '数据不一致');
    });
    assert.equal(reportJson().problem, '数据不一致');
  });

  it('错误码输入过滤非法字符并写入报告', async () => {
    await openFeedback();
    const input = dom.window.document.querySelector('input[maxlength="32"]') as HTMLInputElement;
    assert.ok(input, '应有错误码输入框');
    await act(async () => {
      setInputValue(input, 'R06!@#');
    });
    assert.equal(input.value, 'R06', '非法字符应在输入时被过滤');
    assert.equal(reportJson().errorCode, 'R06');
  });

  it('勾选“已打开输出并核对”：报告 outputOpenedAndChecked 变 true', async () => {
    await openFeedback();
    const checkbox = dom.window.document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    assert.equal(checkbox.checked, false);
    await click(checkbox);
    assert.equal(checkbox.checked, true);
    assert.equal(reportJson().outputOpenedAndChecked, true);
  });

  it('复制反馈：剪贴板拿到报告 JSON，状态提示已复制', async () => {
    await openFeedback('probe-tool');
    await click(button('复制反馈'));
    assert.ok(clipboardText.includes('"tool": "probe-tool"'), '剪贴板内容应为反馈报告 JSON');
    assert.ok(clipboardText.includes('"version": "2.1.0"'), '剪贴板报告应含版本号');
    assert.equal(
      dom.window.document.querySelector('[role="status"]')?.textContent,
      '已复制。请自行发送；本页未上传。',
    );
  });

  it('下载反馈记录：不抛错', async () => {
    await openFeedback();
    await click(button('下载反馈记录'));
    assert.ok(text().includes('记录这次使用'), '下载后表单仍展开');
  });

  it('再点一次切换按钮：折叠回初始态', async () => {
    await openFeedback();
    await click(button('完成任务'));
    assert.equal(text().includes('记录这次使用'), false, '再次点击应折叠');
    assert.equal(dom.window.document.querySelector('pre'), null, '折叠后报告应消失');
  });
});

describe('StudyFooter', () => {
  it('默认说明 + 开源许可链接', async () => {
    await render(React.createElement(StudyFooter as never, null));
    assert.ok(text().includes('文件与内容只在当前浏览器处理，刷新会清空'), '应有默认隐私说明');
    const link = dom.window.document.querySelector('a[href="/third-party-notices.txt"]');
    assert.equal(link?.textContent, '开源许可');
    assert.equal(link?.getAttribute('target'), '_blank');
    assert.ok(dom.window.document.querySelector('footer.study-footer'), '应有 study-footer');
  });

  it('自定义 note 覆盖默认说明', async () => {
    await render(React.createElement(StudyFooter as never, { note: '自定义说明文字' }));
    assert.ok(text().includes('自定义说明文字'), '应渲染自定义说明');
    assert.equal(text().includes('文件与内容只在当前浏览器处理'), false, '自定义时不应出现默认说明');
    assert.equal(dom.window.document.querySelector('a[href="/third-party-notices.txt"]')?.textContent, '开源许可');
  });
});
