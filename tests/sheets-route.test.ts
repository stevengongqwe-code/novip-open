/**
 * Excel 合并独立页路由回归测试（OPERATION NIGHT SHIFT 2026-10-27 第 2 轮）。
 * 背景：sheets 曾为 hash 路由 /#sheets，不进 pathTools，
 * 因此无预渲染页、sitemap 缺失、canonical 回退首页，与 #46 修复前的 references 同病。
 * 本测试锁死：独立路径生效 + 旧 hash 链接向后兼容。
 * 注意：本分支基于已合并 #46 的 main，主导航已是注册表查路径写法，无需再改 main.tsx。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {tools, currentPage} from '../src/tools/registry';
import {pathTools, pageSeo, toolNotes} from '../src/seo';

describe('Excel 合并独立页（/tools/sheets）', () => {
  it('registry 中 sheets 使用独立路径', () => {
    const sheets = tools.find((t) => t.id === 'sheets');
    assert.ok(sheets, 'sheets 工具应存在');
    assert.equal(sheets.path, '/tools/sheets');
  });

  it('sheets 进入 pathTools（预渲染页 + sitemap 数据源）', () => {
    assert.ok(
      pathTools.some((t) => t.id === 'sheets'),
      'sheets 应进入 pathTools，否则 generate-seo 不生成独立页、sitemap 不收录',
    );
    const paths = pathTools.map((t) => t.path);
    assert.equal(new Set(paths).size, paths.length, 'pathTools 路径不得重复');
  });

  it('currentPage 可解析独立路径（含尾斜杠）', () => {
    assert.equal(currentPage('/tools/sheets', ''), 'sheets');
    assert.equal(currentPage('/tools/sheets/', ''), 'sheets');
  });

  it('旧 hash 链接 /#sheets 向后兼容', () => {
    assert.equal(currentPage('/', '#sheets'), 'sheets');
  });

  it('SEO canonical 指向独立页而非首页，且有 sheets 专属说明', () => {
    const seo = pageSeo('sheets');
    assert.equal(seo.canonical, 'https://novip.site/tools/sheets');
    assert.match(seo.title, /Excel合并/);
    assert.match(seo.description, /按列名对齐/);
    assert.ok(toolNotes.sheets, 'sheets 应有 toolNotes 说明（与 #46 的 references 同模式）');
  });
});
