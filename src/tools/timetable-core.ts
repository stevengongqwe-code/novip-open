// NOVIP 大学课程表生成器 · 纯逻辑模块（无 DOM / React 依赖，便于单元测试）
// 日期口径：全部按「民用日期」整数天计算（自 1970-01-01 起的天数），不经过设备时区；
// 时间口径：中国标准时间 Asia/Shanghai（UTC+8，无夏令时）。

export const STORAGE_KEY='novip-timetable-v1';
export const UNDO_KEY='novip-timetable-v1-undo';
export const DATA_VERSION=1;
export const MAX_WEEKS=30;
export const MAX_PERIODS=16;
export const MAX_COURSES=200;
export const TIME_ZONE='Asia/Shanghai';
export const REMINDER_OPTIONS=[0,5,10,15,30] as const;
export type Reminder=typeof REMINDER_OPTIONS[number];
export type WeekRule='all'|'odd'|'even'|'custom';
export type Weekday=1|2|3|4|5|6|7;
export type Period={start:string;end:string};
export type Settings={termStart:string;totalWeeks:number;periods:Period[];reminder:Reminder;showWeekend:'auto'|'always'|'never'};
export type Course={id:string;name:string;teacher:string;room:string;weekday:Weekday;startPeriod:number;endPeriod:number;startWeek:number;endWeek:number;weekRule:WeekRule;customWeeks:number[];color:number};
export type TimetableData={version:typeof DATA_VERSION;settings:Settings;courses:Course[]};
export type Occurrence={week:number;day:number;date:string;start:string;end:string};
export type Conflict={a:Course;b:Course;weeks:number[]};

export const WEEKDAY_LABELS=['周一','周二','周三','周四','周五','周六','周日'] as const;
export const WEEKDAY_SHORT=['一','二','三','四','五','六','日'] as const;
export const RULE_LABELS:Record<WeekRule,string>={all:'每周',odd:'单周',even:'双周',custom:'自定义'};
export const COLOR_COUNT=10;

const DAY_MS=86_400_000;
const SHANGHAI_OFFSET_MS=8*3_600_000;

// ---------- 民用日期 ----------
/** 解析 YYYY-MM-DD 为自 1970-01-01 起的天数；非法日期（如 2026-02-30）返回 null。 */
export function parseISODate(value:string):number|null{
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if(!m)return null;
  const y=+m[1],mo=+m[2],d=+m[3];
  if(y<1970||y>2200||mo<1||mo>12||d<1||d>31)return null;
  const ms=Date.UTC(y,mo-1,d);
  const back=new Date(ms);
  if(back.getUTCFullYear()!==y||back.getUTCMonth()!==mo-1||back.getUTCDate()!==d)return null;
  return Math.round(ms/DAY_MS);
}
const pad=(n:number,len=2)=>String(n).padStart(len,'0');
export function dayToISO(day:number):string{const d=new Date(day*DAY_MS);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;}
/** 周一=1 … 周日=7 */
export function weekdayOfDay(day:number):Weekday{const w=new Date(day*DAY_MS).getUTCDay();return (w===0?7:w) as Weekday;}
export function monthDay(day:number):string{const d=new Date(day*DAY_MS);return `${d.getUTCMonth()+1}/${d.getUTCDate()}`;}
/** 当前时刻在中国标准时间下的民用日期（天数），与设备时区无关。 */
export function shanghaiToday(nowMs:number=Date.now()):number{return Math.floor((nowMs+SHANGHAI_OFFSET_MS)/DAY_MS);}

// ---------- 时间 ----------
export function parseTime(value:string):number|null{
  const m=/^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if(!m)return null;
  const h=+m[1],mi=+m[2];
  if(h>23||mi>59)return null;
  return h*60+mi;
}
export function formatMinutes(total:number):string{return `${pad(Math.floor(total/60))}:${pad(total%60)}`;}

