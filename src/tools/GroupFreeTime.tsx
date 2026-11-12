import {useEffect,useMemo,useState} from 'react';
import {ToolPage,saveLocal,textDownload} from './common';
import {WEEKDAY_LABELS} from './timetable-core';
import {
  DAY_START_MIN,MAX_MEMBERS,MIN_DURATION_OPTIONS,MIN_MEMBERS,SLOTS_PER_DAY,
  buildICS,commonFreeBlocks,describeBlock,emptyBusy,formatSummary,freeCounts,
  mondayOfWeek,nearMissBlocks,parseTimetableText,sampleMembers,slotIndex,slotStartMin,
  type FreeBlock,type MemberBusy,type ParseWarning,
} from './group-free-time-core';
import {formatMinutes} from './timetable-core';
import './group-free-time.css';

const TOOL_ID='group-free-time';
const STORAGE_KEY='novip-group-free-time-v1';
const PERIOD_TABLE='1–2 节 08:00–09:40 / 3–4 节 10:00–11:40 / 5–6 节 14:00–15:40 / 7–8 节 16:00–17:40 / 9–10 节 19:00–20:40 / 11 节 20:50–21:35';

interface Member extends MemberBusy{id:string}
const newId=()=>{try{return crypto.randomUUID();}catch{return `m${Date.now()}${Math.random().toString(36).slice(2)}`;}};
const toMember=(m:MemberBusy):Member=>({id:newId(),name:m.name,busy:[...m.busy]});
const defaultMembers=():Member[]=>[
  {id:newId(),name:'成员1',busy:emptyBusy()},
  {id:newId(),name:'成员2',busy:emptyBusy()},
];
function loadSaved():Member[]|null{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return null;
    const v=JSON.parse(raw) as {members?:{name?:unknown;busy?:unknown}[]};
    if(!Array.isArray(v.members)||v.members.length<MIN_MEMBERS||v.members.length>MAX_MEMBERS)return null;
    const ms=v.members.map((m)=>{
      if(typeof m.name!=='string'||!Array.isArray(m.busy)||m.busy.length!==SLOTS_PER_DAY*7)return null;
      return {id:newId(),name:m.name.slice(0,10)||'成员',busy:(m.busy as unknown[]).map(Boolean)};
    });
    if(ms.some((m)=>m===null))return null;
    return ms as Member[];
  }catch{return null;}
}

