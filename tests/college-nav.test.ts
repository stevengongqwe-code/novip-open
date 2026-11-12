import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_ENTRIES,NAV_FAVORITES_KEY,
  searchNav,filterNav,validateEntries,liveEntries,getFavorites,
  type NavEntry,
} from '../src/tools/college-nav-data';

// 大学生导航逻辑测试：搜索 / 筛选 / 数据校验 / 本地收藏。
// 运行：npm test（node --import tsx --test tests/*.test.ts）
// 断言全部基于 NAV_ENTRIES 的真实数据（44 条，2 条 pending 上线 42 条）。

const good:NavEntry={
  id:'x-test',name:'测试站',category:'免费工具与协作',url:'https://example.com',
  purpose:'用途',scenarios:'场景',keywords:['别称'],official:false,
  fee:'免费',login:'无需登录',notes:'注意事项',sources:['https://example.com/about'],
  verifiedAt:'2026-10-22',verifyMethod:'测试',status:'verified',
};

describe('college-nav searchNav（本地关键词匹配）',()=>{
  it('场景关键词匹配：照片太大 -> 批量图片处理',()=>{
    const r=searchNav(NAV_ENTRIES,'照片太大');
    assert.deepEqual(r.map(e=>e.id),['novip-images']);
  });
  it('多词交集：每个词都必须命中',()=>{
    const r=searchNav(NAV_ENTRIES,'实习 国企');
    assert.ok(r.length>0,'应有结果');
    assert.ok(r.every(e=>/国企/.test([e.name,e.purpose,e.scenarios,e.notes,...e.keywords].join(' '))),'每个结果都含 国企');
    assert.deepEqual(r.map(e=>e.id).sort(),['guopin']);
  });
  it('名称/别称/用途多字段覆盖：实习',()=>{
    assert.deepEqual(searchNav(NAV_ENTRIES,'实习').map(e=>e.id).sort(),['guopin','novip-resume','shixiseng','zhaopin']);
  });
  it('大小写不敏感：ncss 匹配 24365 平台',()=>{
    assert.ok(searchNav(NAV_ENTRIES,'NCSS').some(e=>e.id==='ncss-24365'));
  });
  it('空查询返回全部上线词条（pending 除外）',()=>{
    assert.equal(searchNav(NAV_ENTRIES,'').length,42);
    assert.equal(searchNav(NAV_ENTRIES,'   ').length,42);
  });
  it('无结果返回空数组',()=>{
    assert.deepEqual(searchNav(NAV_ENTRIES,'不存在词条xyz'),[]);
  });
  it('pending 词条不上线：待上线确认搜不到',()=>{
    assert.deepEqual(searchNav(NAV_ENTRIES,'请假理由'),[]);
    assert.deepEqual(searchNav(NAV_ENTRIES,'材料收集'),[]);
  });
  it('搜索结果不包含 pending：liveEntries 一致',()=>{
    assert.equal(liveEntries(NAV_ENTRIES).length,42);
    assert.ok(!liveEntries(NAV_ENTRIES).some(e=>e.status==='pending'));
  });
});

describe('college-nav filterNav（分类/官方/费用独立）',()=>{
  it('分类独立筛选：实习与就业 6 条',()=>{
    assert.equal(filterNav(NAV_ENTRIES,{category:'实习与就业'}).length,6);
  });
  it('仅看官方：31 条',()=>{
    assert.equal(filterNav(NAV_ENTRIES,{officialOnly:true}).length,31);
  });
  it('费用独立筛选：免费 25 条',()=>{
    assert.equal(filterNav(NAV_ENTRIES,{fee:'免费'}).length,25);
  });
  it('官方≠免费：两个维度独立生效、集合不相等',()=>{
    const only=filterNav(NAV_ENTRIES,{officialOnly:true});
    const free=filterNav(NAV_ENTRIES,{fee:'免费'});
    assert.equal(only.length,31);
    assert.equal(free.length,25);
    assert.ok(free.some(e=>!e.official),'存在免费但非官方的词条（如第三方招聘平台求职者端免费）');
    assert.ok(only.some(e=>e.fee!=='免费'),'存在官方但非全免费的词条（如考试报名：浏览免费+业务收费）');
    assert.notDeepEqual(free.filter(e=>e.official).length,only.length,'官方≠免费：两集合不相等');
  });
  it('三维度组合：实习与就业+官方+免费 = 2',()=>{
    assert.deepEqual(
      filterNav(NAV_ENTRIES,{category:'实习与就业',officialOnly:true,fee:'免费'}).map(e=>e.id).sort(),
      ['guopin','ncss-24365'],
    );
  });
  it('费用=部分免费独立生效',()=>{
    const r=filterNav(NAV_ENTRIES,{fee:'部分免费'});
    assert.ok(r.length>0);
    assert.ok(r.every(e=>e.fee==='部分免费'));
  });
  it('空筛选条件返回全部上线词条',()=>{
    assert.equal(filterNav(NAV_ENTRIES,{}).length,42);
  });
});