// ---------- 学期 ----------
/** 第 1 周的周一：学期开始日期所在自然周（周一为一周第一天）的周一。 */
export function week1Monday(settings:Pick<Settings,'termStart'>):number|null{
  const start=parseISODate(settings.termStart);
  if(start===null)return null;
  return start-(weekdayOfDay(start)-1);
}
export function dayOf(settings:Pick<Settings,'termStart'>,week:number,weekday:number):number|null{
  const monday=week1Monday(settings);
  return monday===null?null:monday+(week-1)*7+(weekday-1);
}
/** 学期最后一天：第 totalWeeks 周的周日。 */
export function termEndDay(settings:Pick<Settings,'termStart'|'totalWeeks'>):number|null{
  const monday=week1Monday(settings);
  return monday===null?null:monday+settings.totalWeeks*7-1;
}
export type WeekStatus={week:number;status:'before'|'during'|'after'};
/** 根据某一天推算教学周；开学前返回第 1 周（before），学期结束后返回最后一周（after）。 */
export function weekForDay(settings:Pick<Settings,'termStart'|'totalWeeks'>,day:number):WeekStatus{
  const monday=week1Monday(settings);
  const start=parseISODate(settings.termStart);
  if(monday===null||start===null)return {week:1,status:'before'};
  if(day<start)return {week:1,status:'before'};
  const week=Math.floor((day-monday)/7)+1;
  if(week>settings.totalWeeks)return {week:settings.totalWeeks,status:'after'};
  return {week,status:'during'};
}
export function weekRange(settings:Pick<Settings,'termStart'>,week:number):{start:number;end:number}|null{
  const s=dayOf(settings,week,1);
  return s===null?null:{start:s,end:s+6};
}

// ---------- 周次 ----------
/** 课程实际上课的教学周（已排序、去重，并截断到学期总周数内）。 */
export function courseWeeks(course:Pick<Course,'startWeek'|'endWeek'|'weekRule'|'customWeeks'>,totalWeeks:number):number[]{
  if(course.weekRule==='custom')return [...new Set(course.customWeeks)].filter(w=>Number.isInteger(w)&&w>=1&&w<=totalWeeks).sort((a,b)=>a-b);
  const from=Math.max(1,course.startWeek),to=Math.min(totalWeeks,course.endWeek),out:number[]=[];
  for(let w=from;w<=to;w++){if(course.weekRule==='odd'&&w%2===0)continue;if(course.weekRule==='even'&&w%2===1)continue;out.push(w);}
  return out;
}
/** 解析“1-4,6,8-10”“1～8、10”等写法。 */
export function parseWeekList(text:string,totalWeeks:number):{weeks:number[];error?:string}{
  const cleaned=text.replace(/[，、；;\s]+/g,',').replace(/[–—~～至到]/g,'-').replace(/周|第/g,'').replace(/^,|,$/g,'');
  if(!cleaned)return {weeks:[],error:'请至少选择一周。'};
  const set=new Set<number>();
  for(const part of cleaned.split(',')){
    if(!part)continue;
    const m=/^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
    if(!m)return {weeks:[],error:`无法识别“${part}”，请用 1-4,6,8-10 这样的写法。`};
    const a=+m[1],b=m[2]?+m[2]:a;
    if(a>b)return {weeks:[],error:`“${part}”起始周大于结束周。`};
    if(a<1||b>totalWeeks)return {weeks:[],error:`周次需在 1–${totalWeeks} 之间。`};
    for(let w=a;w<=b;w++)set.add(w);
  }
  return {weeks:[...set].sort((x,y)=>x-y)};
}
/** [1,2,3,4,6,8,9,10] → "1-4, 6, 8-10" */
export function formatWeekList(weeks:number[]):string{
  const sorted=[...new Set(weeks)].sort((a,b)=>a-b),parts:string[]=[];
  for(let i=0;i<sorted.length;){let j=i;while(j+1<sorted.length&&sorted[j+1]===sorted[j]+1)j++;parts.push(i===j?String(sorted[i]):`${sorted[i]}-${sorted[j]}`);i=j+1;}
  return parts.join(', ');
}
export function describeWeeks(course:Course,totalWeeks:number):string{
  if(course.weekRule==='custom')return `第 ${formatWeekList(courseWeeks(course,totalWeeks))} 周`;
  const suffix=course.weekRule==='odd'?'（单周）':course.weekRule==='even'?'（双周）':'';
  return `第 ${course.startWeek}-${Math.min(course.endWeek,totalWeeks)} 周${suffix}`;
}

