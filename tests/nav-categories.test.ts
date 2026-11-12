import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_CATEGORIES,NAV_ENTRIES,
  filterNav,validateEntries,liveEntries,
  type NavCategory, type NavEntry,
} from '../src/tools/college-nav-data';

// 大学生导航分类常量契约测试：NAV_CATEGORIES 是 /nav 筛选芯片与词条分类校验的唯一来源。
// 运行：npm test（node --import tsx --test tests/*.test.ts）
// 断言全部基于 NAV_CATEGORIES 与 NAV_ENTRIES 的真实数据（44 条，2 条 pending 上线 42 条）。
// 预期值先经 npx tsx 探针核对：各分类总数 6/4/8/6/8/12，上线条数 6/4/8/6/8/10。

const good:NavEntry={
  id:'x-test',name:'测试站',category:'免费工具与协作',url:'https://example.com',
  purpose:'用途',scenarios:'场景',keywords:['别称'],official:false,
  fee:'免费',login:'无需登录',notes:'注意事项',sources:['https://example.com/about'],
  verifiedAt:'2026-10-22',verifyMethod:'测试',status:'verified',
};

const EXPECTED_CATEGORIES=[
  '考试报名与查分',
  '学籍与升学',
  '学习与文献',
  '实习与就业',
  '免费工具与协作',
  'NOVIP自有工具',
] as const;

const TOTAL_COUNTS:Record<NavCategory,number>={
  '考试报名与查分':6,
  '学籍与升学':4,
  '学习与文献':8,
  '实习与就业':6,
  '免费工具与协作':8,
  'NOVIP自有工具':12,
};

const LIVE_COUNTS:Record<NavCategory,number>={
  '考试报名与查分':6,
  '学籍与升学':4,
  '学习与文献':8,
  '实习与就业':6,
  '免费工具与协作':8,
  'NOVIP自有工具':10,
};

describe('NAV_CATEGORIES 字面值锁定',()=>{
  it('六个分类值逐字锁定且顺序固定',()=>{
    assert.deepEqual([...NAV_CATEGORIES], [...EXPECTED_CATEGORIES]);
  });
  it('恰好 6 个、均为非空字符串、无首尾空白、互不重复',()=>{
    assert.equal(NAV_CATEGORIES.length,6);
    assert.ok(NAV_CATEGORIES.every((c)=>typeof c==='string'&&c.length>0&&c===c.trim()));
    assert.equal(new Set(NAV_CATEGORIES).size,NAV_CATEGORIES.length);
  });
  it('常量即校验白名单：常量内每个值作分类均通过，常量外报错',()=>{
    for (const category of NAV_CATEGORIES) {
      assert.deepEqual(validateEntries([{...good, id:`ok-${category}`, category}]),[],category);
    }
    const errs=validateEntries([{...good, id:'bad-cat', category:'吃喝玩乐'} as unknown as NavEntry]);
    assert.ok(errs.some((x)=>/非法分类/.test(x)),JSON.stringify(errs));
  });
});

describe('NAV_CATEGORIES × NAV_ENTRIES 数据集交叉契约',()=>{
  it('词条用到的分类集合恰好等于常量集合',()=>{
    assert.deepEqual(
      [...new Set(NAV_ENTRIES.map((e)=>e.category))].sort(),
      [...NAV_CATEGORIES].sort(),
    );
  });
  it('每个分类至少 1 条词条（无空分类）',()=>{
    for (const category of NAV_CATEGORIES) {
      assert.ok(NAV_ENTRIES.some((e)=>e.category===category),category);
    }
  });
  it('各分类词条总数锁定（含 pending）：6/4/8/6/8/12',()=>{
    for (const category of NAV_CATEGORIES) {
      const n=NAV_ENTRIES.filter((e)=>e.category===category).length;
      assert.equal(n,TOTAL_COUNTS[category],category);
    }
    assert.equal(NAV_ENTRIES.length,44);
  });
  it('2 条 pending 均属 NOVIP自有工具、分类仍在常量内',()=>{
    const pending=NAV_ENTRIES.filter((e)=>e.status==='pending');
    assert.deepEqual(pending.map((e)=>e.id).sort(),['novip-leave-helper','novip-material-collector']);
    assert.ok(pending.every((e)=>e.category==='NOVIP自有工具'));
    assert.ok(pending.every((e)=>(NAV_CATEGORIES as readonly string[]).includes(e.category)));
  });
});

describe('NAV_CATEGORIES × filterNav 筛选交叉契约',()=>{
  for (const category of NAV_CATEGORIES) {
    it(`分类筛选只返回该分类：${category} 上线 ${LIVE_COUNTS[category]} 条`,()=>{
      const r=filterNav(NAV_ENTRIES,{category});
      assert.equal(r.length,LIVE_COUNTS[category],category);
      assert.ok(r.every((e)=>e.category===category),category);
      assert.ok(r.every((e)=>e.status!=='pending'),category);
    });
  }
  it('全部 返回全部 42 条上线词条',()=>{
    assert.equal(filterNav(NAV_ENTRIES,{category:'全部'}).length,42);
    assert.deepEqual(
      filterNav(NAV_ENTRIES,{category:'全部'}).map((e)=>e.id).sort(),
      liveEntries(NAV_ENTRIES).map((e)=>e.id).sort(),
    );
  });
});

describe('NAV_CATEGORIES × /nav 筛选芯片',()=>{
  it('芯片列表为 [全部, ...NAV_CATEGORIES]：7 个标签、首个为 全部',()=>{
    const chips=['全部',...NAV_CATEGORIES] as const;
    assert.equal(chips.length,7);
    assert.equal(chips[0],'全部');
    assert.deepEqual([...chips.slice(1)], [...EXPECTED_CATEGORIES]);
  });
});
