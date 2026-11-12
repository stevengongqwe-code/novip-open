// NOVIP 小组空闲时间 · 纯逻辑模块（无 DOM / React 依赖，便于单元测试）
// 时间模型：周一至周日 × 08:00–22:00，每 30 分钟一格，共 7×28=196 格。
// 节次换算复用 timetable 的 DEFAULT_PERIODS（常见高校作息），页面明示可点格子微调。
import {DEFAULT_PERIODS,WEEKDAY_LABELS,dayToISO,formatMinutes,parseTime,shanghaiToday,weekdayOfDay} from './timetable-core';

export const SLOT_MINUTES=30;
export const DAY_START_MIN=8*60;
export const DAY_END_MIN=22*60;
export const SLOTS_PER_DAY=(DAY_END_MIN-DAY_START_MIN)/SLOT_MINUTES;
export const TOTAL_SLOTS=7*SLOTS_PER_DAY;
export const MIN_MEMBERS=2;
export const MAX_MEMBERS=8;
export const MAX_ICS_EVENTS=20;
export const MIN_DURATION_OPTIONS=[30,60,90,120] as const;

export interface MemberBusy{name:string;busy:boolean[]}
export interface FreeBlock{day:number;startMin:number;endMin:number;slots:number;freeCount:number}
export interface ParseWarning{line:number;text:string;reason:string}
export interface ParseResult{members:MemberBusy[];warnings:ParseWarning[]}

const WEEKDAY_CHARS=['一','二','三','四','五','六','日'] as const;
const PERIOD_WORDS:Record<string,[number,number]>={'上午':[480,720],'早上':[480,720],'中午':[720,840],'下午':[840,1080],'晚上':[1140,1320],'夜晚':[1140,1320]};

export function slotIndex(day:number,slot:number):number{return day*SLOTS_PER_DAY+slot;}
export function slotStartMin(slot:number):number{return DAY_START_MIN+slot*SLOT_MINUTES;}
export function emptyBusy():boolean[]{return Array.from({length:TOTAL_SLOTS},()=>false);}
export function mondayOfWeek(nowMs:number=Date.now()):string{
  const today=shanghaiToday(nowMs);
  return dayToISO(today-(weekdayOfDay(today)-1));
}
export function describeDuration(minutes:number):string{
  if(minutes<60)return `${minutes}分钟`;
  if(minutes%60===0)return `${minutes/60}小时`;
  return `${Math.floor(minutes/60)}小时${minutes%60}分钟`;
}
export function describeBlock(b:FreeBlock):string{
  return `${WEEKDAY_LABELS[b.day]} ${formatMinutes(b.startMin)}-${formatMinutes(b.endMin)}（${describeDuration(b.endMin-b.startMin)}）`;
}

/** 节次区间换算为分钟区间；节次超出 1–11 返回 null。 */
export function periodToMinutes(startPeriod:number,endPeriod:number):{startMin:number;endMin:number}|null{
  if(!(startPeriod>=1&&endPeriod<=DEFAULT_PERIODS.length&&startPeriod<=endPeriod))return null;
  const a=parseTime(DEFAULT_PERIODS[startPeriod-1].start);
  const b=parseTime(DEFAULT_PERIODS[endPeriod-1].end);
  if(a===null||b===null)return null;
  return {startMin:a,endMin:b};
}

function clampRange(startMin:number,endMin:number):{startMin:number;endMin:number;clamped:boolean}{
  const s=Math.max(startMin,DAY_START_MIN),e=Math.min(endMin,DAY_END_MIN);
  return {startMin:s,endMin:e,clamped:s!==startMin||e!==endMin};
}

function markRange(busy:boolean[],day:number,startMin:number,endMin:number):void{
  const {startMin:s,endMin:e}=clampRange(startMin,endMin);
  if(e<=s)return;
  const from=Math.floor((s-DAY_START_MIN)/SLOT_MINUTES);
  const to=Math.ceil((e-DAY_START_MIN)/SLOT_MINUTES);
  for(let i=Math.max(0,from);i<Math.min(SLOTS_PER_DAY,to);i++)busy[slotIndex(day,i)]=true;
}