// ---------- 上课时间 ----------
export function courseTime(course:Pick<Course,'startPeriod'|'endPeriod'>,periods:Period[]):{start:string;end:string}|null{
  const a=periods[course.startPeriod-1],b=periods[course.endPeriod-1];
  return a&&b?{start:a.start,end:b.end}:null;
}
/** 课程在本学期的全部上课日期；早于“学期开始日期”的同周课次不计入。 */
export function courseOccurrences(course:Course,settings:Settings):Occurrence[]{
  const start=parseISODate(settings.termStart),time=courseTime(course,settings.periods);
  if(start===null||!time)return [];
  const out:Occurrence[]=[];
  for(const week of courseWeeks(course,settings.totalWeeks)){
    const day=dayOf(settings,week,course.weekday)!;
    if(day<start)continue;
    out.push({week,day,date:dayToISO(day),start:time.start,end:time.end});
  }
  return out;
}
export function coursesInWeek(courses:Course[],settings:Settings,week:number):Course[]{
  const start=parseISODate(settings.termStart);
  return courses.filter(c=>{
    if(!courseWeeks(c,settings.totalWeeks).includes(week))return false;
    const day=dayOf(settings,week,c.weekday);
    return start===null||day===null||day>=start;
  });
}

// ---------- 冲突 ----------
const overlapPeriods=(a:Course,b:Course)=>a.weekday===b.weekday&&a.startPeriod<=b.endPeriod&&b.startPeriod<=a.endPeriod;
export function conflictsBetween(a:Course,b:Course,totalWeeks:number):number[]{
  if(!overlapPeriods(a,b))return [];
  const wb=new Set(courseWeeks(b,totalWeeks));
  return courseWeeks(a,totalWeeks).filter(w=>wb.has(w));
}
export function findConflicts(courses:Course[],totalWeeks:number):Conflict[]{
  const out:Conflict[]=[];
  for(let i=0;i<courses.length;i++)for(let j=i+1;j<courses.length;j++){
    const weeks=conflictsBetween(courses[i],courses[j],totalWeeks);
    if(weeks.length)out.push({a:courses[i],b:courses[j],weeks});
  }
  return out;
}
export function conflictIds(conflicts:Conflict[]):Set<string>{const s=new Set<string>();for(const c of conflicts){s.add(c.a.id);s.add(c.b.id);}return s;}

// ---------- 校验 ----------
export function validatePeriods(periods:Period[]):string|null{
  if(!periods.length)return '至少需要 1 节课的时间。';
  if(periods.length>MAX_PERIODS)return `最多支持 ${MAX_PERIODS} 节。`;
  let prevEnd=-1;
  for(let i=0;i<periods.length;i++){
    const s=parseTime(periods[i].start),e=parseTime(periods[i].end);
    if(s===null||e===null)return `第 ${i+1} 节时间格式应为 HH:MM。`;
    if(e<=s)return `第 ${i+1} 节下课时间需晚于上课时间。`;
    if(s<prevEnd)return `第 ${i+1} 节与第 ${i} 节时间重叠，请按时间先后填写。`;
    prevEnd=e;
  }
  return null;
}
export function validateSettings(settings:Settings):string|null{
  if(parseISODate(settings.termStart)===null)return '请填写有效的学期开始日期。';
  if(!Number.isInteger(settings.totalWeeks)||settings.totalWeeks<1||settings.totalWeeks>MAX_WEEKS)return `教学周数需为 1–${MAX_WEEKS} 的整数。`;
  return validatePeriods(settings.periods);
}
export function validateCourse(course:Course,settings:Settings):string|null{
  if(!course.name.trim())return '请填写课程名称。';
  if(course.name.length>40)return '课程名称最多 40 字。';
  if(course.teacher.length>30||course.room.length>40)return '教师最多 30 字、教室最多 40 字。';
  if(!(course.weekday>=1&&course.weekday<=7))return '请选择星期。';
  const n=settings.periods.length;
  if(!(course.startPeriod>=1&&course.endPeriod<=n&&course.startPeriod<=course.endPeriod))return `节次需在第 1–${n} 节内，且开始节不晚于结束节。`;
  if(course.weekRule!=='custom'&&!(course.startWeek>=1&&course.endWeek<=settings.totalWeeks&&course.startWeek<=course.endWeek))return `周次需在第 1–${settings.totalWeeks} 周内，且起始周不晚于结束周。`;
  if(!courseWeeks(course,settings.totalWeeks).length)return course.weekRule==='custom'?'请至少选择一个上课周。':`第 ${course.startWeek}-${course.endWeek} 周内没有${RULE_LABELS[course.weekRule]}，请调整周次。`;
  return null;
}

