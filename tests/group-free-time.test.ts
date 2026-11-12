// 小组空闲时间 · 核心逻辑单元测试
// 运行：node --import tsx --test tests/group-free-time.test.ts
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_START_MIN,MAX_ICS_EVENTS,SLOTS_PER_DAY,TOTAL_SLOTS,
  buildICS,commonFreeBlocks,describeBlock,describeDuration,emptyBusy,findBlocks,formatSummary,freeCounts,
  mondayOfWeek,nearMissBlocks,parseTimeSegment,parseTimetableText,sampleMembers,slotIndex,
} from '../src/tools/group-free-time-core.ts';

describe('时间格模型',()=>{
  it('一周 196 格：7 天 × 28 格（08:00–22:00，每 30 分钟）',()=>{
    assert.equal(SLOTS_PER_DAY,28);
    assert.equal(TOTAL_SLOTS,196);
    assert.equal(slotIndex(2,0),56);
  });
  it('本周一：2026-11-10（周二）所在周的周一是 2026-11-09',()=>{
    assert.equal(mondayOfWeek(Date.UTC(2026,10,10,0,0,0)),'2026-11-09');
    assert.equal(mondayOfWeek(Date.UTC(2026,10,9,0,0,0)),'2026-11-09');
    assert.equal(mondayOfWeek(Date.UTC(2026,10,15,0,0,0)),'2026-11-09');
  });
  it('时长文案：30 分钟 / 1 小时 / 2 小时 / 1 小时 30 分钟',()=>{
    assert.equal(describeDuration(30),'30分钟');
    assert.equal(describeDuration(60),'1小时');
    assert.equal(describeDuration(120),'2小时');
    assert.equal(describeDuration(90),'1小时30分钟');
  });
});

describe('parseTimeSegment',()=>{
  it('节次区间：1-2 → 08:00–09:40',()=>{
    assert.deepEqual(parseTimeSegment('1-2'),{startMin:480,endMin:580,clamped:false});
  });
  it('节次写法：第 3-4 节 → 10:00–11:40；单节 5 → 14:00–14:45',()=>{
    assert.deepEqual(parseTimeSegment('第3-4节'),{startMin:600,endMin:700,clamped:false});
    assert.deepEqual(parseTimeSegment('5'),{startMin:840,endMin:885,clamped:false});
  });
  it('时刻区间：08:00-09:40 与 8 点-10 点',()=>{
    assert.deepEqual(parseTimeSegment('08:00-09:40'),{startMin:480,endMin:580,clamped:false});
    assert.deepEqual(parseTimeSegment('8点-10点'),{startMin:480,endMin:600,clamped:false});
    assert.deepEqual(parseTimeSegment('8点30-10点'),{startMin:510,endMin:600,clamped:false});
  });
  it('时段词：上午 / 中午 / 下午 / 晚上',()=>{
    assert.deepEqual(parseTimeSegment('上午'),{startMin:480,endMin:720,clamped:false});
    assert.deepEqual(parseTimeSegment('中午'),{startMin:720,endMin:840,clamped:false});
    assert.deepEqual(parseTimeSegment('下午'),{startMin:840,endMin:1080,clamped:false});
    assert.deepEqual(parseTimeSegment('晚上'),{startMin:1140,endMin:1320,clamped:false});
  });
  it('无法识别：abc / 空串 / 结束早于开始',()=>{
    assert.equal(parseTimeSegment('abc'),null);
    assert.equal(parseTimeSegment(''),null);
    assert.equal(parseTimeSegment('10:00-08:00'),null);
  });
  it('节次超限：12-13 节返回 null',()=>{
    assert.equal(parseTimeSegment('12-13'),null);
    assert.equal(parseTimeSegment('13'),null);
  });
  it('超界截断：07:00-09:00 截断到 08:00 起并标记 clamped',()=>{
    assert.deepEqual(parseTimeSegment('07:00-09:00'),{startMin:480,endMin:540,clamped:true});
    assert.deepEqual(parseTimeSegment('21:00-23:00'),{startMin:1260,endMin:1320,clamped:true});
  });
});

