import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tools } from '../src/tools/registry.ts';
import {
  generateForYouFeed,
  getTemporalBiases,
  TASK_AFFINITY_GRAPH,
  type RealGraphStore,
} from '../src/tools/x-recommend.ts';
import { resolveGrokIntent } from '../src/tools/grok-intent.ts';

describe('X 算法推荐引擎 (For You Heavy Ranker)', () => {
  it('默认状态下生成 8 款高频实用工具且附带推荐理由与徽标', () => {
    const feed = generateForYouFeed({}, Date.now(), 8);
    assert.equal(feed.length, 8);
    for (const item of feed) {
      assert.ok(tools.some((t) => t.id === item.id), `推荐项 ${item.id} 必须为注册工具`);
      assert.ok(item.score > 0, `得分必须大于 0`);
      assert.ok(item.reason.length >= 2, `必须包含推荐理由`);
      assert.ok(item.badge.length >= 2, `必须包含推荐徽标`);
    }
  });

  it('多样性重排（Diversity Reranker）：同一分组至多展示 2 款工具', () => {
    const feed = generateForYouFeed({}, Date.now(), 8);
    const groupCount: Record<string, number> = {};
    for (const item of feed) {
      const tool = tools.find((t) => t.id === item.id)!;
      groupCount[tool.group] = (groupCount[tool.group] || 0) + 1;
    }
    for (const [group, count] of Object.entries(groupCount)) {
      assert.ok(count <= 2, `分组【${group}】最多展示 2 款，实际为 ${count}`);
    }
  });

  it('本地 RealGraph 协同扩散：当用户高频使用【PPT图片提取】时，协同推荐图片工具与排版', () => {
    const fakeStore: RealGraphStore = {
      'ppt-extract': {
        opens: 5,
        copies: 3,
        saves: 4,
        lastUsed: Date.now() - 1000 * 60 * 30, // 30 分钟前
      },
    };
    const feed = generateForYouFeed(fakeStore, Date.now(), 8);
    const toolIds = feed.map((f) => f.id);
    assert.ok(toolIds.includes('ppt-extract'), '用户常备的 ppt-extract 必须位于推荐前列');
    // 协同工具之一应获得提升
    const hasSynergy = toolIds.includes('images') || toolIds.includes('handwrite') || toolIds.includes('ppt');
    assert.ok(hasSynergy, '应协同推荐关联工具（图片压缩/手写/PPT瘦身）');

    const pptExtractItem = feed.find((f) => f.id === 'ppt-extract');
    assert.equal(pptExtractItem?.badge, '常备');
    assert.equal(pptExtractItem?.reason, '你最近经常使用');
  });

  it('本地 RealGraph 协同扩散：当用户高频使用【报名照片】时，协同推荐换底色与材料检查', () => {
    const fakeStore: RealGraphStore = {
      photo: {
        opens: 4,
        copies: 2,
        saves: 3,
        lastUsed: Date.now() - 1000 * 60 * 10,
      },
    };
    const feed = generateForYouFeed(fakeStore, Date.now(), 8);
    const toolIds = feed.map((f) => f.id);
    assert.ok(toolIds.includes('background') || toolIds.includes('materials'), '应协同推荐换底色或材料检查');
  });

  it('时序先验：周日晚间给课程表与请假加权', () => {
    // 2026-11-01 is a Sunday at 20:30
    const sundayNight = new Date('2026-11-01T20:30:00+08:00');
    const biases = getTemporalBiases(sundayNight);
    assert.ok(biases.timetable, '周日晚间必须提升课表权重');
    assert.ok(biases.timetable.boost >= 2.0);
    assert.equal(biases.timetable.reason, '新一周课表查阅高峰');
  });
});

describe('xAI Grok 智能意图直达求解器 (Zero-BS Intent Solver)', () => {
  it('口语化提取课件原图：精准识别痛点并直达 ppt-extract', () => {
    const result = resolveGrokIntent('老师发了课件PPT我想把里面的图片存下来');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'ppt-extract');
    assert.equal(result?.secondaryToolId, 'images');
    assert.ok(result?.userDilemma.includes('手动截图'));
    assert.ok(result?.solution.includes('提取课件内的所有高清原图'));
    assert.equal(result?.stepGuide.length, 3);
    assert.ok(result?.grokTip.includes('媒体层'));
  });

  it('口语化报名照换底色：精准识别红底换蓝底并直达 background', () => {
    const result = resolveGrokIntent('手头的照片是红底的学校要求蓝底');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'background');
    assert.equal(result?.secondaryToolId, 'photo');
    assert.ok(result?.userDilemma.includes('急需蓝底或白底'));
    assert.ok(result?.actionLabel.includes('抠图换底'));
  });

  it('口语化照片压100KB：直达 photo', () => {
    const result = resolveGrokIntent('考公报名照片太大了要压缩到100kb以内');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'photo');
    assert.ok(result?.solution.includes('100KB 以内'));
  });

  it('口语化课表同步：直达 timetable 导入日历', () => {
    const result = resolveGrokIntent('想把开学课程表导入到手机日历提醒我上课');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'timetable');
    assert.ok(result?.grokTip.includes('原生自带日历'));
  });

  it('口语化班委收作业：直达 material-collector', () => {
    const result = resolveGrokIntent('班长收全班作业大作业核对名单看看谁没交');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'material-collector');
    assert.ok(result?.solution.includes('未交人员名单'));
  });

  it('口语化论文参考文献：直达 references', () => {
    const result = resolveGrokIntent('毕业论文参考文献格式知网引用');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'references');
    assert.ok(result?.solution.includes('GB/T 7714'));
  });

  it('口语化房贷与利息：直达 finance', () => {
    const result = resolveGrokIntent('买东西借了钱想算一下每个月的月供和利息');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'finance');
    assert.ok(result?.solution.includes('等额本息'));
  });

  it('口语化网页做成安卓APP：直达 web-to-apk', () => {
    const result = resolveGrokIntent('把我的个人网站做成安卓app生成apk安装包');
    assert.ok(result, '应成功匹配意图');
    assert.equal(result?.primaryToolId, 'web-to-apk');
    assert.ok(result?.solution.includes('apk'));
  });

  it('空查询或无意义字符安全返回 null', () => {
    assert.equal(resolveGrokIntent(''), null);
    assert.equal(resolveGrokIntent(' '), null);
    assert.equal(resolveGrokIntent('a'), null);
    assert.equal(resolveGrokIntent('xyz123'), null);
  });
});