// ---------- 默认值 / 工厂 ----------
export const DEFAULT_PERIODS:Period[]=[
  {start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'},{start:'10:00',end:'10:45'},{start:'10:55',end:'11:40'},
  {start:'14:00',end:'14:45'},{start:'14:55',end:'15:40'},{start:'16:00',end:'16:45'},{start:'16:55',end:'17:40'},
  {start:'19:00',end:'19:45'},{start:'19:55',end:'20:40'},{start:'20:50',end:'21:35'},
];
/** 按“第一节开始时间 + 每节分钟 + 课间分钟”快速生成节次（不跨越午休，仅用于起草，生成后可逐节修改）。 */
export function generatePeriods(count:number,firstStart:string,lessonMinutes:number,breakMinutes:number):Period[]{
  const s0=parseTime(firstStart)??480,out:Period[]=[];let t=s0;
  for(let i=0;i<count&&t+lessonMinutes<24*60;i++){out.push({start:formatMinutes(t),end:formatMinutes(t+lessonMinutes)});t+=lessonMinutes+breakMinutes;}
  return out;
}
/** 默认学期开始日期：今天（上海）所在周的周一。 */
export function defaultTermStart(nowMs:number=Date.now()):string{const today=shanghaiToday(nowMs);return dayToISO(today-(weekdayOfDay(today)-1));}
export function defaultSettings(nowMs:number=Date.now()):Settings{return {termStart:defaultTermStart(nowMs),totalWeeks:18,periods:DEFAULT_PERIODS.map(p=>({...p})),reminder:15,showWeekend:'auto'};}
export function emptyData(nowMs:number=Date.now()):TimetableData{return {version:DATA_VERSION,settings:defaultSettings(nowMs),courses:[]};}
export function newId():string{
  const c=(globalThis as {crypto?:Crypto}).crypto;
  if(c&&typeof c.randomUUID==='function')return c.randomUUID();
  return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
export function colorForName(name:string):number{let h=0;for(const ch of name.trim())h=(h*31+(ch.codePointAt(0)??0))>>>0;return h%COLOR_COUNT;}
export function blankCourse(settings:Settings,partial:Partial<Course>={}):Course{
  return {id:newId(),name:'',teacher:'',room:'',weekday:1,startPeriod:1,endPeriod:Math.min(2,settings.periods.length),startWeek:1,endWeek:settings.totalWeeks,weekRule:'all',customWeeks:[],color:0,...partial};
}
export function sampleCourses(settings:Settings):Course[]{
  const w=settings.totalWeeks,mk=(p:Partial<Course>)=>{const c=blankCourse(settings,p);return {...c,color:colorForName(c.name)};};
  const last=Math.min(settings.periods.length,11);
  return [
    mk({name:'高等数学 A',teacher:'王老师',room:'教一 201',weekday:1,startPeriod:1,endPeriod:2,startWeek:1,endWeek:w}),
    mk({name:'高等数学 A',teacher:'王老师',room:'教一 201',weekday:3,startPeriod:3,endPeriod:4,startWeek:1,endWeek:w}),
    mk({name:'大学英语',teacher:'李老师',room:'外语楼 305',weekday:2,startPeriod:1,endPeriod:2,startWeek:1,endWeek:Math.min(16,w)}),
    mk({name:'线性代数',teacher:'张老师',room:'教二 108',weekday:2,startPeriod:5,endPeriod:6,startWeek:1,endWeek:w,weekRule:'odd'}),
    mk({name:'大学物理实验',teacher:'赵老师',room:'实验楼 B204',weekday:4,startPeriod:5,endPeriod:7,startWeek:2,endWeek:w,weekRule:'even'}),
    mk({name:'程序设计基础',teacher:'陈老师',room:'机房 3',weekday:5,startPeriod:3,endPeriod:4,startWeek:1,endWeek:w,weekRule:'custom',customWeeks:[1,2,3,4,6,8,9,10].filter(x=>x<=w)}),
    mk({name:'形势与政策',teacher:'刘老师',room:'报告厅',weekday:4,startPeriod:Math.min(9,last),endPeriod:Math.min(10,last),startWeek:3,endWeek:Math.min(6,w)}),
  ];
}

// ---------- 存储 / 导入导出（严格清洗外部数据） ----------
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';
const int=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)?v:NaN;
export type NormalizeResult={ok:true;data:TimetableData;dropped:number}|{ok:false;error:string};
/** 校验并清洗来自 localStorage 或备份文件的数据。非法课程会被丢弃并计数，设置非法则整体拒绝。 */
export function normalizeData(raw:unknown):NormalizeResult{
  if(!isObj(raw))return {ok:false,error:'文件内容不是 NOVIP 课程表备份。'};
  if(raw.version!==DATA_VERSION)return {ok:false,error:`不支持的备份版本：${String(raw.version)}。`};
  const s=raw.settings;
  if(!isObj(s)||!Array.isArray(s.periods))return {ok:false,error:'备份缺少学期设置。'};
  const settings:Settings={
    termStart:str(s.termStart,10),
    totalWeeks:int(s.totalWeeks),
    periods:s.periods.slice(0,MAX_PERIODS+1).map(p=>{
      if(!isObj(p))return {start:'',end:''};
      const ps=parseTime(str(p.start,5)),pe=parseTime(str(p.end,5));
      return {start:ps!==null?formatMinutes(ps):str(p.start,5),end:pe!==null?formatMinutes(pe):str(p.end,5)};
    }),
    reminder:(REMINDER_OPTIONS as readonly number[]).includes(s.reminder as number)?s.reminder as Reminder:15,
    showWeekend:s.showWeekend==='always'||s.showWeekend==='never'?s.showWeekend:'auto',
  };
  const settingsError=validateSettings(settings);
  if(settingsError)return {ok:false,error:`学期设置有误：${settingsError}`};
  if(!Array.isArray(raw.courses))return {ok:false,error:'备份缺少课程列表。'};
  const courses:Course[]=[],seen=new Set<string>();let dropped=0;
  for(const c of raw.courses.slice(0,MAX_COURSES)){
    if(!isObj(c)){dropped++;continue;}
    const rule:WeekRule=c.weekRule==='odd'||c.weekRule==='even'||c.weekRule==='custom'?c.weekRule:'all';
    let id=str(c.id,64).replace(/[^\w-]/g,'');
    if(!id||seen.has(id))id=newId();
    const course:Course={
      id,name:str(c.name,40).trim(),teacher:str(c.teacher,30).trim(),room:str(c.room,40).trim(),
      weekday:int(c.weekday) as Weekday,startPeriod:int(c.startPeriod),endPeriod:int(c.endPeriod),
      startWeek:int(c.startWeek),endWeek:int(c.endWeek),weekRule:rule,
      customWeeks:Array.isArray(c.customWeeks)?c.customWeeks.map(int).filter(n=>Number.isInteger(n)):[],
      color:Number.isInteger(c.color)&&(c.color as number)>=0&&(c.color as number)<COLOR_COUNT?c.color as number:0,
    };
    if(rule==='custom'){course.startWeek=1;course.endWeek=settings.totalWeeks;}
    if(validateCourse(course,settings)){dropped++;continue;}
    seen.add(id);courses.push(course);
  }
  dropped+=Math.max(0,raw.courses.length-MAX_COURSES);
  return {ok:true,data:{version:DATA_VERSION,settings,courses},dropped};
}
export function serialize(data:TimetableData):string{return JSON.stringify(data,null,2);}
export type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type LoadResult={data:TimetableData;source:'saved'|'new';warning?:string};
export function loadFromStorage(storage:StorageLike|null,nowMs:number=Date.now()):LoadResult{
  if(!storage)return {data:emptyData(nowMs),source:'new',warning:'当前浏览器禁止本地存储（可能是无痕模式），课表关闭页面后不会保留，请及时导出备份。'};
  let text:string|null=null;
  try{text=storage.getItem(STORAGE_KEY);}catch{return {data:emptyData(nowMs),source:'new',warning:'无法读取本地存储，课表关闭页面后可能不会保留，请及时导出备份。'};}
  if(!text)return {data:emptyData(nowMs),source:'new'};
  try{
    const r=normalizeData(JSON.parse(text));
    if(!r.ok)return {data:emptyData(nowMs),source:'new',warning:`本地课表数据损坏，未能恢复（${r.error}）。原数据未被删除，编辑后才会覆盖。`};
    return {data:r.data,source:'saved',warning:r.dropped?`有 ${r.dropped} 门课程数据不完整，已跳过。`:undefined};
  }catch{return {data:emptyData(nowMs),source:'new',warning:'本地课表数据损坏，未能恢复。原数据未被删除，编辑后才会覆盖。'};}
}
export function saveToStorage(storage:StorageLike|null,data:TimetableData):string|null{
  if(!storage)return '浏览器禁止本地存储，无法自动保存。';
  try{storage.setItem(STORAGE_KEY,JSON.stringify(data));return null;}
  catch{return '自动保存失败（存储空间不足或被浏览器禁止），请导出备份。';}
}

// ---------- ICS (RFC 5545) ----------
export function escapeICSText(value:string):string{return value.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r\n|\r|\n/g,'\\n');}
const encoder=new TextEncoder();
/** 按 RFC 5545 §3.1 折行：每行不超过 75 个八位字节，不截断 UTF-8 多字节字符。 */
export function foldLine(line:string):string{
  if(encoder.encode(line).length<=75)return line;
  const parts:string[]=[];let current='',bytes=0,limit=75;
  for(const ch of line){
    const b=encoder.encode(ch).length;
    if(bytes+b>limit){parts.push(current);current='';bytes=0;limit=74;}
    current+=ch;bytes+=b;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
const icsDate=(day:number)=>dayToISO(day).replace(/-/g,'');
const icsLocal=(day:number,time:string)=>{const m=parseTime(time)??0;return `${icsDate(day)}T${formatMinutes(m).replace(':','')}00`;};
const icsUTC=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
/** 把周次切成“等间隔”的连续段，每段输出一个带 RRULE 的 VEVENT，保证每次课只出现一次。 */
export function splitRuns(weeks:number[]):{first:number;step:number;count:number}[]{
  const runs:{first:number;step:number;count:number}[]=[];
  for(let i=0;i<weeks.length;){
    if(i===weeks.length-1){runs.push({first:weeks[i],step:1,count:1});break;}
    const step=weeks[i+1]-weeks[i];let j=i+1;
    while(j+1<weeks.length&&weeks[j+1]-weeks[j]===step)j++;
    runs.push({first:weeks[i],step,count:j-i+1});i=j+1;
  }
  return runs;
}
export type ICSOptions={nowMs?:number;reminder?:Reminder;calendarName?:string};
export function buildICS(data:TimetableData,options:ICSOptions={}):{text:string;events:number;occurrences:number}{
  const {settings}=data,nowMs=options.nowMs??Date.now(),reminder=options.reminder??settings.reminder;
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NOVIP//Course Timetable 1.0//ZH-CN','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(options.calendarName??'课程表（NOVIP）')}`,`X-WR-TIMEZONE:${TIME_ZONE}`,
    'BEGIN:VTIMEZONE',`TZID:${TIME_ZONE}`,'X-LIC-LOCATION:Asia/Shanghai','BEGIN:STANDARD','TZOFFSETFROM:+0800','TZOFFSETTO:+0800','TZNAME:CST','DTSTART:19700101T000000','END:STANDARD','END:VTIMEZONE'];
  const stamp=icsUTC(nowMs);let events=0,occurrences=0;
  for(const course of data.courses){
    const occ=courseOccurrences(course,settings);
    if(!occ.length)continue;
    const byWeek=new Map(occ.map(o=>[o.week,o]));
    for(const run of splitRuns(occ.map(o=>o.week))){
      const first=byWeek.get(run.first)!;
      const desc=[course.teacher&&`教师：${course.teacher}`,`节次：${WEEKDAY_LABELS[course.weekday-1]} 第 ${course.startPeriod}${course.endPeriod>course.startPeriod?`-${course.endPeriod}`:''} 节`,`周次：${describeWeeks(course,settings.totalWeeks)}`,'由 NOVIP 课程表生成 https://novip.site/tools/timetable'].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT',`UID:${course.id}-w${run.first}@novip.site`,`DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TIME_ZONE}:${icsLocal(first.day,first.start)}`,`DTEND;TZID=${TIME_ZONE}:${icsLocal(first.day,first.end)}`);
      if(run.count>1)lines.push(`RRULE:FREQ=WEEKLY;INTERVAL=${run.step};COUNT=${run.count}`);
      lines.push(`SUMMARY:${escapeICSText(course.name)}`);
      if(course.room)lines.push(`LOCATION:${escapeICSText(course.room)}`);
      lines.push(`DESCRIPTION:${escapeICSText(desc)}`,'TRANSP:OPAQUE','STATUS:CONFIRMED');
      if(reminder>0)lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeICSText(`${course.name}${course.room?` @ ${course.room}`:''} ${reminder} 分钟后上课`)}`,`TRIGGER:-PT${reminder}M`,'END:VALARM');
      lines.push('END:VEVENT');
      events++;occurrences+=run.count;
    }
  }
  lines.push('END:VCALENDAR');
  return {text:lines.map(foldLine).join('\r\n')+'\r\n',events,occurrences};
}
/** 是否需要显示周末列 */
export function shouldShowWeekend(data:TimetableData):boolean{
  if(data.settings.showWeekend==='always')return true;
  if(data.settings.showWeekend==='never')return false;
  return data.courses.some(c=>c.weekday>=6);
}