describe('parseTimetableText',()=>{
  it('成员标题 + 节次 + 时刻 + 时段词混合解析',()=>{
    const {members,warnings}=parseTimetableText('张三：\n周一 1-2 高数\n周三 08:00-09:40 英语\n周五下午');
    assert.equal(warnings.length,0);
    assert.equal(members.length,1);
    assert.equal(members[0].name,'张三');
    const b=members[0].busy;
    assert.equal(b[slotIndex(0,0)],true); // 周一 08:00
    assert.equal(b[slotIndex(0,2)],true); // 周一 09:00（第 2 节 08:55–09:40）
    assert.equal(b[slotIndex(0,4)],false); // 周一 10:00 空闲
    assert.equal(b[slotIndex(2,0)],true); // 周三 08:00
    assert.equal(b[slotIndex(4,12)],true); // 周五 14:00（下午）
    assert.equal(b[slotIndex(4,20)],false); // 周五 18:00 空闲
  });
  it('姓名前缀行自动归属成员并切换当前成员',()=>{
    const {members,warnings}=parseTimetableText('张三 周一 1-2\n李四 周二 3-4\n周三 1-2');
    assert.equal(warnings.length,0);
    assert.equal(members.length,2);
    assert.equal(members[1].name,'李四');
    assert.equal(members[1].busy[slotIndex(1,4)],true); // 周二第 3 节 10:00
    assert.equal(members[1].busy[slotIndex(2,0)],true); // 随后无姓名的行归李四
  });
  it('【姓名】标题与“姓名的课表”标题',()=>{
    const {members}=parseTimetableText('【小明】\n周一 1-2\n小红的课表\n周二 1-2');
    assert.deepEqual(members.map((m)=>m.name),['小明','小红']);
  });
  it('同行多段：周一 1-2, 5-6',()=>{
    const {members,warnings}=parseTimetableText('周一 1-2, 5-6');
    assert.equal(warnings.length,0);
    const b=members[0].busy;
    assert.equal(b[slotIndex(0,0)],true);
    assert.equal(b[slotIndex(0,12)],true); // 第 5 节 14:00（slot 12）
    assert.equal(b[slotIndex(0,4)],false); // 第 3 节空闲
  });
  it('无法解析的行计入警告、不中断其余行',()=>{
    const {members,warnings}=parseTimetableText('周一 1-2\n明天有空吗\n周二 3-4\n周三 火星时间');
    assert.equal(members[0].busy[slotIndex(0,0)],true);
    assert.equal(members[0].busy[slotIndex(1,4)],true);
    assert.equal(warnings.length,2);
    assert.match(warnings[0].reason,/星期/);
  });
  it('空文本：无成员 + 一条总警告',()=>{
    const {members,warnings}=parseTimetableText('   \n\n');
    assert.equal(members.length,0);
    assert.equal(warnings.length,1);
  });
  it('成员上限 8 人：第 9 人警告并跳过',()=>{
    const text=Array.from({length:9},(_,i)=>`成员${i+1}：\n周一 1-2`).join('\n');
    const {members,warnings}=parseTimetableText(text);
    assert.equal(members.length,8);
    assert.ok(warnings.some((w)=>w.reason.includes('8 人上限')));
  });
  it('节次与时刻混用、课程名含数字不干扰：周一 1-2 高数 101',()=>{
    const {members,warnings}=parseTimetableText('周一 1-2 高数101\n周二 14:00-15:40 线代 3-101');
    assert.equal(warnings.length,0);
    assert.equal(members[0].busy[slotIndex(0,0)],true);
    assert.equal(members[0].busy[slotIndex(1,12)],true); // 周二 14:00
  });
});

