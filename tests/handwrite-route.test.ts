/**
 * 手写生成器独立页路由回归测试（OPERATION NOVIP FACTORY Day 3，2026-10-29）。
 * 背景：handwrite 曾为 hash 路由 /#handwrite，不进 pathTools，
 * 因此无预渲染页、sitemap 缺失、canonical 回退首页，与 #46 修复前的 references、
 * #48 修复前的 sheets 同病；生产实测 /tools/handwrite 曾为 404。
 * 本测试锁死：独立路径生效 + 旧 hash 链接向后兼容。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {tools, currentPage} from '../src/tools/registry';
import {pathTools, pageSeo, toolNotes} from '../src/seo';

describe('手写生成器独立页（/tools/handwrite）', () => {
  it('registry 中 handwrite 使用独立路径', () => {
    const handwrite = tools.find((t) => t.id === 'handwrite');
    assert.ok(handwrite, 'handwrite 工具应存在');
    assert.equal(handwrite.path, '/tools/handwrite');
  });

  it('handwrite 进入 pathTools（预渲染页 + sitemap 数据源）', () => {
    assert.ok(
      pathTools.some((t) => t.id === 'handwrite'),
      'handwrite 应进入 pathTools，否则 generate-seo 不生成独立页、sitemap 不收录',
    );
    const paths = pathTools.map((t) => t.path);
    assert.equal(new Set(paths).size, paths.length, 'pathTools 路径不得重复');
  });

  it('currentPage 可解析独立路径（含尾斜杠）', () => {
    assert.equal(currentPage('/tools/handwrite', ''), 'handwrite');
    assert.equal(currentPage('/tools/handwrite/', ''), 'handwrite');
  });

  it('旧 hash 链接 /#handwrite 向后兼容', () => {
    assert.equal(currentPage('/', '#handwrite'), 'handwrite');
  });

  it('SEO canonical 指向独立页而非首页，且有 handwrite 专属说明', () => {
    const seo = pageSeo('handwrite');
    assert.equal(seo.canonical, 'https://novip.site/tools/handwrite');
    assert.match(seo.title, /手写生成器/);
    assert.match(seo.description, /20,000 字/);
    assert.ok(toolNotes.handwrite, 'handwrite 应有 toolNotes 说明（与 #46 的 references、#48 的 sheets 同模式）');
  });
});
