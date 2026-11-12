/**
 * 随机分组与点名抽签 · 核心单测（Factory Day 5，2026-10-31）。
 * 注入确定性随机源验证洗牌/分组/抽取逻辑；真实随机源只验证等概率口径的边界，
 * 不做 flaky 的分布断言。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tools, currentPage } from '../src/tools/registry';
import { pageSeo, toolNotes } from '../src/seo';
import {
  dateSuffix,
  groupsToCsv,
  groupsToText,
  makeGroups,
  parseNames,
  pickWithoutReplacement,
  randomOrder,
  shuffle,
} from '../src/tools/random-pick-core';

/** 确定性随机源：永远返回 0 → Fisher-Yates 每次把当前项与第 0 项交换。 */
const zeroRand = () => 0;
/**
 * 恒等随机源：secureRandomInt 把 rand() 映射为 floor(rand*2^32) 再取模；
 * 按 i=3,2,1 的调用顺序依次返回 raw=3,2,1，使每次 j=i，洗牌后顺序不变。
 */
const makeIdentityRand = () => {
  const queue = [3, 2, 1];
  let k = 0;
  return () => (queue[k++] ?? 1) / 0x100000000;
};

describe('名单解析', () => {
  it('按换行/逗号/分号/顿号切分，去空行与首尾空格', () => {
    const { names, duplicates } = parseNames('陈晨\n林晓,王磊；赵雨、刘洋\n\n  张萌  ');
    assert.deepEqual(names, ['陈晨', '林晓', '王磊', '赵雨', '刘洋', '张萌']);
    assert.deepEqual(duplicates, []);
  });

  it('重复姓名原样保留并提示', () => {
    const { names, duplicates } = parseNames('陈晨\n林晓\n陈晨');
    assert.deepEqual(names, ['陈晨', '林晓', '陈晨']);
    assert.deepEqual(duplicates, ['陈晨']);
  });

  it('空输入得到空名单', () => {
    assert.deepEqual(parseNames('  \n,，；、').names, []);
  });
});

describe('洗牌与抽取', () => {
  it('洗牌不改动入参且不丢不增元素', () => {
    const src = ['a', 'b', 'c', 'd'];
    const out = shuffle(src, makeIdentityRand());
    assert.deepEqual(out, ['a', 'b', 'c', 'd']);
    assert.deepEqual(src, ['a', 'b', 'c', 'd']);
  });

  it('确定性随机源下洗牌结果可复现', () => {
    assert.deepEqual(shuffle(['a', 'b', 'c'], zeroRand), ['b', 'c', 'a']);
    assert.deepEqual(shuffle(['a', 'b', 'c'], zeroRand), shuffle(['a', 'b', 'c'], zeroRand));
  });

  it('无放回抽取：抽中与剩余互不重叠且并集等于原池', () => {
    const { picked, remaining } = pickWithoutReplacement(['a', 'b', 'c', 'd'], 2, makeIdentityRand());
    assert.equal(picked.length, 2);
    assert.equal(remaining.length, 2);
    assert.deepEqual([...picked, ...remaining].sort(), ['a', 'b', 'c', 'd']);
  });

  it('抽取数超过池子、抽取数小于 1 时报错', () => {
    assert.throws(() => pickWithoutReplacement(['a'], 2), /不能超过剩余人数/);
    assert.throws(() => pickWithoutReplacement(['a'], 0), /至少为 1/);
  });
});

describe('随机分组', () => {
  it('按组数切分：人数均分，组间差至多 1', () => {
    const groups = makeGroups(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { mode: 'byCount', value: 3 }, makeIdentityRand());
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map((g) => g.length).sort(), [2, 2, 3]);
    assert.deepEqual(groups.flat().sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('按每组人数切分：组数自动算出，余数均匀分摊', () => {
    const groups = makeGroups(['a', 'b', 'c', 'd', 'e'], { mode: 'bySize', value: 2 }, makeIdentityRand());
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map((g) => g.length).sort(), [1, 2, 2]);
  });

  it('非法分组参数报错', () => {
    assert.throws(() => makeGroups(['a'], { mode: 'byCount', value: 1 }), /至少需要 2 人/);
    assert.throws(() => makeGroups(['a', 'b'], { mode: 'byCount', value: 3 }), /不能超过人数/);
    assert.throws(() => makeGroups(['a', 'b'], { mode: 'bySize', value: 0 }), /正整数/);
  });
});

describe('随机排序与导出', () => {
  it('随机排序保留全部元素（顺序由随机源决定，不做恒等断言）', () => {
    const out = randomOrder(['a', 'b', 'c'], makeIdentityRand());
    assert.equal(out.length, 3);
    assert.deepEqual([...out].sort(), ['a', 'b', 'c']);
    assert.throws(() => randomOrder(['a']), /至少需要 2 人/);
  });

  it('CSV 导出：每组一列、含表头、逗号转义', () => {
    const csv = groupsToCsv([['陈晨', '林晓'], ['王磊']]);
    const lines = csv.split('\n');
    assert.equal(lines[0], '第1组,第2组');
    assert.equal(lines[1], '陈晨,王磊');
    assert.equal(lines[2], '林晓,');
  });

  it('文本导出格式', () => {
    assert.equal(groupsToText([['a', 'b'], ['c']]), '第1组（2人）：a、b\n第2组（1人）：c');
  });

  it('日期后缀为 8 位数字', () => {
    assert.match(dateSuffix(new Date(2026, 9, 31)), /^\d{8}$/);
    assert.equal(dateSuffix(new Date(2026, 9, 31)), '20261031');
  });
});

describe('随机抽签独立页接线（/tools/random-pick）', () => {
  it('注册表、路由与 SEO 齐备', () => {
    const tool = tools.find((t) => t.id === 'random-pick');
    assert.ok(tool, 'random-pick 工具应存在');
    assert.equal(tool.path, '/tools/random-pick');
    assert.equal(currentPage('/tools/random-pick', ''), 'random-pick');
    assert.equal(currentPage('/tools/random-pick/', ''), 'random-pick');
    const seo = pageSeo('random-pick');
    assert.equal(seo.canonical, 'https://novip.site/tools/random-pick');
    assert.match(seo.title, /随机分组与点名抽签/);
    assert.ok(toolNotes['random-pick'], 'random-pick 应有 toolNotes 说明');
    assert.match(toolNotes['random-pick']!, /本地/);
  });
});