describe('交集与推荐',()=>{
  const two=()=>{
    const a={name:'A',busy:emptyBusy()};
    const b={name:'B',busy:emptyBusy()};
    // A：周一 08:00–10:00 忙；B：周一 09:00–11:00 忙 → 共同空闲从 11:00 起
    for(let i=0;i<4;i++)a.busy[slotIndex(0,i)]=true;
    for(let i=2;i<6;i++)b.busy[slotIndex(0,i)]=true;
    return [a,b];
  };
  it('共同空闲块：周一 11:00–22:00 是最长块，排第一',()=>{
    const blocks=commonFreeBlocks(two(),2);
    // 最长的是整天空闲的周二（28 格），周一的块 11:00–22:00（22 格）排在其后
    assert.equal(blocks[0].day,1);
    assert.equal(blocks[0].slots,28);
    const mon=blocks.find((b)=>b.day===0);
    assert.ok(mon);
    assert.equal(mon.startMin,660);
    assert.equal(mon.endMin,1320);
    assert.equal(mon.freeCount,2);
  });
  it('最短时长过滤：minSlots=4 时 30 分钟的碎片不出现',()=>{
    const a={name:'A',busy:emptyBusy()};
    const b={name:'B',busy:emptyBusy()};
    // 仅周二 10:00–10:30 全员空闲（其余全忙）
    for(let i=0;i<TOTAL_SLOTS;i++){a.busy[i]=true;b.busy[i]=true;}
    a.busy[slotIndex(1,4)]=false;b.busy[slotIndex(1,4)]=false;
    assert.equal(commonFreeBlocks([a,b],1).length,1);
    assert.equal(commonFreeBlocks([a,b],4).length,0);
  });
  it('少于 2 人不计算',()=>{
    assert.deepEqual(commonFreeBlocks([{name:'A',busy:emptyBusy()}],2),[]);
  });
  it('排序：最长优先，同长度按时间先后',()=>{
    const counts=Array.from({length:TOTAL_SLOTS},()=>2);
    // 造两段全员空闲：周一 08:00–09:00（2 格）与周二 08:00–10:00（4 格）
    const mask=Array.from({length:TOTAL_SLOTS},()=>false);
    mask[slotIndex(0,0)]=true;mask[slotIndex(0,1)]=true;
    for(let i=0;i<4;i++)mask[slotIndex(1,i)]=true;
    const blocks=findBlocks(mask,2,2);
    assert.equal(blocks[0].day,1);
    assert.equal(blocks[0].slots,4);
    assert.equal(blocks[1].day,0);
    assert.equal(blocks[1].slots,2);
  });
  it('跨天不连续：周日末格与周一首格不连成一块',()=>{
    const mask=Array.from({length:TOTAL_SLOTS},()=>false);
    mask[slotIndex(6,27)]=true;mask[slotIndex(0,0)]=true;
    const blocks=findBlocks(mask,1,2);
    assert.equal(blocks.length,2);
  });
  it('freeCounts：两人都忙的格为 0、一人忙为 1、都闲为 2',()=>{
    const counts=freeCounts(two());
    assert.equal(counts[slotIndex(0,0)],1); // 仅 A 忙（08:00–10:00），B 从 09:00 才忙
    assert.equal(counts[slotIndex(0,2)],0); // 09:00 两人都忙
    assert.equal(counts[slotIndex(0,4)],1);
    assert.equal(counts[slotIndex(0,6)],2);
  });
  it('次优块：无全员空闲时给出恰好缺 1 人的块',()=>{
    const a={name:'A',busy:emptyBusy()};
    const b={name:'B',busy:emptyBusy()};
    const c={name:'C',busy:emptyBusy()};
    for(let i=0;i<TOTAL_SLOTS;i++){a.busy[i]=true;b.busy[i]=true;c.busy[i]=true;}
    // 周三 14:00–16:00：A、B 空闲，C 忙
    for(let i=12;i<16;i++){a.busy[slotIndex(2,i)]=false;b.busy[slotIndex(2,i)]=false;}
    assert.equal(commonFreeBlocks([a,b,c],2).length,0);
    const near=nearMissBlocks([a,b,c],2);
    assert.equal(near.length,1);
    assert.equal(near[0].day,2);
    assert.equal(near[0].startMin,840);
    assert.equal(near[0].endMin,960);
  });
  it('示例数据：3 人在周三 10:00 后有共同空闲',()=>{
    const s=sampleMembers();
    assert.equal(s.length,3);
    const blocks=commonFreeBlocks(s,2);
    assert.ok(blocks.length>0);
    assert.ok(blocks.every((b)=>b.freeCount===3));
  });
});

describe('导出与文案',()=>{
  it('describeBlock：周三 14:00-16:00（2小时）',()=>{
    assert.equal(describeBlock({day:2,startMin:840,endMin:960,slots:4,freeCount:2}),'周三 14:00-16:00（2小时）');
  });
  it('formatSummary：有共同空闲时列出块；无时给次优',()=>{
    const s=sampleMembers();
    const blocks=commonFreeBlocks(s,2);
    const text=formatSummary(s,blocks,[],60);
    assert.match(text,/3 人/);
    assert.match(text,/全员空闲/);
    assert.match(text,/周三/);
    const empty=formatSummary(s,[],[{day:2,startMin:840,endMin:960,slots:4,freeCount:2}],60);
    assert.match(empty,/没有全员空闲/);
    assert.match(empty,/缺 1 人即可/);
  });
  it('buildICS：含 VEVENT、DTSTART 为所选周一 + 偏移、浮动本地时间',()=>{
    const ics=buildICS([{day:2,startMin:840,endMin:960,slots:4,freeCount:2}],'2026-11-09');
    assert.match(ics,/BEGIN:VCALENDAR/);
    assert.match(ics,/DTSTART:20261111T140000/);
    assert.match(ics,/DTEND:20261111T160000/);
    assert.match(ics,/SUMMARY:小组共同空闲/);
    assert.match(ics,/END:VCALENDAR/);
  });
  it('buildICS：非法日期抛错；事件数上限 20',()=>{
    assert.throws(()=>buildICS([{day:0,startMin:480,endMin:510,slots:1,freeCount:2}],'2026/11/09'),/YYYY-MM-DD/);
    const many=Array.from({length:25},(_,i)=>({day:i%7,startMin:480+(i%7)*60,endMin:510+(i%7)*60,slots:1,freeCount:2}));
    const ics=buildICS(many,'2026-11-09');
    assert.equal((ics.match(/BEGIN:VEVENT/g)??[]).length,MAX_ICS_EVENTS);
  });
});
