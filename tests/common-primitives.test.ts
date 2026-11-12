// 共享工具页原语直接覆盖（jsdom + React 19 act）
// 覆盖：src/tools/common.tsx 的 11 项零直接引用导出——
// appNavigate / jsonDownload / textDownload / ProgressBar / Skeleton /
// SuccessNotice / EmptyState / ActionableError / Table / WeChatNotice /
// ShareToClassmates（经 common.tsx 转发的两个组件亦计入本文件覆盖）。
// 运行：node --import tsx --test tests/common-primitives.test.ts
// 说明：jsdom 只验证组件逻辑与文本输出，不模拟真实浏览器排版；样式仍由浏览器验收。
// ShareToClassmates 的「下载分享卡片」成功路径需真实 Canvas（generateShareCardBlob），
// jsdom 下 toBlob 不可用，故本文件不锁定该路径，只覆盖渲染/复制/预览开关/系统分享。
import { describe, it, before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { register} from 'node:module';

register(new URL('./css-stub-loader.mjs', import.meta.url).href);

let React: typeof import('react');
let act: (fn: () => void | Promise<void>) => Promise<void>;
let createRoot: (c: Element) => { render: (n: unknown) => void; unmount: () => void};
let C: typeof import('../src/tools/common');
let dom: import('jsdom').JSDOM;

const downloads: { blob: Blob; name: string}[] = [];
let clipboardText = '';
let downloadEvents: { name: string; type: string; size: number}[] = [];
let popstates = 0;
let scrolled: unknown = null;
let currentRoot: { render: (n: unknown) => void; unmount: () => void} | null = null;

// saveLocal 下载后会挂一个 60 秒的 revokeObjectURL 计时器；测试收尾时清理长计时器，
// 避免 node --test 进程空转等待 60 秒（不影响被测逻辑）。
const originalSetTimeout = globalThis.setTimeout;
const pendingLongTimers: ReturnType<typeof setTimeout>[] = [];

async function mount(el: unknown) {
if (currentRoot) await act(async () => { currentRoot!.unmount();});
currentRoot = createRoot(dom.window.document.getElementById('root')!);
await act(async () => { currentRoot!.render(el);});
}
function bodyText(): string {
return dom.window.document.body.textContent?? '';
}
function buttons(): HTMLButtonElement[] {
return [...dom.window.document.querySelectorAll('button')] as HTMLButtonElement[];
}
function button(label: string): HTMLButtonElement {
const found = buttons().find((b) => (b.textContent?? '').includes(label));
assert.ok(found, `找不到按钮：${label}`);
return found;
}
async function click(el: Element) {
await act(async () => { (el as HTMLElement).click();});
}
async function settle(ms = 60) {
await act(async () => { await new Promise((r) => setTimeout(r, ms));});
}

before(async () => {
const { JSDOM} = await import('jsdom');
globalThis.setTimeout = ((handler: TimerHandler, timeout?: number,...args: unknown[]) => {
const timer = originalSetTimeout(handler, timeout,...args);
if ((timeout?? 0) >= 5000) pendingLongTimers.push(timer);
return timer;
}) as unknown as typeof setTimeout;
dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/'});
(globalThis as Record<string, unknown>).window = dom.window;
(globalThis as Record<string, unknown>).document = dom.window.document;
// appNavigate 用裸 history / PopStateEvent（浏览器全局），jsdom 需显式挂到 globalThis。
(globalThis as Record<string, unknown>).history = dom.window.history;
(globalThis as Record<string, unknown>).PopStateEvent = dom.window.PopStateEvent;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true});
(globalThis as Record<string, unknown>).Blob = dom.window.Blob;
(globalThis as Record<string, unknown>).File = dom.window.File;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(dom.window.navigator, 'clipboard', {
value: { writeText: async (text: string) => { clipboardText = text;}},
configurable: true,
});
Object.defineProperty(dom.window.URL, 'createObjectURL', {
value: (blob: Blob) => { downloads.push({ blob, name: ''}); return `blob:fake-${downloads.length}`;},
configurable: true,
});
Object.defineProperty(dom.window.URL, 'revokeObjectURL', { value: () => undefined, configurable: true});
(globalThis as Record<string, unknown>).URL = dom.window.URL;
const originalClick = dom.window.HTMLAnchorElement.prototype.click;
dom.window.HTMLAnchorElement.prototype.click = function clickAnchor(this: HTMLAnchorElement) {
const anchor = this as unknown as HTMLAnchorElement;
if (downloads.length > 0 && anchor.download) downloads[downloads.length - 1].name = anchor.download;
return originalClick.call(this);
};
dom.window.addEventListener('popstate', () => { popstates++;});
dom.window.addEventListener('novip:download', (e) => {
downloadEvents.push((e as CustomEvent).detail as { name: string; type: string; size: number});
});
(dom.window as unknown as { scrollTo: (o: unknown) => void}).scrollTo = (opts: unknown) => { scrolled = opts;};

React = (await import('react')).default;
({ act} = await import('react'));
({ createRoot} = await import('react-dom/client'));
C = await import('../src/tools/common');
});