/**
 * 解析一段“时间”文本（不含星期）。支持：
 * - 节次：`1-2` / `第1-2节` / `1,2`（单节，调用方已按逗号切分）/ `3`
 * - 时刻：`08:00-09:40` / `8点-10点` / `8点30-10点`
 * - 时段词：上午 / 中午 / 下午 / 晚上
 * - 纯数字区间 `8-10` 按节次解释（页面有说明）；带冒号或“点”按时刻解释。
 * 返回 null 表示无法识别；返回 {clamped:true} 表示被截断到 08:00–22:00。
 */
export function parseTimeSegment(raw:string):{startMin:number;endMin:number;clamped:boolean}|null{
  const s=raw.trim().replace(/节$/,'');
  if(!s)return null;
  const word=PERIOD_WORDS[s];
  if(word)return {startMin:word[0],endMin:word[1],clamped:false};
  const clock=/^(\d{1,2}):(\d{2})\s*[-~～—]\s*(\d{1,2}):(\d{2})/.exec(s);
  if(clock){
    const a=+clock[1]*60+ +clock[2],b=+clock[3]*60+ +clock[4];
    if(b>a)return clampRange(a,b);
    return null;
  }
  const hourWord=/^(\d{1,2})点(\d{1,2})?\s*[-~～—]\s*(\d{1,2})点(\d{1,2})?/.exec(s);
  if(hourWord){
    const a=+hourWord[1]*60+(hourWord[2]?+hourWord[2]:0);
    const b=+hourWord[3]*60+(hourWord[4]?+hourWord[4]:0);
    if(b>a)return clampRange(a,b);
    return null;
  }
  const periodRange=/^第?(\d{1,2})\s*[-~～—]\s*(\d{1,2})$/.exec(s);
  if(periodRange){
    const r=periodToMinutes(+periodRange[1],+periodRange[2]);
    return r?{...r,clamped:false}:null;
  }
  const single=/^第?(\d{1,2})$/.exec(s);
  if(single){
    const r=periodToMinutes(+single[1],+single[1]);
    return r?{...r,clamped:false}:null;
  }
  return null;
}

function weekdayOfToken(token:string):number|null{
  const m=/^(?:周|星期|礼拜)([一二三四五六日天1-7])/.exec(token);
  if(!m)return null;
  const c=m[1];
  if(c==='天')return 6;
  if(/^[1-7]$/.test(c))return +c-1;
  return WEEKDAY_CHARS.indexOf(c as (typeof WEEKDAY_CHARS)[number]);
}

function memberHeaderName(line:string):string|null{
  let m=/^【(.{1,10})】$/.exec(line);
  if(m)return m[1].trim();
  m=/^(?![周星礼])([^：:\s]{1,10})[：:]$/.exec(line);
  if(m)return m[1].trim();
  m=/^(?![周星礼])([^：:\s]{1,10})的课表[：:]?$/.exec(line);
  if(m)return m[1].trim();
  return null;
}

/**
 * 解析粘贴的课表文本。行格式示例：
 *   张三：
 *   周一 1-2 高数
 *   周三 08:00-09:40 英语， 5-6
 *   周五下午
 *   李四 周二 3-4
 * 姓名前缀行（`李四 周二 3-4`）会切换当前成员；课程名写在时间后会被忽略。
 * 无法解析的行计入 warnings，不中断其余行。
 */
