/** NOVIP 独立实现：Unix 时间戳 ↔ 日期时间的纯函数核心；不访问网络，不依赖运行环境时区。 */
export type TimeZoneChoice='Asia/Shanghai'|'UTC';
export type TimestampUnit='auto'|'s'|'ms';
export const MAX_ABS_EPOCH_MS=8_640_000_000_000_000;
export const MAX_ABS_SECONDS=8_640_000_000_000;
const SHANGHAI_OFFSET_MS=8*60*60*1000;
export const TIME_ZONE_LABELS:Record<TimeZoneChoice,string>={
  'Asia/Shanghai':'中国标准时间（Asia/Shanghai，UTC+8）',
  UTC:'协调世界时（UTC）',
};
export interface ParsedTimestamp{
  input:string;
  unit:'s'|'ms';
  digits:number;
  epochMs:number;
  seconds:number;
  milliseconds:number;
}
export interface TimeDisplay{
  epochMs:number;
  seconds:number;
  milliseconds:number;
  timeZone:TimeZoneChoice;
  offsetLabel:string;
  date:string;
  time:string;
  dateTime:string;
  weekday:string;
  iso8601:string;
  utcDateTime:string;
  utcIso:string;
}
export interface TimestampConversion{parsed:ParsedTimestamp;display:TimeDisplay;}
export interface DateTimeToTimestampResult{
  input:string;
  normalized:string;
  timeZone:TimeZoneChoice;
  epochMs:number;
  seconds:number;
  milliseconds:number;
  display:TimeDisplay;
}
export interface CurrentTimestamp{
  epochMs:number;
  seconds:number;
  milliseconds:number;
  dateTime:string;
  weekday:string;
  shanghaiDateTime:string;
  utcDateTime:string;
}
const RANGE_ERROR='时间戳超出可表示范围（约公元 275760 年以内）。';
const WEEKDAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
function pad(value:number,length=2){return String(value).padStart(length,'0');}
function yearText(year:number){return year>=0?pad(year,4):'-'+pad(-year,4);}
function offsetFor(timeZone:TimeZoneChoice){return timeZone==='Asia/Shanghai'?SHANGHAI_OFFSET_MS:0;}
function partsAtOffset(epochMs:number,offsetMs:number){
  if(!Number.isFinite(epochMs)||Math.abs(epochMs)>MAX_ABS_EPOCH_MS-offsetMs)throw new Error(RANGE_ERROR);
  const shifted=new Date(epochMs+offsetMs);
  if(Number.isNaN(shifted.getTime()))throw new Error(RANGE_ERROR);
  return {
    year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate(),
    hour:shifted.getUTCHours(),minute:shifted.getUTCMinutes(),second:shifted.getUTCSeconds(),
    millisecond:shifted.getUTCMilliseconds(),weekday:WEEKDAYS[shifted.getUTCDay()],
  };
}
function isoAtOffset(epochMs:number,offsetMs:number){
  const parts=partsAtOffset(epochMs,offsetMs);
  const base=`${yearText(parts.year)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond,3)}`;
  if(offsetMs===0)return base+'Z';
  const sign=offsetMs>=0?'+':'-';
  const absolute=Math.abs(offsetMs);
  return `${base}${sign}${pad(Math.floor(absolute/3600000))}:${pad(Math.floor(absolute%3600000/60000))}`;
}
function displayFor(epochMs:number,timeZone:TimeZoneChoice):TimeDisplay{
  if(!Number.isFinite(epochMs))throw new Error('时间戳数值无效。');
  if(Math.abs(epochMs)>MAX_ABS_EPOCH_MS)throw new Error(RANGE_ERROR);
  const offset=offsetFor(timeZone);
  const parts=partsAtOffset(epochMs,offset);
  const date=`${yearText(parts.year)}-${pad(parts.month)}-${pad(parts.day)}`;
  const time=`${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
  const utc=partsAtOffset(epochMs,0);
  return {
    epochMs,
    seconds:Math.trunc(epochMs/1000),
    milliseconds:epochMs,
    timeZone,
    offsetLabel:timeZone==='Asia/Shanghai'?'UTC+08:00':'UTC',
    date,
    time,
    dateTime:`${date} ${time}`,
    weekday:parts.weekday,
    iso8601:isoAtOffset(epochMs,offset),
    utcDateTime:`${yearText(utc.year)}-${pad(utc.month)}-${pad(utc.day)} ${pad(utc.hour)}:${pad(utc.minute)}:${pad(utc.second)}`,
    utcIso:new Date(epochMs).toISOString(),
  };
}
export function parseTimestampInput(raw:string,unit:TimestampUnit='auto'):ParsedTimestamp{
  const text=raw.trim();
  if(!text)throw new Error('请先输入时间戳。');
  const match=/^(-?)(\d+)$/.exec(text);
  if(!match)throw new Error('时间戳必须是整数（可带负号），例如 1700000000 或 1700000000000。');
  const digits=match[2].length;
  if(digits>16)throw new Error('时间戳位数过多，请提供 10 位秒级或 13 位毫秒级时间戳。');
  let resolved:'s'|'ms';
  if(unit==='s'||unit==='ms')resolved=unit;
  else if(digits<=10)resolved='s';
  else if(digits===13)resolved='ms';
  else throw new Error('无法按位数识别时间戳：自动识别支持 1–10 位秒级或 13 位毫秒级，也可手动选择单位。');
  const magnitude=Number(match[2]);
  const value=match[1]? -magnitude:magnitude;
  if(resolved==='s'){
    if(Math.abs(value)>MAX_ABS_SECONDS)throw new Error(RANGE_ERROR);
  }else if(Math.abs(value)>MAX_ABS_EPOCH_MS)throw new Error(RANGE_ERROR);
  const epochMs=resolved==='s'?value*1000:value;
  return {input:text,unit:resolved,digits,epochMs,seconds:Math.trunc(epochMs/1000),milliseconds:epochMs};
}
export function formatTimestamp(epochMs:number,timeZone:TimeZoneChoice='Asia/Shanghai'):TimeDisplay{
  return displayFor(epochMs,timeZone);
}
export function timestampToDisplay(raw:string,unit:TimestampUnit='auto',timeZone:TimeZoneChoice='Asia/Shanghai'):TimestampConversion{
  const parsed=parseTimestampInput(raw,unit);
  return {parsed,display:displayFor(parsed.epochMs,timeZone)};
}
export function convertTimestampValue(raw:string,unit:TimestampUnit='auto'):TimestampConversion{
  return timestampToDisplay(raw,unit,'Asia/Shanghai');
}
export function millisecondsToSeconds(milliseconds:number){
  if(!Number.isFinite(milliseconds))throw new Error('毫秒时间戳数值无效。');
  if(Math.abs(milliseconds)>MAX_ABS_EPOCH_MS)throw new Error(RANGE_ERROR);
  return Math.trunc(milliseconds/1000);
}
export function secondsToMilliseconds(seconds:number){
  if(!Number.isFinite(seconds))throw new Error('秒级时间戳数值无效。');
  if(Math.abs(seconds)>MAX_ABS_SECONDS)throw new Error(RANGE_ERROR);
  return Math.round(seconds*1000);
}
export function currentTimestamp(now:number=Date.now()):CurrentTimestamp{
  const display=displayFor(now,'Asia/Shanghai');
  return {
    epochMs:now,
    seconds:display.seconds,
    milliseconds:display.milliseconds,
    dateTime:display.dateTime,
    weekday:display.weekday,
    shanghaiDateTime:display.dateTime,
    utcDateTime:display.utcDateTime,
  };
}
const DATE_TIME_PATTERN=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
function daysInMonth(year:number,month:number){
  if(month===2)return (year%4===0&&year%100!==0)||year%400===0?29:28;
  return [31,28,31,30,31,30,31,31,30,31,30,31][month-1];
}
export function parseDateTimeInput(raw:string,timeZone:TimeZoneChoice='Asia/Shanghai'):DateTimeToTimestampResult{
  const text=raw.trim();
  if(!text)throw new Error('请先输入日期时间，例如 2026-10-24 21:30:00。');
  const match=DATE_TIME_PATTERN.exec(text);
  if(!match)throw new Error('日期时间格式不正确：请使用 YYYY-MM-DD HH:mm:ss（也可用 T 分隔、秒可省略）。');
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]);
  const second=match[6]===undefined?0:Number(match[6]);
  const millisecond=match[7]===undefined?0:Number(match[7].padEnd(3,'0'));
  if(year<1||year>9999)throw new Error('年份需在 0001–9999 之间。');
  if(month<1||month>12)throw new Error('月份需在 01–12 之间。');
  if(hour>23)throw new Error('小时需在 00–23 之间。');
  if(minute>59)throw new Error('分钟需在 00–59 之间。');
  if(second>59)throw new Error('秒需在 00–59 之间（不支持闰秒）。');
  if(day<1||day>daysInMonth(year,month))throw new Error(`日期无效：${year} 年 ${month} 月没有 ${day} 日。`);
  const wallClock=new Date(0);
  wallClock.setUTCFullYear(year,month-1,day);
  wallClock.setUTCHours(hour,minute,second,millisecond);
  const epochMs=wallClock.getTime()-offsetFor(timeZone);
  const display=displayFor(epochMs,timeZone);
  const normalized=`${match[1]}-${match[2]}-${match[3]} ${pad(hour)}:${pad(minute)}:${pad(second)}${millisecond?'.'+pad(millisecond,3):''}`;
  return {input:text,normalized,timeZone,epochMs,seconds:display.seconds,milliseconds:display.milliseconds,display};
}
