// BMI / 体脂率参考计算 · UI 冒烟测试（jsdom + React 19 act）
// 覆盖：默认导出渲染 → 填表计算 BMI/体脂/BMR/TDEE → 复制结果 → 清空。
// 运行：node --import tsx --test tests/health-ui.test.ts
// 说明：jsdom 只验证组件逻辑与文本输出，不模拟真实浏览器排版；样式仍由浏览器验收。
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => { render: (n: unknown) => void };
let Health: () => unknown;
let dom: import('jsdom').JSDOM;
let clipboardText = '';

function text(): string {
  return dom.window.document.body.textContent ?? '';
}
function numberInputs(): HTMLInputElement[] {
  return [...dom.window.document.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
}
function setValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  assert.ok(setter, '应能取得原生 input value setter');
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
async function settle(ms = 80) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

before(async () => {
  const { JSDOM } = await import('jsdom');
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
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
  React = (await import('react')).default;
  ({ act } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  Health = (await import('../src/tools/Health.tsx')).default;
});

describe('BMI / 体脂率参考计算 UI', () => {
  it('渲染标题、免责提示与表单（默认男性 5 个数字输入）', async () => {
    const root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => {
      root.render(React.createElement(Health as never));
    });
    const body = text();
    assert.ok(body.includes('BMI / 体脂率参考计算'), '应渲染标题');
    assert.ok(body.includes('参考值，非诊断'), '应有显眼的非诊断提示');
    assert.ok(body.includes('填写你的数据'), '应渲染表单');
    assert.ok(body.includes('计算参考值'), '应有计算按钮');
    assert.ok(body.includes('腰围') && body.includes('颈围'), '应有围度输入说明');
    assert.equal(numberInputs().length, 5, '男性应有年龄/身高/体重/腰围/颈围 5 个数字输入');
    assert.ok(!body.includes('臀围（cm，女性必填）'), '男性不显示臀围字段');
  });

  it('计算后出现 BMI、体脂率与 BMR/TDEE 参考结果', async () => {
    const inputs = numberInputs();
    await act(async () => {
      setValue(inputs[0], '30');
      setValue(inputs[1], '175');
      setValue(inputs[2], '70');
      setValue(inputs[3], '85');
      setValue(inputs[4], '38');
    });
    await click(button('计算参考值'));
    await settle();
    const body = text();
    assert.ok(body.includes('参考结果'), '应出现结果区');
    assert.ok(body.includes('22.9'), 'BMI 应为 22.9');
    assert.ok(body.includes('中国成人分类'), '应显示中国成人分类说明');
    assert.ok(body.includes('56.7–73.2 kg'), '应显示健康体重区间');
    assert.ok(body.includes('17.0') && body.includes('健身参考'), '应显示体脂估算与 ACE 分级');
    assert.ok(body.includes('1649'), 'BMR 应四舍五入为 1649 kcal');
    assert.ok(body.includes('2267'), '默认轻度活动的 TDEE 应约 2267 kcal');
    assert.ok(body.includes('Mifflin-St Jeor'), '应注明 BMR 公式来源');
    assert.ok(body.includes('估算 ≠ 医疗测量'), '应注明体脂为估算');
  });

  it('切换女性后出现臀围字段，计算女性体脂', async () => {
    const select = dom.window.document.querySelector('select') as HTMLSelectElement;
    assert.ok(select, '应有性别下拉框');
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(select, 'female');
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.equal(numberInputs().length, 6, '女性应多一个臀围输入');
    assert.ok(text().includes('臀围（cm，女性必填）'), '女性应显示臀围字段');
    const inputs = numberInputs();
    await act(async () => {
      setValue(inputs[1], '170');
      setValue(inputs[2], '60');
      setValue(inputs[3], '80');
      setValue(inputs[4], '34');
      setValue(inputs[5], '95');
    });
    await click(button('计算参考值'));
    await settle();
    assert.ok(text().includes('28.0'), '女性体脂估算应为 28.0%（27.97 保留一位小数）');
  });

  it('复制结果写入剪贴板并提示已复制', async () => {
    clipboardText = '';
    await click(button('复制结果'));
    await settle();
    assert.ok(clipboardText.includes('NOVIP · BMI / 体脂率参考计算'), '剪贴板应包含标题');
    assert.ok(clipboardText.includes('BMI：') && clipboardText.includes('BMR：'), '剪贴板应包含主要结果');
    assert.ok(clipboardText.includes('不构成医疗诊断'), '复制文本应带免责声明');
    assert.ok(text().includes('已复制结果'), '页面应提示已复制');
  });

  it('清空后输入与结果重置', async () => {
    await click(button('清空'));
    await settle();
    assert.ok(!text().includes('参考结果'), '清空后不应残留结果区');
    assert.ok(numberInputs().every((input) => input.value === ''), '清空后数字输入应为空');
  });
});