afterEach(async () => {
if (currentRoot) {
await act(async () => { currentRoot!.unmount();});
currentRoot = null;
}
});

after(() => {
globalThis.setTimeout = originalSetTimeout;
for (const timer of pendingLongTimers) clearTimeout(timer);
dom.window.close();
});

describe('common.tsx 共享工具页原语', () => {
it('jsonDownload：JSON 文本、类型、文件名与下载事件逐项一致', async () => {
C.jsonDownload({ a: 1}, 'x.json');
assert.equal(downloads.length, 1);
const d = downloads[0];
assert.equal(d.name, 'x.json');
assert.equal(d.blob.type, 'application/json');
assert.equal(await d.blob.text(), '{\n  "a": 1\n}');
assert.equal(downloadEvents.length, 1);
assert.deepEqual(downloadEvents[0], { name: 'x.json', type: 'application/json', size: 12});
});

it('textDownload：BOM 前缀、类型、文件名逐项一致', async () => {
C.textDownload('hi', 'bom.txt');
const d = downloads[downloads.length - 1];
assert.equal(d.name, 'bom.txt');
assert.equal(d.blob.type, 'text/plain;charset=utf-8');
assert.deepEqual([...new Uint8Array(await d.blob.arrayBuffer())], [0xef, 0xbb, 0xbf, 0x68, 0x69]);
assert.equal(await d.blob.text(), 'hi');
});

it('textDownload：空串与纯空白均抛「结果为空，不提供空白下载。」', () => {
assert.throws(() => C.textDownload('', 'z.txt'), /结果为空，不提供空白下载。/);
assert.throws(() => C.textDownload('   ', 'z.txt'), /结果为空，不提供空白下载。/);
});

it('ProgressBar：50/100 渲染 50% 与 aria 取值', async () => {
await mount(React.createElement(C.ProgressBar, { value: 50, max: 100}));
const fill = dom.window.document.querySelector('.study-progress-bar-fill') as HTMLElement;
assert.ok(fill, '应有确定态填充条');
assert.equal(fill.style.width, '50%');
assert.equal(fill.getAttribute('aria-valuenow'), '50');
assert.ok(bodyText().includes('50%'), '应显示 50% 文本');
assert.ok(!dom.window.document.querySelector('.study-progress-bar-indeterminate'), '不应有不确定态条');
});

it('ProgressBar：超限钳制到 0% 与 100%', async () => {
await mount(React.createElement(C.ProgressBar, { value: 150, max: 100}));
assert.equal((dom.window.document.querySelector('.study-progress-bar-fill') as HTMLElement).style.width, '100%');
await mount(React.createElement(C.ProgressBar, { value: -10, max: 100}));
assert.equal((dom.window.document.querySelector('.study-progress-bar-fill') as HTMLElement).style.width, '0%');
assert.ok(bodyText().includes('0%'));
});

it('ProgressBar：无值与 max=0 均为不确定态、无百分比文本', async () => {
await mount(React.createElement(C.ProgressBar, {}));
assert.ok(dom.window.document.querySelector('.study-progress-bar-indeterminate'), '无值应为不确定态');
assert.ok(!bodyText().includes('%'), '不确定态不应显示百分比');
await mount(React.createElement(C.ProgressBar, { value: 5, max: 0}));
assert.ok(dom.window.document.querySelector('.study-progress-bar-indeterminate'), 'max=0 应为不确定态');
});

it('ProgressBar：1/3 四舍五入为 33%，statusText 覆盖显示、aria-label 仍取 label', async () => {
await mount(React.createElement(C.ProgressBar, { value: 1, max: 3, label: '处理中', statusText: '正在压缩…'}));
assert.ok(bodyText().includes('33%'), '1/3 应四舍五入为 33%');
assert.ok(bodyText().includes('正在压缩…'), '应显示 statusText');
assert.equal(dom.window.document.querySelector('[role="status"]')?.getAttribute('aria-label'), '处理中');
});

it('Skeleton：默认 2 行，首行 16px/100%、末行 12px/68%', async () => {
await mount(React.createElement(C.Skeleton, {}));
const lines = [...dom.window.document.querySelectorAll('.study-skeleton-line')] as HTMLElement[];
assert.equal(lines.length, 2);
assert.equal(lines[0].style.height, '16px');
assert.equal(lines[0].style.width, '100%');
assert.equal(lines[1].style.height, '12px');
assert.equal(lines[1].style.width, '68%');
});

it('Skeleton：lines=1 与 lines=0 均只渲染 1 行 16px', async () => {
await mount(React.createElement(C.Skeleton, { lines: 1}));
assert.equal(dom.window.document.querySelectorAll('.study-skeleton-line').length, 1);
await mount(React.createElement(C.Skeleton, { lines: 0}));
const lines = [...dom.window.document.querySelectorAll('.study-skeleton-line')] as HTMLElement[];
assert.equal(lines.length, 1, 'lines=0 经 Math.max(1, lines) 仍为 1 行');
assert.equal(lines[0].style.height, '16px');
});

it('Skeleton：自定义高度覆盖全部行、className 拼接到容器', async () => {
await mount(React.createElement(C.Skeleton, { lines: 3, height: '20px', className: 'x'}));
const lines = [...dom.window.document.querySelectorAll('.study-skeleton-line')] as HTMLElement[];
assert.equal(lines.length, 3);
assert.ok(lines.every((l) => l.style.height === '20px'));
assert.equal(lines[2].style.width, '68%', '末行仍为 68%');
assert.ok(dom.window.document.querySelector('.study-skeleton-group.x'), 'className 应拼到容器');
});

it('SuccessNotice：主文案必现，submessage 有则渲染、无则不渲染', async () => {
await mount(React.createElement(C.SuccessNotice, { message: '已完成'}));
assert.ok(bodyText().includes('已完成'));
assert.ok(!dom.window.document.querySelector('.study-success-sub'), '无 submessage 时不应渲染副文案');
await mount(React.createElement(C.SuccessNotice, { message: '已完成', submessage: '副标题'}));
assert.ok(bodyText().includes('副标题'));
assert.equal((dom.window.document.querySelector('[role="status"]') as HTMLElement | null)?.className, 'study-success-notice study-message');
});

it('EmptyState：默认图标 + 标题 + 描述', async () => {
await mount(React.createElement(C.EmptyState, { title: '空空如也', description: '暂无内容'}));
assert.ok(dom.window.document.querySelector('.study-empty-svg'), '无 icon 时应渲染默认 SVG');
assert.equal(dom.window.document.querySelector('.study-empty-heading')?.textContent, '空空如也');
assert.ok(bodyText().includes('暂无内容'));
assert.ok(!dom.window.document.querySelector('.study-empty-action'), '无 action 时不应渲染操作区');
});

it('EmptyState：自定义图标替换默认 SVG，action 渲染进操作区', async () => {
await mount(React.createElement(C.EmptyState, {
title: 'T',
icon: React.createElement('span', { id: 'ci'}, 'ICON'),
action: React.createElement('button', null, '去添加'),
}));
assert.ok(dom.window.document.querySelector('#ci'), '自定义图标应渲染');
assert.ok(!dom.window.document.querySelector('.study-empty-svg'), '自定义图标时不应渲染默认 SVG');
assert.ok(dom.window.document.querySelector('.study-empty-action button'), 'action 应渲染进操作区');
});

it('ActionableError：无建议时渲染默认三条建议原文', async () => {
await mount(React.createElement(C.ActionableError, { error: '出错了'}));
const items = [...dom.window.document.querySelectorAll('.study-error-advice-list li')].map((li) => li.textContent);
assert.deepEqual(items, [
'若文件偏大（超过 50MB），可先使用「文件转换」基础压缩后再试。',
'确认文档或图片格式有效，且未设置打开密码保护。',
'若在微信内打开受限，可点击右上角「···」复制链接到系统浏览器。',
]);
assert.equal(dom.window.document.querySelector('[role="alert"] strong')?.textContent, '出错了');
assert.ok(!buttons().some((b) => (b.textContent?? '').includes('重试一次')), '无 onRetry 时不应有重试按钮');
});

it('ActionableError：自定义建议替换默认建议', async () => {
await mount(React.createElement(C.ActionableError, { error: 'E', suggestions: ['换一个', '再试一次']}));
const items = [...dom.window.document.querySelectorAll('.study-error-advice-list li')].map((li) => li.textContent);
assert.deepEqual(items, ['换一个', '再试一次']);
});

it('ActionableError：重试按钮调用 onRetry', async () => {
let retries = 0;
await mount(React.createElement(C.ActionableError, { error: 'E', onRetry: () => { retries++;}}));
await click(button('重试一次'));
assert.equal(retries, 1);
});

it('Table：首行渲染 th、其余 td，null 单元格为空串', async () => {
await mount(React.createElement(C.Table, { rows: [['姓名', '分数'], ['张三', 90], ['李四', null]]}));
assert.deepEqual([...dom.window.document.querySelectorAll('th')].map((th) => th.textContent), ['姓名', '分数']);
assert.deepEqual([...dom.window.document.querySelectorAll('td')].map((td) => td.textContent), ['张三', '90', '李四', '']);
});

it('Table：超过 101 行只渲染前 101 行', async () => {
const rows = Array.from({ length: 105}, (_, i) => [`r${i}`]);
await mount(React.createElement(C.Table, { rows}));
assert.equal(dom.window.document.querySelectorAll('tr').length, 101);
assert.equal(dom.window.document.querySelectorAll('tr')[100].textContent, 'r100');
});

it('WeChatNotice：非微信环境渲染为空', async () => {
await mount(React.createElement(C.WeChatNotice, {}));
assert.equal(bodyText(), '', '非微信 UA 时应返回 null');
});

it('WeChatNotice：微信环境下默认/ZIP/图片/自定义四种文案', async () => {
const originalUA = dom.window.navigator.userAgent;
Object.defineProperty(dom.window.navigator, 'userAgent', { value: 'Mozilla/5.0 MicroMessenger/8.0.0', configurable: true});
try {
await mount(React.createElement(C.WeChatNotice, {}));
assert.ok(bodyText().includes('微信环境提示'));
assert.ok(bodyText().includes('微信内置浏览器对本地文件下载有较多限制'));
await mount(React.createElement(C.WeChatNotice, { isZip: true}));
assert.ok(bodyText().includes('微信内置浏览器无法直接保存 ZIP 压缩包'));
await mount(React.createElement(C.WeChatNotice, { isImage: true}));
assert.ok(bodyText().includes('长按下方修复后的图片即可「保存到手机相册」'));
await mount(React.createElement(C.WeChatNotice, { customText: '自定义提示文案'}));
assert.ok(bodyText().includes('自定义提示文案'));
assert.ok(!bodyText().includes('微信内置浏览器对本地文件下载有较多限制'), 'customText 应覆盖默认文案');
} finally {
Object.defineProperty(dom.window.navigator, 'userAgent', { value: originalUA, configurable: true});
}
});

it('ShareToClassmates：渲染三个操作按钮，无 navigator.share 时不显示系统分享', async () => {
await mount(React.createElement(C.ShareToClassmates, { toolId: 'qr'}));
assert.deepEqual(buttons().map((b) => b.textContent), [
'📋 一键复制分享文案',
'🖼️ 下载分享卡片 (PNG)',
'预览分享卡片 ▾',
]);
assert.ok(bodyText().includes('分享给身边的同学'));
});

it('ShareToClassmates：复制文案写入剪贴板，按钮与提示随之变化', async () => {
clipboardText = '';
await mount(React.createElement(C.ShareToClassmates, { toolId: 'qr'}));
await click(button('一键复制分享文案'));
await settle();
assert.equal(clipboardText, [
'【NOVIP】大学做作业/报名前救急：二维码生成与解析',
'✨ 卖点：纯本地免费急救工具箱，免登录、无水印、不上传文件。',
'🔒 优势：纯浏览器本地内存处理、不上传论文与个人文件、免登录无水印',
'👉 电脑/手机直达：https://novip.site/tools/qr',
].join('\n'));
assert.ok(bodyText().includes('✓ 文案已复制'), '复制后按钮应变为已复制态');
assert.ok(bodyText().includes('✓ 分享文案已复制，可直接粘贴发到微信群或发给同学！'));
});

it('ShareToClassmates：未知工具 id 复制文案回落为「NOVIP 实用工具」', async () => {
clipboardText = '';
await mount(React.createElement(C.ShareToClassmates, { toolId: 'no-such-tool'}));
await click(button('一键复制分享文案'));
await settle();
assert.ok(clipboardText.includes('NOVIP 实用工具'), '未知工具应回落通用名');
assert.ok(clipboardText.includes('https://novip.site'), '未知工具链接回落首页');
});

it('ShareToClassmates：预览开关展开画布、再点收起', async () => {
await mount(React.createElement(C.ShareToClassmates, { toolId: 'qr'}));
assert.ok(!dom.window.document.querySelector('canvas'), '默认不应渲染预览画布');
await click(button('预览分享卡片'));
const canvas = dom.window.document.querySelector('canvas') as HTMLCanvasElement;
assert.ok(canvas, '展开后应渲染预览画布');
assert.equal(canvas.width, 640);
assert.equal(canvas.height, 360);
assert.ok(bodyText().includes('收起卡片预览'));
await click(button('收起卡片预览'));
assert.ok(!dom.window.document.querySelector('canvas'), '收起后画布应移除');
});

it('ShareToClassmates：有 navigator.share 时显示系统分享，点击后提示已调起', async () => {
Object.defineProperty(dom.window.navigator, 'share', { value: async () => undefined, configurable: true});
try {
await mount(React.createElement(C.ShareToClassmates, { toolId: 'qr'}));
assert.ok(buttons().some((b) => (b.textContent?? '').includes('系统分享')), '有 navigator.share 时应显示系统分享按钮');
await click(button('系统分享'));
await settle();
assert.ok(bodyText().includes('已调起系统分享。'));
} finally {
delete (dom.window.navigator as unknown as Record<string, unknown>).share;
}
});

it('appNavigate：pushState 改路径、派发 popstate、回滚到顶部', async () => {
const before = popstates;
C.appNavigate('/tools/qr');
assert.equal(dom.window.location.pathname, '/tools/qr');
assert.equal(popstates, before + 1, '应派发一次 popstate');
assert.deepEqual(scrolled, { top: 0});
// 复位路径，避免影响后续轮次对 window.location 的读取
dom.window.history.pushState(null, '', '/');
});
});
