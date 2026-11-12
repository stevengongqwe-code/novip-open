import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdownToWechatHtml, WECHAT_THEMES} from '../src/tools/md-to-wechat-core';

describe('MdToWechatCore — 微信公众号排版引擎', () => {
  it('renders inline-styled HTML without external css dependencies', () => {
    const md = `# 标题一
## 标题二
> 这是一个引用块

- 列表项一
- 列表项二

正文带有 **加粗** 和 \`行内代码\` 以及 [链接](https://novip.site)。
`;

    const html = renderMarkdownToWechatHtml(md, 'academic-blue');
    assert.ok(html.includes('<h1 style="font-size: 20px; font-weight: bold; color: #0071e3;'));
    assert.ok(html.includes('<h2 style="font-size: 17px; font-weight: bold; color: #1e293b; border-left: 4px solid #0071e3;'));
    assert.ok(html.includes('<blockquote style="background: #f0f9ff; border-left: 3px solid #0071e3;'));
    assert.ok(html.includes('<strong>加粗</strong>'));
    assert.ok(html.includes('<code style="background: rgba(0,0,0,0.06);'));
    assert.ok(html.includes('列表项一'));
  });

  it('supports theme switching with custom theme palette colors', () => {
    const md = '# 绿色主题测试';
    const htmlGreen = renderMarkdownToWechatHtml(md, 'emerald-fresh');
    assert.ok(htmlGreen.includes('color: #059669;'));
  });

  it('exposes 4 standard campus themes', () => {
    assert.equal(WECHAT_THEMES.length, 4);
    const ids = WECHAT_THEMES.map(t => t.id);
    assert.ok(ids.includes('academic-blue'));
    assert.ok(ids.includes('emerald-fresh'));
    assert.ok(ids.includes('minimal-ink'));
    assert.ok(ids.includes('warm-sunset'));
  });
});
