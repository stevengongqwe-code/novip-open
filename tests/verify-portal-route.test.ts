/**
 * Claude 体检门户（/verify）路由与 SEO 接线回归测试。
 * 背景：站主不会开终端、看日志，所以把「Claude 桌面应用装得对不对」做成站点内页面 /verify：
 * 拖入本地体检脚本生成的 claude-check.json，一页看清结论并导出报告。
 * 本测试锁死「页面能被路由到、能进 SEO 产物」这条接线；解析/汇总逻辑本身由
 * tests/verify-portal-core.test.ts 覆盖。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {tools, currentPage, SYSTEM_TOOL_IDS} from '../src/tools/registry';
import {pathTools, pageSeo, toolNotes, TOOL_SEO_META, SITE_URL} from '../src/seo';

const verifyTool = tools.find((t) => t.id === 'verify');

describe('Claude 体检门户独立页（/verify）', () => {
  it('registry 中存在 verify 项，且使用独立路径 /verify', () => {
    assert.ok(verifyTool, 'registry 应包含 verify 工具');
    assert.equal(verifyTool.path, '/verify');
    assert.ok(verifyTool.name.trim().length > 0, 'verify 需要中文名称');
    assert.ok(verifyTool.task.trim().length > 0, 'verify 需要中文任务描述');
    assert.ok(tools.filter((t) => t.id === 'verify').length === 1, 'verify 不得重复注册');
  });

  it('verify 已登记为系统类工具（不参与面向学生的工具计数）', () => {
    assert.ok(
      (SYSTEM_TOOL_IDS as readonly string[]).includes('verify'),
      'verify 应在 SYSTEM_TOOL_IDS 中，否则既有「50 款工具」断言会被撑破',
    );
  });

  it('currentPage 可解析 /verify（含尾斜杠与旧 hash 形式）', () => {
    assert.equal(currentPage('/verify', ''), 'verify');
    assert.equal(currentPage('/verify/', ''), 'verify');
    assert.equal(currentPage('/', '#verify'), 'verify');
  });

  it('verify 进入 pathTools（预渲染页 + sitemap + EdgeOne 规则的数据源）', () => {
    assert.ok(
      pathTools.some((t) => t.id === 'verify'),
      'verify 必须在 pathTools 中，否则 generate-seo 不生成 /verify/index.html、sitemap 不收录',
    );
    const paths = pathTools.map((t) => t.path);
    assert.equal(new Set(paths).size, paths.length, 'pathTools 路径不得重复');
  });

  it('SEO：canonical 指向 /verify，title 与 description 唯一且非空', () => {
    const seo = pageSeo('verify');
    assert.equal(seo.canonical, SITE_URL + '/verify');
    assert.equal(seo.robots, 'index,follow');
    assert.ok(seo.title.includes('体检'), 'verify 的 title 应包含「体检」（Claude 桌面应用体检门户）');
    assert.ok(seo.description.length >= 40, 'verify 的 description 过短');

    const titles = pathTools.map((t) => pageSeo(t.id).title);
    assert.equal(new Set(titles).size, titles.length, '各独立页 title 必须互不重复（verify-seo-build 会校验）');
    const descriptions = pathTools.map((t) => pageSeo(t.id).description);
    assert.equal(new Set(descriptions).size, descriptions.length, '各独立页 description 必须互不重复');
  });

  it('seo.ts 为 verify 配置了使用说明与专属 SEO 文案', () => {
    assert.ok(toolNotes.verify && toolNotes.verify.length >= 20, 'verify 应有中文使用说明');
    assert.ok(TOOL_SEO_META.verify?.title && TOOL_SEO_META.verify.description, 'verify 应有专属 SEO 文案');
  });

  it('main.tsx 已懒加载并渲染 VerifyPortal', () => {
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    assert.match(main, /const VerifyPortal = lazy\(\(\) => import\("\.\/tools\/VerifyPortal"\)\)/, '缺少 VerifyPortal 懒加载');
    assert.match(main, /id === 'verify' \? \(\s*<VerifyPortal \/>/, 'content() 缺少 verify 分支');
  });

  it('页面组件已实现「拖入 claude-check.json」链路（parseLocalCheckReport + 体检脚本下载链接）', () => {
    const page = readFileSync(new URL('../src/tools/VerifyPortal.tsx', import.meta.url), 'utf8');
    assert.match(page, /parseLocalCheckReport/, '页面必须调用核心层 parseLocalCheckReport 解析拖入的 JSON');
    assert.match(page, /accept="\.json,application\/json"/, '文件选择框应限定 JSON');
    assert.match(page, /onDrop=/, '必须有拖放处理');
    assert.match(page, /\/downloads\/claude-check\.command/, '未做本机体检时应给出体检脚本下载链接');
  });

  it('结论横幅按 fail 项自动判断「账号侧问题」，且能识别核心层加的 local: 前缀', async () => {
    const {parseLocalCheckReport, runVerification} = await import('../src/lib/verify-portal-core');
    const page = readFileSync(new URL('../src/tools/VerifyPortal.tsx', import.meta.url), 'utf8');
    // 页面判断账号问题用的是「去掉 local: 前缀后比对」，这里锁定核心层确实会加前缀，防止将来又错位
    const parsed = parseLocalCheckReport(
      JSON.stringify({
        schema: 'novip-claude-check/v1',
        generatedAt: '2026-10-31T02:10:00+08:00',
        app: {path: '/Applications/Claude.app', bundleId: 'com.anthropic.claudefordesktop', version: '4.4212.0'},
        items: [
          {
            id: 'account_verify_required',
            title: '账号需要完成验证',
            status: 'fail',
            detail: '请打开 https://portal.anthropic.com/verify?org=abc 完成验证',
            suggestion: '这一步必须你本人做。',
          },
        ],
      }),
    );
    assert.ok(parsed.ok, '构造的样例报告应能解析');
    const report = await runVerification({localReport: parsed.report});
    assert.equal(report.verdict, 'blocked');
    const failItem = report.items.find((item) => item.status === 'fail');
    assert.equal(failItem?.id, 'local:account_verify_required', '核心层会给本机项加 local: 前缀');
    assert.match(page, /replace\(\/\^local:\/, ''\)/, '页面必须去掉 local: 前缀后再判断账号问题');
    assert.match(page, /target="_blank" rel="noopener noreferrer"/, 'detail 里的 https 链接必须渲染为安全外链');
    assert.match(page, /该链接会离开本站/, '外链必须提示会离开本站');
  });

  it('页面组件文件存在（VerifyPortal.tsx 由 UI 任务提供）', () => {
    assert.ok(
      existsSync(new URL('../src/tools/VerifyPortal.tsx', import.meta.url)),
      'src/tools/VerifyPortal.tsx 尚未创建',
    );
  });
});

describe('结论文案回归（真人会看到的那一行）', () => {
  it('attention 状态数的是 warn 项（fail 恒为 0，不能用 fails.length）', () => {
    // 源码层断言：这正是 2026-10-31 修复的 bug——attention 时误用 fails.length 会显示「但有 几 项」。
    const source = readFileSync('src/tools/VerifyPortal.tsx', 'utf8');
    const attentionLine = source.split('\n').find((line) => line.includes("verdict === 'attention'") && line.includes('值得留意'));
    assert.ok(attentionLine, '找不到 attention 结论文案');
    assert.ok(
      attentionLine.includes('warns.length'),
      'attention 结论必须使用 warns.length 统计待留意项，而不是 fails.length',
    );
    assert.ok(
      !attentionLine.includes('fails.length'),
      'attention 状态下的 fail 数恒为 0，使用 fails.length 会退化成「但有 几 项」',
    );
  });
});
