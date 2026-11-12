/**
 * 参考文献独立页路由回归测试（OPERATION NIGHT SHIFT 2026-10-27）。
 * 背景：references 曾为 hash 路由 /#references，不进 pathTools，
 * 因此无预渲染页、sitemap 缺失、canonical 回退首页，生产 /tools/references 404。
 * 本测试锁死：独立路径生效 + 旧 hash 链接向后兼容。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {tools, currentPage} from '../src/tools/registry';
import {pathTools, pageSeo} from '../src/seo';

describe('参考文献独立页（/tools/references）', () => {
  it('registry 中 references 使用独立路径', () => {
    const ref = tools.find((t) => t.id === 'references');
    assert.ok(ref, 'references 工具应存在');
    assert.equal(ref.path, '/tools/references');
  });

  it('references 进入 pathTools（预渲染页 + sitemap 数据源）', () => {
    assert.ok(
      pathTools.some((t) => t.id === 'references'),
      'references 应进入 pathTools，否则 generate-seo 不生成独立页、sitemap 不收录',
    );
    const paths = pathTools.map((t) => t.path);
    assert.equal(new Set(paths).size, paths.length, 'pathTools 路径不得重复');
  });

  it('currentPage 可解析独立路径（含尾斜杠）', () => {
    assert.equal(currentPage('/tools/references', ''), 'references');
    assert.equal(currentPage('/tools/references/', ''), 'references');
  });

  it('旧 hash 链接 /#references 向后兼容', () => {
    assert.equal(currentPage('/', '#references'), 'references');
    assert.equal(currentPage('/', '#/references'.replace('/', '')), 'references');
  });

  it('SEO canonical 指向独立页而非首页', () => {
    const seo = pageSeo('references');
    assert.equal(seo.canonical, 'https://novip.site/tools/references');
    assert.match(seo.title, /参考文献格式化/);
    assert.match(seo.description, /GB\/T 7714/);
  });
});