export function parseTimetableText(text:string,defaultName='成员1'):ParseResult{
  const lines=text.replace(/\r\n/g,'\n').split('\n');
  const members:MemberBusy[]=[];
  const warnings:ParseWarning[]=[];
  const getMember=(name:string):MemberBusy=>{
    let m=members.find((x)=>x.name===name);
    if(!m){m={name,busy:emptyBusy()};members.push(m);}
    return m;
  };
  let current:MemberBusy|null=null;
  let parsedAny=false;
  lines.forEach((rawLine,idx)=>{
    const line=rawLine.trim();
    if(!line)return;
    const header=memberHeaderName(line);
    if(header){
      if(members.length>=MAX_MEMBERS){warnings.push({line:idx+1,text:line,reason:`成员已达 ${MAX_MEMBERS} 人上限，该成员未加入`});return;}
      current=getMember(header);
      return;
    }
    // 姓名前缀：`张三 周一 1-2` / `张三：周一 1-2`
    const prefixed=/^(?![周星礼])([^：:\s]{1,10})[：:\s]+(.+)$/.exec(line);
    let body=line;
    if(prefixed&&weekdayOfToken(prefixed[2])!==null){
      if(members.length>=MAX_MEMBERS&&!members.some((x)=>x.name===prefixed[1])){
        warnings.push({line:idx+1,text:line,reason:`成员已达 ${MAX_MEMBERS} 人上限，该行未解析`});
        return;
      }
      current=getMember(prefixed[1]);
      body=prefixed[2];
    }
    const day=weekdayOfToken(body);
    if(day===null){
      warnings.push({line:idx+1,text:line,reason:'未找到星期（周一至周日），请写成“周一 1-2”这样的格式'});
      return;
    }
    const rest=body.replace(/^(?:周|星期|礼拜)[一二三四五六日天1-7]/,'').trim();
    if(!rest){
      warnings.push({line:idx+1,text:line,reason:'星期后没有写时间段'});
      return;
    }
    if(!current)current=getMember(defaultName);
    const segments=rest.split(/[,，、;；]/).map((x)=>x.trim()).filter(Boolean);
    let lineOk=false;
    for(const seg of segments){
      // 去掉段尾的课程名：只取开头的“时间”部分（数字/冒号/点/时段词/节/第/-~/—）。
      const head=/^[\d:：点第节\-~～—上下中午晚夜\s]+/.exec(seg);
      const parsed=parseTimeSegment(head?head[0].trim():seg);
      if(!parsed){
        warnings.push({line:idx+1,text:line,reason:`“${seg}”不是可识别的时间段（支持节次如 1-2、时刻如 08:00-09:40、上午/下午/晚上）`});
        continue;
      }
      if(parsed.clamped)warnings.push({line:idx+1,text:line,reason:'时间超出 08:00–22:00 的部分已忽略'});
      markRange(current.busy,day,parsed.startMin,parsed.endMin);
      lineOk=true;
      parsedAny=true;
    }
    if(!lineOk&&segments.length===0)warnings.push({line:idx+1,text:line,reason:'星期后没有写时间段'});
  });
  if(!parsedAny&&members.length===0)warnings.push({line:0,text:'',reason:'未解析到任何时段：请按“周一 1-2”或“周一 08:00-09:40”的格式粘贴'});
  return {members,warnings};
}

/** 每格空闲人数（0–成员数），长度 196。 */
export function freeCounts(members:MemberBusy[]):number[]{
  const counts=Array.from({length:TOTAL_SLOTS},()=>0);
  for(const m of members)for(let i=0;i<TOTAL_SLOTS;i++)if(!m.busy[i])counts[i]++;
  return counts;
}

/** 连续满足掩码的最长块；按长度降序、再按时间先后排序。 */
export function findBlocks(mask:boolean[],minSlots:number,freeCount:number):FreeBlock[]{
  const out:FreeBlock[]=[];
  let runStart=-1;
  const flush=(end:number)=>{
    if(runStart<0)return;
    const len=end-runStart;
    if(len>=minSlots){
      const day=Math.floor(runStart/SLOTS_PER_DAY);
      out.push({day,startMin:slotStartMin(runStart-day*SLOTS_PER_DAY),endMin:slotStartMin(runStart-day*SLOTS_PER_DAY)+len*SLOT_MINUTES,slots:len,freeCount});
    }
    runStart=-1;
  };
  for(let i=0;i<=TOTAL_SLOTS;i++){
    const ok=i<TOTAL_SLOTS&&mask[i];
    // 跨天不连续：每天边界强制断开。
    if(i>0&&i%SLOTS_PER_DAY===0)flush(i);
    if(ok){if(runStart<0)runStart=i;}
    else flush(i);
  }
  return out.sort((a,b)=>b.slots-a.slots||a.day-b.day||a.startMin-b.startMin);
}

