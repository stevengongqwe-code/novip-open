import {useEffect,useState} from 'react';
import {copyLocal} from '../tool-common';
import {ToolPage,useJob,textDownload} from './common';
import {
  TIME_ZONE_LABELS,
  currentTimestamp,
  formatTimestamp,
  parseDateTimeInput,
  timestampToDisplay,
  type DateTimeToTimestampResult,
  type TimeZoneChoice,
  type TimestampConversion,
  type TimestampUnit,
} from './timestamp-core';
import './timestamp.css';

const unitOptions:{value:TimestampUnit;label:string}[]=[
  {value:'auto',label:'自动识别（1–10 位为秒 / 13 位为毫秒）'},
  {value:'s',label:'秒级（10 位）'},
  {value:'ms',label:'毫秒级（13 位）'},
];
const zoneOptions:{value:TimeZoneChoice;label:string}[]=[
  {value:'Asia/Shanghai',label:'中国标准时间 Asia/Shanghai（UTC+8）'},
  {value:'UTC',label:'协调世界时 UTC'},
];
const conversionText=(result:TimestampConversion)=>{
  const display=result.display;
  const lines=[
    `输入时间戳：${result.parsed.input}`,
    `识别单位：${result.parsed.unit==='s'?'秒级':'毫秒级'}（${result.parsed.digits} 位）`,
    `秒级时间戳：${display.seconds}`,
    `毫秒级时间戳：${display.milliseconds}`,
    `${display.timeZone==='UTC'?'UTC 时间':'上海时间（Asia/Shanghai）'}：${display.dateTime} ${display.weekday}`,
    `UTC 时间：${display.utcDateTime}`,
    `ISO 8601：${display.iso8601}`,
  ];
  return lines.join('\n');
};
const dateTimeText=(result:DateTimeToTimestampResult)=>{
  const display=result.display;
  return [
    `输入日期时间：${result.input}`,
    `时区：${TIME_ZONE_LABELS[result.timeZone]}`,
    `秒级时间戳：${result.seconds}`,
    `毫秒级时间戳：${result.milliseconds}`,
    `ISO 8601：${display.iso8601}`,
    `星期：${display.weekday}`,
  ].join('\n');
};
export default function Timestamp(){
  const job=useJob();
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[]);
  const live=currentTimestamp(now);
  const [timestampInput,setTimestampInput]=useState('');
  const [timestampUnit,setTimestampUnit]=useState<TimestampUnit>('auto');
  const [timestampZone,setTimestampZone]=useState<TimeZoneChoice>('Asia/Shanghai');
  const [timestampResult,setTimestampResult]=useState<TimestampConversion|null>(null);
  const [dateTimeInput,setDateTimeInput]=useState('');
  const [dateTimeZone,setDateTimeZone]=useState<TimeZoneChoice>('Asia/Shanghai');
  const [dateTimeResult,setDateTimeResult]=useState<DateTimeToTimestampResult|null>(null);
  const clearBoth=()=>{setTimestampResult(null);setDateTimeResult(null);job.reset();};
  const runTimestamp=()=>void job.run(async()=>timestampToDisplay(timestampInput,timestampUnit,timestampZone),result=>{setTimestampResult(result);setDateTimeResult(null);});
  const runDateTime=()=>void job.run(async()=>parseDateTimeInput(dateTimeInput,dateTimeZone),result=>{setDateTimeResult(result);setTimestampResult(null);});
  const copy=async(text:string,label:string)=>{
    try{await copyLocal(text);job.setStatus(`已复制${label}。`);}
    catch(error){job.setError(error instanceof Error?error.message:'复制失败，请手动选择内容。');}
  };
  const download=(text:string,name:string)=>{
    try{textDownload(text,name);job.setStatus('已开始下载。');}
    catch(error){job.setError(error instanceof Error?error.message:'下载失败，请重试。');}
  };
  const fillCurrentTime=()=>{setDateTimeInput(formatTimestamp(Date.now(),dateTimeZone).dateTime);setDateTimeResult(null);job.reset();};
  const fillSampleTimestamp=()=>{const sample='1700000000';setTimestampInput(sample);void job.run(async()=>timestampToDisplay(sample,timestampUnit,timestampZone),result=>{setTimestampResult(result);setDateTimeResult(null);});};
  return <ToolPage id="timestamp" title="时间戳转换器" description="Unix 时间戳与日期时间互转：自动识别秒/毫秒、北京时间与 UTC 对照、ISO 8601 输出；全部在浏览器本地计算，不联网。" job={job}>
    <section className="study-card">
      <h2>1 一串数字 → 看懂是哪一天几点钟（时间戳 → 日期时间）</h2>
      <label>把那串 10 位或 13 位数字粘贴到这里<input aria-label="时间戳输入" inputMode="numeric" value={timestampInput} maxLength={20} spellCheck={false} placeholder="例如 1700000000（10位）或 1700000000123（13位）" onChange={event=>{setTimestampInput(event.target.value);setTimestampResult(null);job.reset();}}/></label>
      <div className="study-actions">
        <button className="study-btn" disabled={job.busy} onClick={runTimestamp}>转换时间戳</button>
        <button className="study-btn alt" disabled={job.busy} onClick={fillSampleTimestamp}>填入示例数字试试</button>
        <button className="study-btn alt" onClick={()=>{clearBoth();setTimestampInput('');}}>重置</button>
      </div>
      <details className="novip-advanced-details">
        <summary>⚙️ 高级设置：手动指定秒/毫秒或切换时区（默认自动识别，新手不用改）</summary>
        <div className="novip-advanced-body study-fields">
          <label>输入单位<select aria-label="时间戳单位" value={timestampUnit} onChange={event=>{setTimestampUnit(event.target.value as TimestampUnit);setTimestampResult(null);job.reset();}}>{unitOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>显示时区<select aria-label="时间戳显示时区" value={timestampZone} onChange={event=>{setTimestampZone(event.target.value as TimeZoneChoice);setTimestampResult(null);job.reset();}}>{zoneOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
      </details>
      {timestampResult&&<div className="timestamp-result">
        <div className="timestamp-summary-banner" role="region" aria-label="通俗时间转换结果">
          📅 这串数字对应的{timestampResult.display.timeZone==='UTC'?'世界标准时间（UTC）':'北京时间'}是：
          <strong>{timestampResult.display.dateTime}（{timestampResult.display.weekday}）</strong>
        </div>
        <div className="study-actions">
          <button className="study-btn" onClick={()=>void copy(timestampResult.display.dateTime,'日期时间')}>复制这个时间（{timestampResult.display.dateTime}）</button>
          <button className="study-btn alt" onClick={()=>void copy(conversionText(timestampResult),'时间戳转换结果')}>复制结果</button>
          <button className="study-btn alt" onClick={()=>download(conversionText(timestampResult),'novip-timestamp-to-date.txt')}>下载 TXT</button>
        </div>
        <details className="novip-tech-details" open>
          <summary>查看完整格式对照（含秒级 / 毫秒级 / UTC / ISO 8601）</summary>
          <div className="timestamp-grid">
            <div><span>识别单位</span><code>{timestampResult.parsed.unit==='s'?'秒级':'毫秒级'}（{timestampResult.parsed.digits} 位）</code></div>
            <div><span>秒级时间戳</span><code>{timestampResult.display.seconds}</code></div>
            <div><span>毫秒级时间戳</span><code>{timestampResult.display.milliseconds}</code></div>
            <div><span>{timestampResult.display.timeZone==='UTC'?'UTC 时间':'上海时间（Asia/Shanghai）'}</span><code>{timestampResult.display.dateTime}</code><span className="timestamp-meta">{timestampResult.display.weekday} · {timestampResult.display.offsetLabel}</span></div>
            {timestampResult.display.timeZone!=='UTC'&&<div><span>UTC 时间</span><code>{timestampResult.display.utcDateTime}</code></div>}
            <div><span>ISO 8601</span><code>{timestampResult.display.iso8601}</code></div>
          </div>
        </details>
      </div>}
    </section>
    <section className="study-card">
      <h2>2 普通日期时间 → 转成数字（日期时间 → 时间戳）</h2>
      <label>输入日期时间（格式：年-月-日 时:分:秒）<input aria-label="日期时间输入" value={dateTimeInput} maxLength={32} spellCheck={false} placeholder="例如 2026-10-24 21:30:00（也可点下方「填入当前时间」）" onChange={event=>{setDateTimeInput(event.target.value);setDateTimeResult(null);job.reset();}}/></label>
      <div className="study-actions">
        <button className="study-btn" disabled={job.busy} onClick={runDateTime}>转换日期时间</button>
        <button className="study-btn alt" onClick={fillCurrentTime}>填入当前时间</button>
        <button className="study-btn alt" onClick={()=>{clearBoth();setDateTimeInput('');}}>重置</button>
      </div>
      <details className="novip-advanced-details">
        <summary>⚙️ 高级设置：切换输入时区（默认按北京时间计算）</summary>
        <div className="novip-advanced-body">
          <label>输入时区<select aria-label="日期时间时区" value={dateTimeZone} onChange={event=>{setDateTimeZone(event.target.value as TimeZoneChoice);setDateTimeResult(null);job.reset();}}>{zoneOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
      </details>
      {dateTimeResult&&<div className="timestamp-result">
        <div className="timestamp-summary-banner" role="region" aria-label="时间戳结果摘要">
          🔢 转换出的 10 位秒级数字：<strong>{dateTimeResult.seconds}</strong>
          <span style={{display:'block',marginTop:4,fontSize:13}}>13 位毫秒级数字：{dateTimeResult.milliseconds}</span>
        </div>
        <div className="timestamp-grid">
          <div><span>秒级时间戳</span><code>{dateTimeResult.seconds}</code></div>
          <div><span>毫秒级时间戳</span><code>{dateTimeResult.milliseconds}</code></div>
          <div><span>{dateTimeResult.timeZone==='UTC'?'UTC 时间':'上海时间（Asia/Shanghai）'}</span><code>{dateTimeResult.display.dateTime}</code><span className="timestamp-meta">{dateTimeResult.display.weekday} · {dateTimeResult.display.offsetLabel}</span></div>
          <div><span>ISO 8601</span><code>{dateTimeResult.display.iso8601}</code></div>
          <div><span>UTC 时间</span><code>{dateTimeResult.display.utcDateTime}</code></div>
        </div>
        <div className="study-actions">
          <button className="study-btn" onClick={()=>void copy(String(dateTimeResult.seconds),'秒级时间戳')}>复制 10 位秒级数字</button>
          <button className="study-btn alt" onClick={()=>void copy(dateTimeText(dateTimeResult),'日期时间转换结果')}>复制结果</button>
          <button className="study-btn alt" onClick={()=>download(dateTimeText(dateTimeResult),'novip-date-to-timestamp.txt')}>下载 TXT</button>
        </div>
      </div>}
    </section>
    <section className="study-card">
      <h2>3 现在这一秒的数字对照（实时刷新）</h2>
      <div className="timestamp-live">
        <div>
          <span className="timestamp-label">秒级时间戳（10 位）</span>
          <strong className="timestamp-value">{live.seconds}</strong>
          <button className="timestamp-copy" onClick={()=>void copy(String(live.seconds),'当前秒级时间戳')}>复制秒级</button>
        </div>
        <div>
          <span className="timestamp-label">毫秒级时间戳（13 位）</span>
          <strong className="timestamp-value">{live.milliseconds}</strong>
          <button className="timestamp-copy" onClick={()=>void copy(String(live.milliseconds),'当前毫秒级时间戳')}>复制毫秒级</button>
        </div>
        <div>
          <span className="timestamp-label">当前北京时间（Asia/Shanghai，UTC+8）</span>
          <strong className="timestamp-value timestamp-value-text">{live.dateTime}</strong>
          <span className="timestamp-meta">{live.weekday} · UTC {live.utcDateTime}</span>
          <button className="timestamp-copy" onClick={()=>void copy(live.dateTime,'当前时间')}>复制当前时间</button>
        </div>
      </div>
      <p className="study-note">每秒自动刷新，时间取自你的手机或电脑时钟。复制内容只在本机剪贴板。</p>
    </section>
    <p className="study-note">提示：本工具固定按 UTC+8 处理中国标准时间（无夏令时），不猜测设备时区；秒级与毫秒级时间戳都来自同一时刻，可直接互转。输入非法或超出可表示范围时会给出中文说明。</p>
  </ToolPage>;
}