describe('college-nav validateEntries（数据校验）',()=>{
  it('当前 NAV_ENTRIES 无错误',()=>{
    assert.deepEqual(validateEntries(NAV_ENTRIES),[]);
  });
  it('缺必填字段报错：name/purpose/url 缺失',()=>{
    const e={...good,id:'bad1',name:'',purpose:'',url:''};
    const errs=validateEntries([e]);
    assert.ok(errs.some(x=>/name 缺失/.test(x)),JSON.stringify(errs));
    assert.ok(errs.some(x=>/purpose 缺失/.test(x)),JSON.stringify(errs));
    assert.ok(errs.some(x=>/url 缺失/.test(x)),JSON.stringify(errs));
  });
  it('非法枚举报错：fee/login/status',()=>{
    const e={...good,id:'bad2',fee:'便宜',login:'免登录',status:'unknown'} as unknown as NavEntry;
    const errs=validateEntries([e]);
    assert.ok(errs.some(x=>/fee 非法/.test(x)),JSON.stringify(errs));
    assert.ok(errs.some(x=>/login 非法/.test(x)),JSON.stringify(errs));
    assert.ok(errs.some(x=>/status 非法/.test(x)),JSON.stringify(errs));
  });
  it('非法分类与非法 url 格式报错',()=>{
    const e={...good,id:'bad3',category:'吃喝玩乐',url:'ftp://x'} as unknown as NavEntry;
    const errs=validateEntries([e]);
    assert.ok(errs.some(x=>/非法分类/.test(x)),JSON.stringify(errs));
    assert.ok(errs.some(x=>/url 格式非法/.test(x)),JSON.stringify(errs));
  });
  it('重复 id 与重复 url 报错',()=>{
    const dup={...good,id:'dup',url:'https://dup.example.com'};
    const errs=validateEntries([dup,{...dup}]);
    assert.ok(errs.some(x=>/id 缺失或重复/.test(x)),JSON.stringify(errs));
    assert.ok(errs.some(x=>/url 重复/.test(x)),JSON.stringify(errs));
  });
  it('站内路径 url 合法：/tools/... 与 /#... 不报格式错误',()=>{
    const a={...good,id:'ok1',url:'/tools/ocr'};
    const b={...good,id:'ok2',url:'/#references'};
    assert.deepEqual(validateEntries([a,b]),[]);
  });
  it('verifiedAt 非日期格式报错',()=>{
    const e={...good,id:'bad4',verifiedAt:'22-10-2026'};
    const errs=validateEntries([e]);
    assert.ok(errs.some(x=>/verifiedAt/.test(x)),JSON.stringify(errs));
  });
});

describe('college-nav getFavorites（本地收藏容错）',()=>{
  const store=(v:string|null)=>({getItem:()=>v});
  it('非法 JSON 不崩，返回空数组',()=>{
    assert.deepEqual(getFavorites(store('not json {{{')),[]);
  });
  it('非数组 JSON 返回空数组',()=>{
    assert.deepEqual(getFavorites(store('{"a":1}')),[]);
  });
  it('空存储返回空数组',()=>{
    assert.deepEqual(getFavorites(store(null)),[]);
  });
  it('只保留字符串 id',()=>{
    assert.deepEqual(getFavorites(store(JSON.stringify(['a',1,null,'b']))),['a','b']);
  });
  it('正常读取 id 数组',()=>{
    assert.deepEqual(getFavorites(store(JSON.stringify(['novip-images','ncss-24365']))),['novip-images','ncss-24365']);
  });
  it('key 常量未改名',()=>{
    assert.equal(NAV_FAVORITES_KEY,'novip-college-nav-favorites-v1');
  });
});