export default function GroupFreeTime(){
  const [members,setMembers]=useState<Member[]>(()=>loadSaved()??defaultMembers());
  const [activeId,setActiveId]=useState<string>(()=>members[0]?.id??'');
  const [paste,setPaste]=useState('');
  const [warnings,setWarnings]=useState<ParseWarning[]>([]);
  const [minMinutes,setMinMinutes]=useState<number>(60);
  const [monday,setMonday]=useState(()=>mondayOfWeek());
  const [eventTitle,setEventTitle]=useState('小组共同空闲');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const active=members.find((m)=>m.id===activeId)??members[0];

  useEffect(()=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({members:members.map((m)=>({name:m.name,busy:m.busy}))}));}catch{/* 本机保存失败不阻塞使用 */}
  },[members]);
  useEffect(()=>{if(!members.some((m)=>m.id===activeId))setActiveId(members[0]?.id??'');},[members,activeId]);

  const counts=useMemo(()=>freeCounts(members),[members]);
  const minSlots=Math.max(1,Math.round(minMinutes/30));
  const blocks=useMemo(()=>commonFreeBlocks(members,minSlots),[members,minSlots]);
  const near=useMemo(()=>nearMissBlocks(members,minSlots),[members,minSlots]);
  const summary=useMemo(()=>formatSummary(members,blocks.slice(0,10),near,minMinutes),[members,blocks,near,minMinutes]);
  const anyBusy=members.some((m)=>m.busy.some(Boolean));
  const fileStamp=monday.replace(/-/g,'');

  const updateActive=(fn:(busy:boolean[])=>boolean[])=>{
    if(!active)return;
    setMembers((ms)=>ms.map((m)=>m.id===active.id?{...m,busy:fn([...m.busy])}:m));
  };
  const toggleCell=(day:number,slot:number)=>{
    updateActive((b)=>{const i=slotIndex(day,slot);b[i]=!b[i];return b;});
  };
  const toggleDay=(day:number)=>{
    updateActive((b)=>{
      const allBusy=Array.from({length:SLOTS_PER_DAY},(_,s)=>b[slotIndex(day,s)]).every(Boolean);
      for(let s=0;s<SLOTS_PER_DAY;s++)b[slotIndex(day,s)]=!allBusy;
      return b;
    });
  };
  const toggleSlot=(slot:number)=>{
    updateActive((b)=>{
      const allBusy=Array.from({length:7},(_,d)=>b[slotIndex(d,slot)]).every(Boolean);
      for(let d=0;d<7;d++)b[slotIndex(d,slot)]=!allBusy;
      return b;
    });
  };
  const renameActive=(name:string)=>{
    if(!active)return;
    setMembers((ms)=>ms.map((m)=>m.id===active.id?{...m,name:name.slice(0,10)}:m));
  };
  const addMember=()=>{
    if(members.length>=MAX_MEMBERS){setError(`最多 ${MAX_MEMBERS} 人。`);return;}
    const m:Member={id:newId(),name:`成员${members.length+1}`,busy:emptyBusy()};
    setMembers((ms)=>[...ms,m]);setActiveId(m.id);setError('');setNotice(`已添加${m.name}。`);
  };
  const removeMember=(id:string)=>{
    if(members.length<=MIN_MEMBERS){setError(`至少保留 ${MIN_MEMBERS} 人。`);return;}
    setMembers((ms)=>ms.filter((m)=>m.id!==id));setError('');
  };
  const loadSample=()=>{
    const s=sampleMembers().map(toMember);
    setMembers(s);setActiveId(s[0].id);setWarnings([]);setError('');
    setNotice('已填入 3 人示例课表：周三 10:00 后与周六上午全员空闲，可直接看推荐结果。');
  };
  const clearAll=()=>{
    setMembers(defaultMembers());setPaste('');setWarnings([]);setError('');
    setNotice('已清空全部成员与课表。');
  };
  const importPaste=(mode:'append'|'replace')=>{
    setError('');setNotice('');
    const {members:parsed,warnings:w}=parseTimetableText(paste,active?.name??'成员1');
    setWarnings(w);
    if(!parsed.length){setError('没有解析到任何时段：请按“周一 1-2”或“周一 08:00-09:40”的格式粘贴。');return;}
    if(mode==='replace'){
      const next=parsed.map(toMember);
      setMembers(next);setActiveId(next[0].id);
      setNotice(`已替换为 ${parsed.length} 位成员的课表${w.length?`（${w.length} 行未解析，见下方）`:''}。`);
    }else{
      setMembers((ms)=>{
        const next=[...ms];
        for(const p of parsed){
          const ex=next.find((m)=>m.name===p.name);
          if(ex){for(let i=0;i<p.busy.length;i++)if(p.busy[i])ex.busy[i]=true;}
          else if(next.length<MAX_MEMBERS)next.push(toMember(p));
        }
        return next;
      });
      setNotice(`已把 ${parsed.length} 位成员的课表追加到现有成员${w.length?`（${w.length} 行未解析，见下方）`:''}。`);
    }
  };
  const copySummary=async()=>{
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(summary);
      else throw new Error('no clipboard');
      setNotice('已复制共同空闲清单，可直接发到小组群。');
    }catch{
      setError('复制失败：请手动选中下方文本复制。');
    }
  };
  const downloadICS=()=>{
    try{
      const ics=buildICS(blocks,monday,eventTitle.trim()||'小组共同空闲');
      saveLocal(new Blob([ics],{type:'text/calendar;charset=utf-8'}),`novip-group-free-${fileStamp}.ics`);
      setNotice(`已下载 ICS（${Math.min(blocks.length,20)} 个共同空闲事件，可导入手机日历）。`);
    }catch(e){setError(e instanceof Error?e.message:'导出 ICS 失败。');}
  };
  const downloadTXT=()=>{
    try{
      textDownload(summary,`novip-group-free-${fileStamp}.txt`);
      setNotice('已下载共同空闲清单 TXT。');
    }catch(e){setError(e instanceof Error?e.message:'下载失败。');}
  };

  const heatColor=(free:number)=>{
    if(free===members.length)return '#16a34a';
    if(free===0)return '#e5e7eb';
    const ratio=free/members.length;
    return ratio>=0.6?'#fbbf24':ratio>=0.34?'#fdba74':'#fed7aa';
  };

  return (
    <ToolPage
      id={TOOL_ID}
      title="小组空闲时间"
      description="一人粘贴多份课表，离线算出全组共同空闲时段，推荐最佳开会时间，可复制文本或导出 ICS 导入手机日历；全程浏览器本地计算，不上传、不登录、无水印。"
    >
      {notice&&<p className="study-note" role="status">{notice}</p>}
      {error&&<p className="study-note" role="alert" style={{color:'#b91c1c'}}>{error}</p>}

      <section className="study-card">
        <h2>1 成员与忙碌时段（点格子切换忙 / 闲）</h2>
        <p>先加好 2–8 位成员，再点格子标出每个人的上课时间。红色格 = 有课忙碌，空白格 = 空闲。点星期标题切换整天，点左侧时间切换该时段整周。</p>
        <div className="gft-tabs" role="tablist" aria-label="成员">
          {members.map((m)=>(
            <span key={m.id} className="gft-tab">
              <button
                role="tab"
                aria-selected={m.id===active?.id}
                className={m.id===active?.id?'gft-tab-btn active':'gft-tab-btn'}
                onClick={()=>setActiveId(m.id)}
              >{m.name}</button>
              {members.length>MIN_MEMBERS&&(
                <button className="gft-tab-x" aria-label={`删除${m.name}`} onClick={()=>removeMember(m.id)}>×</button>
              )}
            </span>
          ))}
          {members.length<MAX_MEMBERS&&<button className="study-btn alt" onClick={addMember}>+ 加成员</button>}
        </div>
        {active&&(
          <>
            <div className="study-fields">
              <label>
                当前成员姓名
                <input value={active.name} maxLength={10} onChange={(e)=>renameActive(e.target.value)} placeholder="如 小明" />
              </label>
            </div>
            <div className="gft-grid" role="grid" aria-label={`${active.name}的周课表忙碌格`}>
              <span className="gft-corner">时间</span>
              {WEEKDAY_LABELS.map((d,di)=>(
                <button key={d} className="gft-day" onClick={()=>toggleDay(di)} title={`切换${d}整天`}>{d}</button>
              ))}
              {Array.from({length:SLOTS_PER_DAY},(_,slot)=>(
                <span key={slot} className="gft-row" style={{display:'contents'}}>
                  <button className="gft-time" onClick={()=>toggleSlot(slot)} title={`切换每天 ${formatMinutes(slotStartMin(slot))}`}>
                    {slot%2===0?formatMinutes(slotStartMin(slot)):''}
                  </button>
                  {Array.from({length:7},(_,day)=>{
                    const busy=active.busy[slotIndex(day,slot)];
                    return (
                      <button
                        key={day}
                        role="gridcell"
                        aria-pressed={busy}
                        aria-label={`${WEEKDAY_LABELS[day]} ${formatMinutes(slotStartMin(slot))} ${busy?'忙碌':'空闲'}，点击切换`}
                        className={busy?'gft-cell busy':'gft-cell'}
                        onClick={()=>toggleCell(day,slot)}
                      />
                    );
                  })}
                </span>
              ))}
            </div>
            <div className="study-actions">
              <button className="study-btn alt" onClick={loadSample}>填入示例（3 人）</button>
              <button className="study-btn alt" onClick={clearAll}>清空全部</button>
            </div>
          </>
        )}
      </section>

      <section className="study-card">
        <h2>2 粘贴课表文本导入（可替代点格子）</h2>
        <p>
          每行一段忙碌时段，课程名写在时间后会被忽略。支持三种写法：节次（<code>周一 1-2 高数</code>）、时刻（<code>周一 08:00-09:40 英语</code>）、时段词（<code>周五下午</code>）。
          多人一起粘贴时，以 <code>张三：</code> 或 <code>【张三】</code> 开头的行开始一个新成员，或写 <code>张三 周一 1-2</code>。
          节次按常见高校作息换算：{PERIOD_TABLE}；不同学校请以点格子微调为准。
        </p>
        <label>
          课表文本
          <textarea
            value={paste}
            rows={6}
            onChange={(e)=>setPaste(e.target.value)}
            placeholder={'张三：\n周一 1-2 高数\n周三 08:00-09:40 英语\n周五下午\n李四 周二 3-4'}
          />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={()=>importPaste('append')}>追加到现有成员</button>
          <button className="study-btn alt" onClick={()=>importPaste('replace')}>替换全部成员</button>
        </div>
        {warnings.length>0&&(
          <div>
            <h3>未解析的行（{warnings.length}）</h3>
            <ul>
              {warnings.slice(0,10).map((w,i)=>(
                <li key={i}>{w.line>0?`第 ${w.line} 行`:'整体'}：{w.text?`「${w.text}」`:''}{w.reason}</li>
              ))}
            </ul>
            {warnings.length>10&&<p>……其余 {warnings.length-10} 行未列出。</p>}
          </div>
        )}
      </section>

      <section className="study-card">
        <h2>3 共同空闲与推荐</h2>
        {!anyBusy&&<p>还没有填任何忙碌时段：先在上面点格子或粘贴课表导入，否则所有时段都会被算作空闲。</p>}
        <div className="study-fields">
          <label>
            最短时长
            <select value={minMinutes} onChange={(e)=>setMinMinutes(Number(e.target.value))}>
              {MIN_DURATION_OPTIONS.map((m)=>(
                <option key={m} value={m}>{m>=60?`${m/60} 小时`:`${m} 分钟`}</option>
              ))}
            </select>
          </label>
          <label>
            本周周一（ICS 日期基准）
            <input type="date" value={monday} onChange={(e)=>{if(e.target.value)setMonday(e.target.value);}} />
          </label>
          <label>
            日历事件标题
            <input value={eventTitle} maxLength={30} onChange={(e)=>setEventTitle(e.target.value)} placeholder="小组共同空闲" />
          </label>
        </div>
        <h3>空闲人数热力图（绿色 = 全员空闲）</h3>
        <div className="gft-grid" aria-label="共同空闲热力图">
          <span className="gft-corner">时间</span>
          {WEEKDAY_LABELS.map((d)=>(<span key={d} className="gft-day static">{d}</span>))}
          {Array.from({length:SLOTS_PER_DAY},(_,slot)=>(
            <span key={slot} className="gft-row" style={{display:'contents'}}>
              <span className="gft-time static">{slot%2===0?formatMinutes(slotStartMin(slot)):''}</span>
              {Array.from({length:7},(_,day)=>{
                const free=counts[slotIndex(day,slot)];
                return (
                  <span
                    key={day}
                    className="gft-heat"
                    title={`${WEEKDAY_LABELS[day]} ${formatMinutes(slotStartMin(slot))}：${free}/${members.length} 人空闲`}
                    style={{backgroundColor:heatColor(free)}}
                  />
                );
              })}
            </span>
          ))}
        </div>
        <p>图例：<span style={{color:'#16a34a'}}>■ 全员空闲</span>　<span style={{color:'#d97706'}}>■ 部分空闲</span>　<span style={{color:'#9ca3af'}}>■ 无人空闲</span></p>
        <h3>推荐时段（最长优先）</h3>
        {blocks.length===0?(
          <div>
            <p>本周没有达到最短时长的全员空闲时段。可以调小“最短时长”，或看下面的次优时段。</p>
            {near.length>0&&(
              <>
                <p>缺 1 人即可的时段：</p>
                <ol>
                  {near.slice(0,5).map((b:FreeBlock,i:number)=>(
                    <li key={i}>{describeBlock(b)}（{b.freeCount}/{members.length} 人空闲）</li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ):(
          <ol>
            {blocks.slice(0,10).map((b:FreeBlock,i:number)=>(
              <li key={i}>{describeBlock(b)}</li>
            ))}
          </ol>
        )}
        <h3>可复制的清单</h3>
        <label>
          共同空闲清单
          <textarea value={summary} rows={Math.min(12,summary.split('\n').length+1)} readOnly />
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={()=>void copySummary()}>复制清单发群</button>
          <button className="study-btn alt" onClick={downloadICS} disabled={blocks.length===0}>下载 ICS 导入日历</button>
          <button className="study-btn alt" onClick={downloadTXT}>下载清单 TXT</button>
        </div>
        <p>提示：ICS 按上方“本周周一”生成本周事件；导入手机日历后可设提醒。单周模型，不含跨周重复课表。</p>
      </section>
    </ToolPage>
  );
}
