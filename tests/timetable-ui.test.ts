// 大学课程表生成器 · UI 集成测试（jsdom + React 19 act）
// 覆盖：空状态渲染 → 载入示例 → 切换教学周（单双周课程显隐） → 添加课程与冲突提醒 → localStorage 持久化恢复 → 清空与撤销。
// 运行：node --import tsx --test tests/timetable-ui.test.ts
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { STORAGE_KEY } from '../src/tools/timetable-core';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => { render: (n: unknown) => void; unmount: () => void };
let Timetable: () => unknown;
let dom: import('jsdom').JSDOM;

function text(): string {
  return dom.window.document.body.textContent ?? '';
}
function setValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  assert.ok(setter);
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
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

before(async () => {
  const { JSDOM } = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/tools/timetable',
  });
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  (globalThis as Record<string, unknown>).localStorage = dom.window.localStorage;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  React = await import('react');
  const reactDomClient = await import('react-dom/client');
  createRoot = reactDomClient.createRoot;
  act = (React as unknown as { act: typeof act }).act;
  Timetable = (await import('../src/tools/Timetable')).default;
});

describe('大学课程表生成器 UI 交互与本地持久化', () => {
  it('空状态 → 载入示例 → 单双周切换 → 添加冲突课程 → 本地存储恢复 → 清空与撤销', async () => {
    dom.window.localStorage.clear();
    const container = dom.window.document.getElementById('root')!;
    let root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Timetable));
    });
    assert.match(text(), /大学课程表生成器/);
    assert.match(text(), /还没有课程/);

    // 1. 载入示例课表（默认跳转到第 3 周）
    await click(button('载入示例课表'));
    assert.match(text(), /高等数学 A/);
    assert.match(text(), /线性代数/); // 单周课程，第 3 周可见

    // 2. 切换到第 2 周（双周）：网格中应包含双周的「大学物理实验」
    const week2Tab = [...dom.window.document.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent === '2',
    );
    assert.ok(week2Tab);
    await click(week2Tab);
    const gridCoursesW2 = [...dom.window.document.querySelectorAll('.tt-course')].map(
      (el) => el.textContent ?? '',
    );
    assert.equal(gridCoursesW2.some((t) => t.includes('大学物理实验')), true);
    assert.equal(gridCoursesW2.some((t) => t.includes('线性代数')), false);

    // 3. 打开添加课程弹窗，添加一门与周一第 1-2 节「高等数学 A」冲突的课程
    await click(button('添加课程'));
    const dialog = dom.window.document.querySelector('[role="dialog"]');
    assert.ok(dialog, '应打开添加课程弹窗');
    const nameInput = dialog.querySelector('input') as HTMLInputElement;
    await act(async () => {
      setValue(nameInput, '冲突测试课');
    });
    assert.match(dialog.textContent ?? '', /时间冲突/);
    const saveBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === '保存')!;
    await click(saveBtn);
    assert.match(text(), /发现 1 处时间冲突/);

    // 4. 验证 localStorage 已经自动保存，卸载并重新挂载组件后课表完整恢复
    const rawSaved = dom.window.localStorage.getItem(STORAGE_KEY);
    assert.ok(rawSaved, 'localStorage 应保存课表数据');
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Timetable));
    });
    assert.match(text(), /已从本机恢复上次的课表/);
    assert.match(text(), /冲突测试课/);

    // 5. 清空课表并一键撤销
    await click(button('清空课表'));
    await click(button('确认清空'));
    assert.match(text(), /还没有课程/);
    await click(button('撤销'));
    assert.match(text(), /冲突测试课/);

    await act(async () => {
      root.unmount();
    });
  });
});