export function commonFreeBlocks(members:MemberBusy[],minSlots:number):FreeBlock[]{
  if(members.length<MIN_MEMBERS)return [];
  const counts=freeCounts(members);
  return findBlocks(counts.map((c)=>c===members.length),minSlots,members.length);
}

/** “缺 1 人即可”的次优块：空闲人数恰好 = 总人数 − 1 的最长连续块（不含全员空闲段）。 */
export function nearMissBlocks(members:MemberBusy[],minSlots:number):FreeBlock[]{
  if(members.length<MIN_MEMBERS)return [];
  const counts=freeCounts(members);
  return findBlocks(counts.map((c)=>c===members.length-1),minSlots,members.length-1);
}

export function formatSummary(members:MemberBusy[],blocks:FreeBlock[],nearMiss:FreeBlock[],minMinutes:number):string{
  const lines:string[]=[];
  lines.push(`小组空闲时间（${members.length} 人，最短 ${describeDuration(minMinutes)}）：`);
  if(blocks.length){
    lines.push('全员空闲：');
    blocks.forEach((b,i)=>lines.push(`${i+1}. ${describeBlock(b)}`));
  }else{
    lines.push('本周没有全员空闲的时段。');
    if(nearMiss.length){
      lines.push('缺 1 人即可的时段：');
      nearMiss.slice(0,5).forEach((b,i)=>lines.push(`${i+1}. ${describeBlock(b)}（${b.freeCount}/${members.length} 人空闲）`));
    }
  }
  lines.push('—— 由 NOVIP 小组空闲时间算出，纯本地计算');
  return lines.join('\n');
}

/** 共同空闲块导出为 ICS 日历事件（周一起始日期 + 块偏移，浮动本地时间）。 */
export function buildICS(blocks:FreeBlock[],mondayISO:string,title='小组共同空闲'):string{
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(mondayISO);
  if(!m)throw new Error('周一日期格式应为 YYYY-MM-DD');
  const base=Date.UTC(+m[1],+m[2]-1,+m[3]);
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const lines:string[]=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NOVIP//小组空闲时间//CN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
  ];
  blocks.slice(0,MAX_ICS_EVENTS).forEach((b,i)=>{
    const d=new Date(base+b.day*86_400_000);
    const date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
    const fmt=(min:number)=>`${String(Math.floor(min/60)).padStart(2,'0')}${String(min%60).padStart(2,'0')}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:novip-group-free-time-${i}@novip.site`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${date}T${fmt(b.startMin)}`,
      `DTEND:${date}T${fmt(b.endMin)}`,
      `SUMMARY:${title}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n')+'\r\n';
}

/** 3 人示例：周三下午与周六上午全员空闲，便于直接体验与验收。 */
export function sampleMembers():MemberBusy[]{
  const mk=(name:string,lines:string[]):MemberBusy=>{
    const {members}=parseTimetableText(`${name}：\n${lines.join('\n')}`,name);
    return members[0]??{name,busy:emptyBusy()};
  };
  return [
    mk('小明',['周一 1-2 高数','周一 5-6 英语','周二 1-4 实验','周三 1-2 思政','周四 3-4 体育','周五 1-2 专业课','周五 7-8 讲座']),
    mk('小红',['周一 3-4 线代','周二 1-2 高数','周二 5-6 英语','周三 1-2 思政','周四 1-2 专业课','周四 5-6 实验','周六 9-10 社团']),
    mk('小刚',['周一 1-2 高数','周二 3-4 线代','周三 1-2 思政','周四 1-2 体育','周五 3-4 专业课','周日 晚上']),
  ];
}
