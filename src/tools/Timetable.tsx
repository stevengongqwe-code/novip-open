import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Download,FileUp,Plus,RotateCcw,Trash2,TriangleAlert,X} from 'lucide-react';
import {ToolPage,saveLocal} from './common';
import { useI18n } from '../i18n';
import {trackToolError,trackToolStart,trackToolSuccess} from '../analytics/client';
import {
  COLOR_COUNT,MAX_COURSES,MAX_PERIODS,MAX_WEEKS,REMINDER_OPTIONS,RULE_LABELS,UNDO_KEY,WEEKDAY_LABELS,WEEKDAY_SHORT,
  blankCourse,buildICS,colorForName,conflictIds,conflictsBetween,courseOccurrences,courseTime,courseWeeks,coursesInWeek,
  dayOf,dayToISO,describeWeeks,emptyData,findConflicts,formatWeekList,generatePeriods,loadFromStorage,monthDay,
  normalizeData,parseISODate,parseWeekList,saveToStorage,sampleCourses,serialize,shanghaiToday,shouldShowWeekend,
  validateCourse,validateSettings,weekForDay,weekRange,weekdayOfDay,
  type Course,type Period,type Reminder,type Settings,type TimetableData,type WeekRule,type Weekday,type StorageLike,
} from './timetable-core';
import './timetable.css';

const TOOL_ID='timetable';
const storage=():StorageLike|null=>{try{const s=window.localStorage;const k='__novip_tt_probe';s.setItem(k,'1');s.removeItem(k);return s;}catch{return null;}};
const isWeChat=()=>{try{return /MicroMessenger/i.test(navigator.userAgent);}catch{return false;}};
type Toast={text:string;undo?:TimetableData}|null;
type Editor={course:Course;isNew:boolean}|null;
type Confirm={title:string;body:ReactNode;action:string;danger?:boolean;run:()=>void}|null;

function readUndo():TimetableData|null{try{const t=localStorage.getItem(UNDO_KEY);if(!t)return null;const r=normalizeData(JSON.parse(t));return r.ok?r.data:null;}catch{return null;}}
function writeUndo(data:TimetableData|null){try{if(data&&data.courses.length)localStorage.setItem(UNDO_KEY,JSON.stringify(data));else localStorage.removeItem(UNDO_KEY);}catch{/* 撤销快照只是增强，不可用时仍保留内存快照 */}}
const pad2=(n:number)=>String(n).padStart(2,'0');
const stampName=(prefix:string,ext:string)=>{const d=dayToISO(shanghaiToday()).replace(/-/g,'');return `${prefix}-${d}.${ext}`;};

export default function Timetable(){
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const initial=useMemo(()=>loadFromStorage(storage()),[]);
  const [data,setDataRaw]=useState<TimetableData>(initial.data);
  const [warning,setWarning]=useState(initial.warning??'');
  const [saveState,setSaveState]=useState(initial.source==='saved'?(isEn ? 'Restored saved timetable from device' : '已从本机恢复上次的课表'):'');
  const [now,setNow]=useState(()=>Date.now());
  const today=shanghaiToday(now);
  const thisWeek=weekForDay(data.settings,today);
  const [week,setWeek]=useState(thisWeek.week);
  const [editor,setEditor]=useState<Editor>(null);
  const [confirm,setConfirm]=useState<Confirm>(null);
  const [toast,setToast]=useState<Toast>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [undoSnapshot,setUndoSnapshot]=useState<TimetableData|null>(()=>readUndo());
  const dirty=useRef(false);
  const importRef=useRef<HTMLInputElement>(null);
  const {settings,courses}=data;

  /** 所有用户修改都经过这里：标记为已修改，随后自动保存。 */
  const setData=useCallback((update:(old:TimetableData)=>TimetableData)=>{dirty.current=true;setDataRaw(update);},[]);
  useEffect(()=>{
    if(!dirty.current)return;
    const err=saveToStorage(storage(),data);
    if(err){setWarning(err);setSaveState('');}
    else{const d=new Date();setSaveState(`已自动保存到本机 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`);}
  },[data]);
  useEffect(()=>{const f=()=>{if(document.visibilityState==='visible')setNow(Date.now());};document.addEventListener('visibilitychange',f);const t=window.setInterval(()=>setNow(Date.now()),60_000);return()=>{document.removeEventListener('visibilitychange',f);window.clearInterval(t);};},[]);
  useEffect(()=>{setWeek(w=>Math.min(Math.max(1,w),settings.totalWeeks));},[settings.totalWeeks]);
  useEffect(()=>{if(!toast)return;const t=window.setTimeout(()=>setToast(null),toast.undo?8000:3500);return()=>window.clearTimeout(t);},[toast]);

  const conflicts=useMemo(()=>findConflicts(courses,settings.totalWeeks),[courses,settings.totalWeeks]);
  const conflictSet=useMemo(()=>conflictIds(conflicts),[conflicts]);
  const weekCourses=useMemo(()=>coursesInWeek(courses,settings,week),[courses,settings,week]);
  const showWeekend=shouldShowWeekend(data);
  const ics=useMemo(()=>{try{return buildICS(data,{nowMs:0});}catch{return null;}},[data]);

  const snapshotBeforeDestructive=(label:string)=>{
    if(!courses.length)return;
    writeUndo(data);setUndoSnapshot(data);
    setToast({text:label,undo:data});
  };
  const restore=(snap:TimetableData)=>{setData(()=>snap);setToast({text:`已恢复 ${snap.courses.length} 门课程。`});setError('');};

  const openNew=(partial:Partial<Course>={})=>{
    if(courses.length>=MAX_COURSES){setError(`最多保存 ${MAX_COURSES} 条课程时间。`);return;}
    const endPeriod=partial.startPeriod?Math.min(partial.startPeriod+1,settings.periods.length):undefined;
    setEditor({course:blankCourse(settings,{...(endPeriod?{endPeriod}:{}),...partial}),isNew:true});
  };
  const saveCourse=(course:Course,again:boolean)=>{
    const clean={...course,name:course.name.trim(),teacher:course.teacher.trim(),room:course.room.trim()};
    setData(old=>{const exists=old.courses.some(c=>c.id===clean.id);return {...old,courses:exists?old.courses.map(c=>c.id===clean.id?clean:c):[...old.courses,clean]};});
    setToast({text:`已保存「${clean.name}」。`});
    const w=courseWeeks(clean,settings.totalWeeks);
    if(w.length&&!w.includes(week))setToast({text:`已保存「${clean.name}」，本周（第 ${week} 周）没有这节课。`});
    if(again)setEditor({course:blankCourse(settings,{name:clean.name,teacher:clean.teacher,room:clean.room,color:clean.color,startWeek:clean.startWeek,endWeek:clean.endWeek,weekRule:clean.weekRule,customWeeks:clean.customWeeks,weekday:(clean.weekday%7+1) as Weekday,startPeriod:clean.startPeriod,endPeriod:clean.endPeriod}),isNew:true});
    else setEditor(null);
  };
  const deleteCourse=(course:Course)=>{
    const before=data;
    setData(old=>({...old,courses:old.courses.filter(c=>c.id!==course.id)}));
    setEditor(null);setToast({text:`已删除「${course.name}」。`,undo:before});
  };
  const exportICS=()=>{
    trackToolStart(TOOL_ID);
    try{
      if(!courses.length)throw new Error('还没有课程，无法导出日历。');
      const err=validateSettings(settings);if(err)throw new Error(err);
      const result=buildICS(data);
      if(!result.events)throw new Error('学期范围内没有可导出的课次，请检查学期开始日期与课程周次。');
      saveLocal(new Blob([result.text],{type:'text/calendar;charset=utf-8'}),stampName('novip-timetable','ics'));
      trackToolSuccess(TOOL_ID);setError('');
      setToast({text:`已生成日历文件：${result.events} 个重复日程，共 ${result.occurrences} 次课。`});
    }catch(e){trackToolError(TOOL_ID);setError(e instanceof Error?e.message:'导出失败，请重试。');}
  };
  const exportBackup=()=>{
    try{saveLocal(new Blob([serialize(data)],{type:'application/json'}),stampName('novip-timetable-backup','json'));setToast({text:'已导出备份。换设备或清理浏览器前请妥善保存。'});}
    catch{setError('导出备份失败，请重试。');}
  };
  const importBackup=async(file:File)=>{
    setBusy('正在读取备份…');setError('');
    try{
      if(file.size>1024*1024)throw new Error('备份文件过大（超过 1 MB），请确认选择的是 NOVIP 课程表备份。');
      let raw:unknown;
      try{raw=JSON.parse(await file.text());}catch{throw new Error('文件不是有效的 JSON 备份。');}
      const r=normalizeData(raw);
      if(!r.ok)throw new Error(r.error);
      const incoming=r.data;
      setConfirm({title:'从备份恢复课表？',action:'确认恢复',body:<>
        <p>备份中有 <b>{incoming.courses.length}</b> 门课程时间，学期从 {incoming.settings.termStart} 开始，共 {incoming.settings.totalWeeks} 周。</p>
        {r.dropped>0&&<p className="tt-warn-text">{r.dropped} 条课程数据不完整，将被跳过。</p>}
        {courses.length>0&&<p>当前课表（{courses.length} 门）将被替换；替换前会自动保留快照，可一键撤销。</p>}
      </>,run:()=>{snapshotBeforeDestructive('已用备份替换课表。');setData(()=>incoming);setWeek(weekForDay(incoming.settings,today).week);if(!courses.length)setToast({text:`已导入 ${incoming.courses.length} 门课程。`});}});
    }catch(e){setError(e instanceof Error?e.message:'导入失败。');}
    finally{setBusy('');if(importRef.current)importRef.current.value='';}
  };
  const clearAll=()=>setConfirm({title:'清空整张课表？',danger:true,action:'确认清空',body:<><p>将删除全部 {courses.length} 门课程时间，学期设置会保留。</p><p>清空前会在本机保留一份快照，可通过“撤销”或“恢复上次清空前的课表”找回；建议先导出备份。</p></>,
    run:()=>{snapshotBeforeDestructive(`已清空 ${courses.length} 门课程。`);setData(old=>({...old,courses:[]}));}});
  const loadSample=()=>{const s=sampleCourses(settings);setData(old=>({...old,courses:s}));setWeek(Math.min(3,settings.totalWeeks));setToast({text:'已载入示例课表（第 3 周可看到单双周差异），随时可清空。'});};

  // 手机左右滑动切换周次
  const touch=useRef<{x:number;y:number}|null>(null);
  const onTouchStart=(e:React.TouchEvent)=>{const t=e.touches[0];touch.current={x:t.clientX,y:t.clientY};};
  const onTouchEnd=(e:React.TouchEvent)=>{const s=touch.current;touch.current=null;if(!s)return;const t=e.changedTouches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)setWeek(w=>Math.min(settings.totalWeeks,Math.max(1,w+(dx<0?1:-1))));};

  const range=weekRange(settings,week);
  const days=showWeekend?7:5;
  const isThisWeek=thisWeek.status==='during'&&thisWeek.week===week;
  const statusTag=thisWeek.status==='before'
    ? (isEn ? `Not started · Starts ${settings.termStart}` : `未开学 · ${settings.termStart} 开学`)
    : thisWeek.status==='after'
      ? (isEn ? 'Term ended' : '本学期已结束')
      : isThisWeek
        ? (isEn ? 'This week' : '本周')
        : (isEn ? `Current: Week ${thisWeek.week}` : `本周为第 ${thisWeek.week} 周`);
  const hiddenWeekend=!showWeekend?weekCourses.filter(c=>c.weekday>=6).length:0;

  return <ToolPage
    id={TOOL_ID}
    title={isEn ? "College Timetable & Calendar Generator" : "大学课程表生成器"}
    description={isEn ? "Generate weekly college class schedules with odd/even/custom week rules, conflict checks, and export to Apple/Google .ics calendars. 100% In-Browser." : "填学期开始日期和课程，自动排出每周课表，支持单双周与自定义周次、冲突检查，可导出 .ics 导入手机日历并设置课前提醒。课表只保存在你的浏览器里，不上传。"}
    privacy={isEn ? "Privacy: Course data is stored strictly in your browser's local storage (localStorage) and never uploaded to any server. Export backups regularly." : "隐私：课程信息只保存在当前浏览器的本地存储（localStorage）中，不发送给任何服务器；清除浏览器数据或换设备会丢失，请定期导出备份。首次载入工具资源需网络。"}
  >
    {warning&&<div role="alert" className="study-error tt-banner"><TriangleAlert size={16} aria-hidden="true"/><span>{warning}</span><button className="study-link" onClick={()=>setWarning('')}>{isEn ? 'OK' : '知道了'}</button></div>}
    {error&&<div role="alert" className="study-error tt-banner"><TriangleAlert size={16} aria-hidden="true"/><span>{error}</span><button className="study-link" onClick={()=>setError('')}>{isEn ? 'Close' : '关闭'}</button></div>}
    {busy&&<p role="status" className="study-message">{busy}</p>}

    <section className="study-card tt-board" aria-label={isEn ? "Weekly Schedule" : "周课程表"}>
      <div className="tt-weekbar">
        <button className="tt-icon-btn" aria-label={isEn ? "Previous week" : "上一周"} disabled={week<=1} onClick={()=>setWeek(w=>Math.max(1,w-1))}><ChevronLeft size={20}/></button>
        <div className="tt-weektitle">
          <strong>{isEn ? `Week ${week}` : `第 ${week} 周`}<small> {isEn ? `/ ${settings.totalWeeks} wks` : `/ 共 ${settings.totalWeeks} 周`}</small></strong>
          <span>{range?`${monthDay(range.start)} – ${monthDay(range.end)}`:(isEn ? 'Please set term start date' : '请先设置学期开始日期')} · <em className={isThisWeek?'on':''}>{statusTag}</em></span>
        </div>
        <button className="tt-icon-btn" aria-label={isEn ? "Next week" : "下一周"} disabled={week>=settings.totalWeeks} onClick={()=>setWeek(w=>Math.min(settings.totalWeeks,w+1))}><ChevronRight size={20}/></button>
      </div>
      <div className="tt-weekchips" role="tablist" aria-label={isEn ? "Select teaching week" : "选择教学周"}>
        {Array.from({length:settings.totalWeeks},(_,i)=>i+1).map(w=><button key={w} role="tab" aria-selected={w===week} className={(w===week?'on ':'')+(thisWeek.status==='during'&&w===thisWeek.week?'now':'')} onClick={()=>setWeek(w)}>{w}</button>)}
      </div>
      {thisWeek.status==='during'&&!isThisWeek&&<button className="study-link tt-back" onClick={()=>setWeek(thisWeek.week)}>{isEn ? `Back to current week (Week ${thisWeek.week})` : `回到本周（第 ${thisWeek.week} 周）`}</button>}

      {courses.length===0?<div className="study-empty tt-empty">
        <span aria-hidden="true">课</span>
        <h3>{isEn ? 'No Courses Yet' : '还没有课程'}</h3>
        <p>{isEn ? 'Confirm term start date and class periods below, then add your first course. Or load sample schedule to preview.' : '先在下方确认学期开始日期和节次时间，再添加第一门课。<br/>也可以先载入示例看看效果。'}</p>
        <div className="study-actions"><button className="study-btn" onClick={()=>openNew()}><Plus size={16}/>{isEn ? 'Add Course' : '添加课程'}</button><button className="study-btn alt" onClick={loadSample}>{isEn ? 'Load Sample Schedule' : '载入示例课表'}</button></div>
      </div>:<>
        <div className={`tt-grid days-${days}`} style={{gridTemplateRows:`auto repeat(${settings.periods.length},minmax(var(--tt-row),auto))`}} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="tt-corner" style={{gridRow:1,gridColumn:1}}>{range?`${new Date(range.start*86400000).getUTCMonth()+1}月`:''}</div>
          {Array.from({length:days},(_,i)=>{const d=dayOf(settings,week,i+1),isToday=d===today;return <div key={i} className={'tt-dayhead'+(isToday?' today':'')} style={{gridRow:1,gridColumn:i+2}}><b>{WEEKDAY_SHORT[i]}</b><small>{d!==null?monthDay(d):''}</small></div>;})}
          {settings.periods.map((p,i)=><div key={i} className="tt-period" style={{gridRow:i+2,gridColumn:1}}><b>{i+1}</b><small>{p.start}</small><small>{p.end}</small></div>)}
          {settings.periods.map((_,pi)=>Array.from({length:days},(_,di)=><button key={`${pi}-${di}`} className="tt-cell" style={{gridRow:pi+2,gridColumn:di+2}} aria-label={`添加课程：${WEEKDAY_LABELS[di]} 第 ${pi+1} 节`} onClick={()=>openNew({weekday:(di+1) as Weekday,startPeriod:pi+1})}/>))}
          {layoutBlocks(weekCourses.filter(c=>c.weekday<=days)).map(({course,lane,lanes})=><button key={course.id}
            className={`tt-course c${course.color}`+(lanes>1?' clash':'')}
            style={{gridRow:`${course.startPeriod+1} / ${course.endPeriod+2}`,gridColumn:course.weekday+1,width:`calc(${100/lanes}% - 3px)`,marginLeft:`calc(${(100/lanes)*lane}% + 1.5px)`}}
            aria-label={`${course.name}，${WEEKDAY_LABELS[course.weekday-1]} 第 ${course.startPeriod}-${course.endPeriod} 节，${course.room||'未填教室'}${lanes>1?'，时间冲突':''}，点击编辑`}
            onClick={()=>setEditor({course,isNew:false})}>
            <b>{course.name}</b>{course.room&&<span>@{course.room}</span>}{course.teacher&&<span className="tt-teacher">{course.teacher}</span>}{lanes>1&&<i aria-hidden="true">{isEn ? 'Conflict' : '冲突'}</i>}
          </button>)}
        </div>
        <p className="study-note tt-hint">{isEn ? 'Click empty slot to add course, tap course card to edit. Swipe horizontally on mobile to switch weeks.' : '点空白格添加课程，点课程卡片编辑。手机上可左右滑动课表切换周次。'}{weekCourses.length===0&&(isEn ? ` No classes in Week ${week}.` : ` 第 ${week} 周没有课。`)}{hiddenWeekend>0&&(isEn ? ` ${hiddenWeekend} weekend class(es) hidden this week. Enable weekend columns in Term Settings.` : ` 本周有 ${hiddenWeekend} 节周末课程未显示，可在学期设置中开启周末列。`)}</p>
      </>}
      {saveState&&<p className="tt-save" role="status">{saveState}</p>}
    </section>

    {conflicts.length>0&&<section className="study-card tt-conflicts" role="alert" aria-label={isEn ? "Time Conflicts" : "时间冲突"}>
      <h2><TriangleAlert size={18} aria-hidden="true"/>{isEn ? `Found ${conflicts.length} time conflict(s)` : `发现 ${conflicts.length} 处时间冲突`}</h2>
      <ul>{conflicts.map(c=><li key={c.a.id+c.b.id}>
        <span><b>{c.a.name}</b> {isEn ? 'and' : '与'} <b>{c.b.name}</b>：{WEEKDAY_LABELS[c.a.weekday-1]} {isEn ? `Period ${Math.max(c.a.startPeriod,c.b.startPeriod)}-${Math.min(c.a.endPeriod,c.b.endPeriod)}, Week ${formatWeekList(c.weeks)}` : `第 ${Math.max(c.a.startPeriod,c.b.startPeriod)}-${Math.min(c.a.endPeriod,c.b.endPeriod)} 节，第 ${formatWeekList(c.weeks)} 周`}</span>
        <span className="tt-conflict-actions"><button className="study-link" onClick={()=>setEditor({course:c.a,isNew:false})}>{isEn ? `Edit "${c.a.name}"` : `改「${c.a.name}」`}</button><button className="study-link" onClick={()=>setEditor({course:c.b,isNew:false})}>{isEn ? `Edit "${c.b.name}"` : `改「${c.b.name}」`}</button></span>
      </li>)}</ul>
      <p className="study-note">{isEn ? 'Conflicting courses are still saved and exported. If alternating weeks, set one to odd and the other to even.' : '冲突课程仍会保存和导出；如果确实是隔周交替上课，请把两门课分别设成单周和双周。'}</p>
    </section>}

    <CourseList courses={courses} settings={settings} conflictSet={conflictSet} onEdit={c=>setEditor({course:c,isNew:false})} onAdd={()=>openNew()} isEn={isEn}/>

    <SettingsCard data={data} defaultOpen={courses.length===0} isEn={isEn} onSave={(next,adjusted)=>{setData(old=>({...old,settings:next,courses:adjusted}));setWeek(weekForDay(next,today).week);setToast({text:isEn ? 'Term settings saved.' : '学期设置已保存。'});}}
      onShowWeekend={v=>setData(old=>({...old,settings:{...old.settings,showWeekend:v}}))}/>

    <section className="study-card tt-export" aria-labelledby="tt-export-title">
      <h2 id="tt-export-title"><CalendarDays size={18} aria-hidden="true"/>{isEn ? 'Export to Phone Calendar' : '导出到手机日历'}</h2>
      <div className="study-field"><span className="study-field-label">{isEn ? 'Class Reminder' : '课前提醒'}</span>
        <div className="study-choices" role="radiogroup" aria-label={isEn ? "Class reminder" : "课前提醒"}>{REMINDER_OPTIONS.map(m=><button key={m} role="radio" aria-checked={settings.reminder===m} className={settings.reminder===m?'on':''} onClick={()=>setData(old=>({...old,settings:{...old.settings,reminder:m as Reminder}}))}>{m===0?(isEn ? 'No reminder' : '不提醒'):(isEn ? `${m} mins before` : `提前 ${m} 分钟`)}</button>)}</div>
      </div>
      <p className="study-note">{ics&&ics.events?(isEn ? `Generates ${ics.events} recurring events with ${ics.occurrences} classes total, in Asia/Shanghai timezone.` : `将生成 ${ics.events} 个重复日程，共 ${ics.occurrences} 次课，时间按中国标准时间（Asia/Shanghai）写入。`):(isEn ? 'Add courses to export calendar.' : '添加课程后即可导出。')}{isEn ? ' When re-importing, most calendars update existing entries.' : '重复导入同一份文件时，大多数日历会按课程编号更新而不是重复添加；修改课表后建议先删除旧日历再导入。'}</p>
      <div className="study-actions"><button className="study-btn" disabled={!courses.length} onClick={exportICS}><Download size={16}/>{isEn ? 'Export .ics Calendar File' : '导出 .ics 日历文件'}</button></div>
      {isWeChat()&&<p className="tt-warn-text" role="note">{isEn ? 'WeChat browser detected: downloads may be blocked. Tap "..." in top right and choose "Open in Browser".' : '检测到微信内置浏览器：微信可能拦截文件下载。请点右上角「…」选择「在浏览器打开」后再导出。课表数据也只保存在当前浏览器中。'}</p>}
      <details className="tt-help"><summary>{isEn ? 'How to import into Apple / Google / Android calendars?' : '如何导入到 Apple 日历 / Google 日历 / 安卓手机？'}</summary>
        <ul className="study-list">
          <li><b>{isEn ? 'iPhone / Mac:' : 'iPhone / Mac：'}</b> {isEn ? 'Download via Safari, open .ics file and tap "Add All"; or drag into Mac Calendar App.' : '用 Safari 导出后点击下载的 .ics 文件，选择「添加全部」；或在 Mac「日历」App 中“文件 → 导入”。'}</li>
          <li><b>{isEn ? 'Google Calendar:' : 'Google 日历：'}</b> {isEn ? 'Open calendar.google.com -> Settings -> Import & Export -> choose .ics file.' : '电脑打开 calendar.google.com → 设置 → 导入和导出 → 选择 .ics 文件；建议先新建一个“课程表”日历再导入，方便整体删除。'}</li>
          <li><b>{isEn ? 'Android phones:' : '安卓手机：'}</b> {isEn ? 'Most system calendars can open .ics files directly; or sync via Google Calendar / Outlook.' : '多数系统日历可直接打开 .ics 文件；若不支持，可先导入 Google 日历或 Outlook 再同步。'}</li>
          <li>{isEn ? 'Reminders are handled by each calendar App. Check your calendar settings after importing.' : '提醒由各日历 App 执行，部分日历导入时会忽略文件里的提醒设置，请导入后抽查一节课。'}</li>
        </ul>
      </details>
    </section>

    <section className="study-card tt-data" aria-labelledby="tt-data-title">
      <h2 id="tt-data-title">{isEn ? 'Backup & Data Management' : '备份与数据管理'}</h2>
      <p className="study-note">{isEn ? 'Schedules are saved automatically in this browser. Export a JSON backup before changing devices or clearing cache.' : '课表自动保存在本浏览器。换手机、换浏览器或清理缓存前，请先导出备份（.json），之后可在任何设备上恢复。'}</p>
      <div className="study-actions">
        <button className="study-btn alt" disabled={!courses.length} onClick={exportBackup}><Download size={16}/>{isEn ? 'Export Backup' : '导出备份'}</button>
        <button className="study-btn alt" onClick={()=>importRef.current?.click()}><FileUp size={16}/>{isEn ? 'Restore from Backup' : '从备份恢复'}</button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden aria-label={isEn ? "Select timetable backup file" : "选择课程表备份文件"} onChange={e=>{const f=e.target.files?.[0];if(f)void importBackup(f);}}/>
        <button className="study-btn alt tt-danger" disabled={!courses.length} onClick={clearAll}><Trash2 size={16}/>{isEn ? 'Clear Timetable' : '清空课表'}</button>
      </div>
      {undoSnapshot&&undoSnapshot.courses.length>0&&<div className="study-subactions"><button onClick={()=>setConfirm({title:isEn ? 'Restore timetable before last clear/replace?' : '恢复上次清空 / 替换前的课表？',action:isEn ? 'Restore' : '确认恢复',body:<p>{isEn ? `Will restore ${undoSnapshot.courses.length} course(s) from snapshot and replace current timetable (${courses.length} courses).` : `将恢复快照中的 ${undoSnapshot.courses.length} 门课程，并替换当前课表（当前 ${courses.length} 门）。`}</p>,run:()=>{const cur=data;restore(undoSnapshot);if(cur.courses.length){writeUndo(cur);setUndoSnapshot(cur);}}})}><RotateCcw size={13} aria-hidden="true"/> {isEn ? `Restore timetable before last clear (${undoSnapshot.courses.length} courses)` : `恢复上次清空 / 替换前的课表（${undoSnapshot.courses.length} 门）`}</button></div>}
    </section>

    {courses.length>0&&<button className="tt-fab" aria-label={isEn ? "Add course" : "添加课程"} onClick={()=>openNew()}><Plus size={26}/></button>}

    {editor&&<CourseEditor key={editor.course.id} initial={editor.course} isNew={editor.isNew} settings={settings} courses={courses} isEn={isEn}
      onCancel={()=>setEditor(null)} onSave={saveCourse} onDelete={c=>setConfirm({title:isEn ? `Delete "${c.name}"?` : `删除「${c.name}」？`,danger:true,action:isEn ? 'Delete' : '删除',body:<p>{WEEKDAY_LABELS[c.weekday-1]} {isEn ? `Period ${c.startPeriod}-${c.endPeriod}` : `第 ${c.startPeriod}-${c.endPeriod} 节`} · {describeWeeks(c,settings.totalWeeks)}。{isEn ? 'Can be undone in notification.' : '删除后可在提示中撤销。'}</p>,run:()=>deleteCourse(c)})}/>}
    {confirm&&<ConfirmDialog {...confirm} onClose={()=>setConfirm(null)} isEn={isEn}/>}
    {toast&&<div className="tt-toast" role="status"><span>{toast.text}</span>{toast.undo&&<button onClick={()=>{const u=toast.undo!;setToast(null);restore(u);}}>{isEn ? 'Undo' : '撤销'}</button>}<button aria-label={isEn ? "Close message" : "关闭提示"} onClick={()=>setToast(null)}><X size={15}/></button></div>}
  </ToolPage>;
}

/** 同一天时间重叠的课程分到并排的“车道”，冲突时并排显示而不是互相遮挡。 */
function layoutBlocks(list:Course[]):{course:Course;lane:number;lanes:number}[]{
  const out:{course:Course;lane:number;lanes:number}[]=[];
  for(let d=1;d<=7;d++){
    const day=list.filter(c=>c.weekday===d).sort((a,b)=>a.startPeriod-b.startPeriod||b.endPeriod-a.endPeriod);
    let cluster:{course:Course;lane:number}[]=[],clusterEnd=0;
    const flush=()=>{const lanes=Math.max(1,...cluster.map(x=>x.lane+1));for(const x of cluster)out.push({...x,lanes});cluster=[];};
    for(const c of day){
      if(cluster.length&&c.startPeriod>clusterEnd)flush();
      const used=new Set(cluster.filter(x=>x.course.endPeriod>=c.startPeriod).map(x=>x.lane));
      let lane=0;while(used.has(lane))lane++;
      cluster.push({course:c,lane});clusterEnd=Math.max(clusterEnd,c.endPeriod);
    }
    if(cluster.length)flush();
  }
  return out;
}

function CourseList({courses,settings,conflictSet,onEdit,onAdd,isEn}:{courses:Course[];settings:Settings;conflictSet:Set<string>;onEdit:(c:Course)=>void;onAdd:()=>void;isEn:boolean}){
  const groups=useMemo(()=>{const m=new Map<string,Course[]>();for(const c of courses){const k=c.name;m.set(k,[...(m.get(k)??[]),c]);}return [...m.entries()].map(([name,list])=>({name,list:list.sort((a,b)=>a.weekday-b.weekday||a.startPeriod-b.startPeriod)}));},[courses]);
  return <section className="study-card tt-list" aria-labelledby="tt-list-title">
    <div className="study-card-title"><h2 id="tt-list-title">{isEn ? 'All Courses' : '全部课程'}</h2><span className="study-count">{isEn ? `${groups.length} course(s) · ${courses.length} slot(s)` : `${groups.length} 门课 · ${courses.length} 个时间段`}</span></div>
    {courses.length===0?<p className="study-note">{isEn ? 'No courses yet. Tap "+" or click empty grid cell to add.' : '暂无课程。点击右下角 “+” 或课表空白格添加。'}</p>:<ul>
      {groups.map(g=><li key={g.name} className={`tt-group c${g.list[0].color}`}>
        <div className="tt-group-head"><b>{g.name}</b>{g.list[0].teacher&&<small>{g.list[0].teacher}</small>}</div>
        {g.list.map(c=>{const t=courseTime(c,settings.periods),n=courseOccurrences(c,settings).length;return <button key={c.id} className={'tt-slot'+(conflictSet.has(c.id)?' clash':'')} onClick={()=>onEdit(c)} aria-label={`编辑 ${c.name} ${WEEKDAY_LABELS[c.weekday-1]} 第 ${c.startPeriod}-${c.endPeriod} 节`}>
          <span className="tt-slot-main">{WEEKDAY_LABELS[c.weekday-1]} {isEn ? `Period ${c.startPeriod}${c.endPeriod>c.startPeriod?`-${c.endPeriod}`:''}` : `第 ${c.startPeriod}${c.endPeriod>c.startPeriod?`-${c.endPeriod}`:''} 节`}{t?` · ${t.start}-${t.end}`:''}</span>
          <span className="tt-slot-sub">{describeWeeks(c,settings.totalWeeks)} · {isEn ? `${n} times` : `共 ${n} 次`}{c.room?` · ${c.room}`:''}{conflictSet.has(c.id)?(isEn ? ' · Conflict' : ' · 有冲突'):''}</span>
        </button>;})}
      </li>)}
    </ul>}
    <div className="study-actions"><button className="study-btn" onClick={onAdd}><Plus size={16}/>{isEn ? 'Add Course' : '添加课程'}</button></div>
  </section>;
}

function SettingsCard({data,defaultOpen,onSave,onShowWeekend,isEn}:{data:TimetableData;defaultOpen:boolean;onSave:(s:Settings,courses:Course[])=>void;onShowWeekend:(v:Settings['showWeekend'])=>void;isEn:boolean}){
  const [open,setOpen]=useState(defaultOpen);
  const [draft,setDraft]=useState<Settings>(data.settings);
  const [weeksText,setWeeksText]=useState(String(data.settings.totalWeeks));
  const [err,setErr]=useState('');
  const [gen,setGen]=useState({count:'11',first:'08:00',lesson:'45',gap:'10'});
  useEffect(()=>{setDraft(data.settings);setWeeksText(String(data.settings.totalWeeks));},[data.settings]);
  const changed=JSON.stringify({...draft,reminder:0,showWeekend:'auto'})!==JSON.stringify({...data.settings,reminder:0,showWeekend:'auto'})||weeksText!==String(data.settings.totalWeeks);
  const setPeriod=(i:number,key:keyof Period,v:string)=>setDraft(d=>({...d,periods:d.periods.map((p,j)=>j===i?{...p,[key]:v}:p)}));
  const save=()=>{
    const next={...draft,totalWeeks:Number(weeksText)};
    const e=validateSettings(next);if(e){setErr(e);return;}
    const broken:string[]=[];
    const adjusted=data.courses.map(c=>{
      const fixed={...c,endWeek:Math.min(c.endWeek,next.totalWeeks),startWeek:Math.min(c.startWeek,next.totalWeeks),customWeeks:c.customWeeks.filter(w=>w<=next.totalWeeks)};
      if(c.weekRule==='custom'){fixed.startWeek=1;fixed.endWeek=next.totalWeeks;}
      if(validateCourse(fixed,next))broken.push(`${c.name}（${WEEKDAY_LABELS[c.weekday-1]} 第 ${c.startPeriod}-${c.endPeriod} 节）`);
      return fixed;
    });
    if(broken.length){setErr(`以下课程超出新的节次或周次范围，请先修改或删除：${broken.slice(0,5).join('、')}${broken.length>5?` 等 ${broken.length} 条`:''}`);return;}
    setErr('');onSave(next,adjusted);
  };
  const start=parseISODate(draft.termStart);
  return <section className="study-card tt-settings" aria-labelledby="tt-settings-title">
    <button className="tt-collapse" aria-expanded={open} onClick={()=>setOpen(!open)}><h2 id="tt-settings-title">{isEn ? 'Term Settings' : '学期设置'}</h2><span>{isEn ? `Starts ${data.settings.termStart} · ${data.settings.totalWeeks} wks · ${data.settings.periods.length} periods/day ${open?'Collapse':'Expand'}` : `${data.settings.termStart} 开学 · ${data.settings.totalWeeks} 周 · 每天 ${data.settings.periods.length} 节 ${open?'收起':'展开'}`}</span></button>
    {open&&<div className="tt-settings-body">
      <div className="study-fields">
        <label>{isEn ? 'Term Start Date (Week 1)' : '学期开始日期（第 1 周）'}<input type="date" value={draft.termStart} onChange={e=>setDraft(d=>({...d,termStart:e.target.value}))}/>
          <small className="tt-field-hint">{start!==null?`${WEEKDAY_LABELS[weekdayOfDay(start)-1]}；第 1 周按这一天所在的周一至周日计算${weekdayOfDay(start)!==1?'，该日期之前的课不计入':''}。`:'格式：YYYY-MM-DD'}</small></label>
        <label>{isEn ? 'Total Weeks' : '总教学周数'}<input type="number" inputMode="numeric" min={1} max={MAX_WEEKS} value={weeksText} onChange={e=>setWeeksText(e.target.value)}/>
          <small className="tt-field-hint">{(()=>{const n=Number(weeksText);if(start===null||!Number.isInteger(n)||n<1||n>MAX_WEEKS)return `1–${MAX_WEEKS} 周`;const end=start-(weekdayOfDay(start)-1)+n*7-1;return isEn ? `Term ends on ${dayToISO(end)} (Sun)` : `学期结束于 ${dayToISO(end)}（周日）`;})()}</small></label>
      </div>
      <label>{isEn ? 'Weekend columns' : '周末列'}<select value={data.settings.showWeekend} onChange={e=>onShowWeekend(e.target.value as Settings['showWeekend'])}><option value="auto">{isEn ? 'Auto-show when weekend classes exist' : '有周末课程时自动显示'}</option><option value="always">{isEn ? 'Always show Saturday & Sunday' : '总是显示周六、周日'}</option><option value="never">{isEn ? 'Monday to Friday only' : '只显示周一至周五'}</option></select></label>
      <h3 className="tt-subhead">{isEn ? 'Daily Periods Schedule' : '每天节次时间'}</h3>
      <ol className="tt-periods">{draft.periods.map((p,i)=><li key={i}>
        <span>{isEn ? `Period ${i+1}` : `第 ${i+1} 节`}</span>
        <input type="time" aria-label={`第 ${i+1} 节上课时间`} value={p.start} onChange={e=>setPeriod(i,'start',e.target.value)}/>
        <span aria-hidden="true">–</span>
        <input type="time" aria-label={`第 ${i+1} 节下课时间`} value={p.end} onChange={e=>setPeriod(i,'end',e.target.value)}/>
        <button className="tt-icon-btn small" aria-label={`删除第 ${i+1} 节`} disabled={draft.periods.length<=1} onClick={()=>setDraft(d=>({...d,periods:d.periods.filter((_,j)=>j!==i)}))}><X size={16}/></button>
      </li>)}</ol>
      <div className="study-subactions">
        <button disabled={draft.periods.length>=MAX_PERIODS} onClick={()=>setDraft(d=>{const last=d.periods[d.periods.length-1];const [h,m]=(last?.end??'08:00').split(':').map(Number);const s=Math.min(h*60+m+10,23*60),e=Math.min(s+45,23*60+59);const f=(x:number)=>`${pad2(Math.floor(x/60))}:${pad2(x%60)}`;return {...d,periods:[...d.periods,{start:f(s),end:f(e)}]};})}>{isEn ? '+ Add Period' : '+ 添加一节'}</button>
        <button onClick={()=>setDraft(d=>({...d,periods:emptyData().settings.periods}))}>{isEn ? 'Reset to Default 11 Periods' : '恢复默认 11 节'}</button>
      </div>
      <details className="tt-help"><summary>{isEn ? 'Batch generate class periods by rule' : '按规律批量生成节次'}</summary>
        <div className="study-fields tt-gen">
          <label>{isEn ? 'Period count' : '节数'}<input type="number" min={1} max={MAX_PERIODS} value={gen.count} onChange={e=>setGen({...gen,count:e.target.value})}/></label>
          <label>{isEn ? 'Period 1 start' : '第一节开始'}<input type="time" value={gen.first} onChange={e=>setGen({...gen,first:e.target.value})}/></label>
          <label>{isEn ? 'Class duration (min)' : '每节分钟'}<input type="number" min={10} max={180} value={gen.lesson} onChange={e=>setGen({...gen,lesson:e.target.value})}/></label>
          <label>{isEn ? 'Break duration (min)' : '课间分钟'}<input type="number" min={0} max={120} value={gen.gap} onChange={e=>setGen({...gen,gap:e.target.value})}/></label>
        </div>
        <p className="study-note">{isEn ? 'Continuous schedule without lunch break; adjust lunch and evening periods as needed.' : '连续排列，不含午休；生成后可以逐节修改午休和晚课时间。'}</p>
        <button className="study-btn alt" onClick={()=>{const c=Math.min(MAX_PERIODS,Math.max(1,Number(gen.count)||0)),l=Math.max(10,Number(gen.lesson)||45),g=Math.max(0,Number(gen.gap)||0);const p=generatePeriods(c,gen.first,l,g);if(!p.length){setErr(isEn ? 'Failed to generate periods, check parameters.' : '生成失败，请检查参数。');return;}setDraft(d=>({...d,periods:p}));setErr(p.length<c?(isEn ? `Only ${p.length} periods fit in one day.` : `一天内只排得下 ${p.length} 节。`):'');}}>{isEn ? 'Generate Periods (Unsaved)' : '生成节次（未保存）'}</button>
      </details>
      {err&&<div role="alert" className="study-error">{err}</div>}
      <div className="study-actions">
        <button className="study-btn" disabled={!changed} onClick={save}>{isEn ? 'Save Term Settings' : '保存学期设置'}</button>
        <button className="study-btn alt" disabled={!changed} onClick={()=>{setDraft(data.settings);setWeeksText(String(data.settings.totalWeeks));setErr('');}}>{isEn ? 'Cancel Changes' : '撤销修改'}</button>
      </div>
    </div>}
  </section>;
}

function CourseEditor({initial,isNew,settings,courses,onCancel,onSave,onDelete,isEn}:{initial:Course;isNew:boolean;settings:Settings;courses:Course[];onCancel:()=>void;onSave:(c:Course,again:boolean)=>void;onDelete:(c:Course)=>void;isEn:boolean}){
  const [c,setC]=useState<Course>(initial);
  const [weeksText,setWeeksText]=useState(formatWeekList(initial.customWeeks));
  const [weeksErr,setWeeksErr]=useState('');
  const [err,setErr]=useState('');
  const [colorTouched,setColorTouched]=useState(!isNew);
  const nameRef=useRef<HTMLInputElement>(null);
  const set=<K extends keyof Course>(k:K,v:Course[K])=>{setC(o=>({...o,[k]:v}));setErr('');};
  useEffect(()=>{if(isNew)nameRef.current?.focus();const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onCancel();};document.addEventListener('keydown',onKey);const prev=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=prev;};},[isNew,onCancel]);
  const names=useMemo(()=>[...new Set(courses.map(x=>x.name))],[courses]);
  const onName=(name:string)=>{
    setC(o=>{const next={...o,name};const same=courses.find(x=>x.name===name.trim()&&x.id!==o.id);
      if(same&&isNew){if(!o.teacher)next.teacher=same.teacher;if(!o.room)next.room=same.room;next.color=same.color;}
      else if(!colorTouched)next.color=colorForName(name);
      return next;});
    setErr('');
  };
  const n=settings.periods.length;
  const weeks=courseWeeks(c,settings.totalWeeks);
  const occ=courseOccurrences(c,settings);
  const clash=courses.filter(x=>x.id!==c.id).map(x=>({x,w:conflictsBetween(c,x,settings.totalWeeks)})).filter(y=>y.w.length);
  const setRule=(r:WeekRule)=>{setC(o=>({...o,weekRule:r,customWeeks:r==='custom'&&!o.customWeeks.length?courseWeeks({...o,weekRule:'all'},settings.totalWeeks):o.customWeeks}));if(r==='custom'&&!c.customWeeks.length)setWeeksText(formatWeekList(courseWeeks({...c,weekRule:'all'},settings.totalWeeks)));setErr('');};
  const toggleWeek=(w:number)=>{const next=c.customWeeks.includes(w)?c.customWeeks.filter(x=>x!==w):[...c.customWeeks,w].sort((a,b)=>a-b);set('customWeeks',next);setWeeksText(formatWeekList(next));setWeeksErr('');};
  const submit=(again:boolean)=>{
    let next=c;
    if(c.weekRule==='custom'){const p=parseWeekList(weeksText,settings.totalWeeks);if(p.error){setWeeksErr(p.error);return;}next={...c,customWeeks:p.weeks};}
    const e=validateCourse(next,settings);if(e){setErr(e);return;}
    onSave(next,again);
  };
  const timeOf=(i:number,k:'start'|'end')=>settings.periods[i-1]?.[k]??'';
  return <div className="tt-backdrop" onClick={onCancel}>
    <section className="tt-sheet" role="dialog" aria-modal="true" aria-labelledby="tt-editor-title" onClick={e=>e.stopPropagation()}>
      <header className="tt-sheet-head"><h2 id="tt-editor-title">{isEn ? (isNew ? 'Add Course' : 'Edit Course') : (isNew ? '添加课程' : '编辑课程')}</h2><button className="tt-icon-btn" aria-label={isEn ? "Close" : "关闭"} onClick={onCancel}><X size={20}/></button></header>
      <div className="tt-sheet-body">
        <label>{isEn ? 'Course Name' : '课程名称'}<span className="study-req">*</span><input ref={nameRef} value={c.name} maxLength={40} list="tt-names" placeholder={isEn ? "e.g. Advanced Mathematics" : "例如：高等数学"} onChange={e=>onName(e.target.value)}/></label>
        <datalist id="tt-names">{names.map(x=><option key={x} value={x}/>)}</datalist>
        <div className="study-fields">
          <label>{isEn ? 'Teacher' : '教师'}<input value={c.teacher} maxLength={30} placeholder={isEn ? "Optional" : "选填"} onChange={e=>set('teacher',e.target.value)}/></label>
          <label>{isEn ? 'Classroom' : '教室'}<input value={c.room} maxLength={40} placeholder={isEn ? "Optional, e.g. Room 201" : "选填，如 教一 201"} onChange={e=>set('room',e.target.value)}/></label>
        </div>
        <div className="study-field"><span className="study-field-label">{isEn ? 'Day of Week' : '星期'}</span>
          <div className="tt-seg" role="radiogroup" aria-label={isEn ? "Day of week" : "星期"}>{WEEKDAY_SHORT.map((d,i)=><button key={d} role="radio" aria-checked={c.weekday===i+1} className={c.weekday===i+1?'on':''} onClick={()=>set('weekday',(i+1) as Weekday)}>{d}</button>)}</div>
        </div>
        <div className="study-field"><span className="study-field-label">{isEn ? 'Class Period' : '节次'} <small>{timeOf(c.startPeriod,'start')}–{timeOf(c.endPeriod,'end')}</small></span>
          <div className="tt-range">
            <select aria-label={isEn ? "Start period" : "开始节次"} value={c.startPeriod} onChange={e=>{const v=+e.target.value;setC(o=>({...o,startPeriod:v,endPeriod:Math.max(v,o.endPeriod)}));setErr('');}}>{settings.periods.map((p,i)=><option key={i} value={i+1}>{isEn ? `Period ${i+1} ${p.start}` : `第 ${i+1} 节 ${p.start}`}</option>)}</select>
            <span>{isEn ? 'to' : '至'}</span>
            <select aria-label={isEn ? "End period" : "结束节次"} value={c.endPeriod} onChange={e=>{const v=+e.target.value;setC(o=>({...o,endPeriod:v,startPeriod:Math.min(v,o.startPeriod)}));setErr('');}}>{settings.periods.map((p,i)=><option key={i} value={i+1}>{isEn ? `Period ${i+1} ${p.end}` : `第 ${i+1} 节 ${p.end}`}</option>)}</select>
          </div>
          {c.endPeriod>n&&<p className="tt-warn-text">{isEn ? `End period exceeds ${n} daily periods.` : `结束节次超出当前每天 ${n} 节。`}</p>}
        </div>
        <div className="study-field"><span className="study-field-label">{isEn ? 'Active Weeks' : '上课周'}</span>
          <div className="tt-seg" role="radiogroup" aria-label={isEn ? "Week rule" : "周次规则"}>{(['all','odd','even','custom'] as WeekRule[]).map(r=><button key={r} role="radio" aria-checked={c.weekRule===r} className={c.weekRule===r?'on':''} onClick={()=>setRule(r)}>{isEn ? (r==='all'?'Every Week':r==='odd'?'Odd Weeks':r==='even'?'Even Weeks':'Custom') : RULE_LABELS[r]}</button>)}</div>
          {c.weekRule!=='custom'?<div className="tt-range">
            <select aria-label={isEn ? "Start week" : "起始周"} value={c.startWeek} onChange={e=>{const v=+e.target.value;setC(o=>({...o,startWeek:v,endWeek:Math.max(v,o.endWeek)}));setErr('');}}>{Array.from({length:settings.totalWeeks},(_,i)=><option key={i} value={i+1}>{isEn ? `Week ${i+1}` : `第 ${i+1} 周`}</option>)}</select>
            <span>{isEn ? 'to' : '至'}</span>
            <select aria-label={isEn ? "End week" : "结束周"} value={Math.min(c.endWeek,settings.totalWeeks)} onChange={e=>{const v=+e.target.value;setC(o=>({...o,endWeek:v,startWeek:Math.min(v,o.startWeek)}));setErr('');}}>{Array.from({length:settings.totalWeeks},(_,i)=><option key={i} value={i+1}>{isEn ? `Week ${i+1}` : `第 ${i+1} 周`}</option>)}</select>
          </div>:<>
            <div className="tt-weekpick" role="group" aria-label={isEn ? "Select active weeks" : "点选上课周"}>{Array.from({length:settings.totalWeeks},(_,i)=>i+1).map(w=><button key={w} aria-pressed={c.customWeeks.includes(w)} className={c.customWeeks.includes(w)?'on':''} onClick={()=>toggleWeek(w)}>{w}</button>)}</div>
            <label className="tt-inline">{isEn ? 'Or enter directly' : '或直接输入'}<input value={weeksText} placeholder={isEn ? "e.g. 1-4,6,8-10" : "如 1-4,6,8-10"} onChange={e=>{setWeeksText(e.target.value);const p=parseWeekList(e.target.value,settings.totalWeeks);setWeeksErr(p.error??'');if(!p.error)set('customWeeks',p.weeks);}}/></label>
            {weeksErr&&<p className="tt-warn-text" role="alert">{weeksErr}</p>}
            <div className="study-subactions"><button onClick={()=>{const all=Array.from({length:settings.totalWeeks},(_,i)=>i+1);set('customWeeks',all);setWeeksText(formatWeekList(all));setWeeksErr('');}}>{isEn ? 'Select All' : '全选'}</button><button onClick={()=>{set('customWeeks',[]);setWeeksText('');}}>{isEn ? 'Clear' : '清空'}</button></div>
          </>}
        </div>
        <div className="study-field"><span className="study-field-label">{isEn ? 'Card Color' : '卡片颜色'}</span>
          <div className="tt-colors" role="radiogroup" aria-label={isEn ? "Card color" : "卡片颜色"}>{Array.from({length:COLOR_COUNT},(_,i)=><button key={i} role="radio" aria-checked={c.color===i} aria-label={`颜色 ${i+1}`} className={`c${i}`+(c.color===i?' on':'')} onClick={()=>{setColorTouched(true);set('color',i);}}/>)}</div>
        </div>
        <p className="tt-summary" aria-live="polite">{weeks.length&&occ.length?<>共 <b>{occ.length}</b> 次课 · 第 {formatWeekList(weeks)} 周 · 首次 {occ[0].date}（{WEEKDAY_LABELS[c.weekday-1]}）· 末次 {occ[occ.length-1].date}</>:weeks.length?(isEn ? 'All selected weeks precede term start.' : '所选周次都早于学期开始日期，不会生成课次。'):(isEn ? 'No active weeks selected yet.' : '还没有选择上课周。')}</p>
        {clash.length>0&&<div className="tt-clash" role="alert"><TriangleAlert size={15} aria-hidden="true"/><span>与 {clash.map(y=>`「${y.x.name}」（第 ${formatWeekList(y.w)} 周）`).join('、')} 时间冲突。仍可保存，冲突会在课表中并排标出。</span></div>}
        {err&&<div role="alert" className="study-error">{err}</div>}
      </div>
      <footer className="tt-sheet-foot">
        {!isNew&&<button className="study-btn alt tt-danger" onClick={()=>onDelete(c)}><Trash2 size={15}/>{isEn ? 'Delete' : '删除'}</button>}
        <button className="study-btn alt" onClick={()=>submit(true)}>{isEn ? 'Save & Add Another' : '保存并加另一时段'}</button>
        <button className="study-btn" onClick={()=>submit(false)}>{isEn ? 'Save' : '保存'}</button>
      </footer>
    </section>
  </div>;
}

function ConfirmDialog({title,body,action,danger,run,onClose,isEn}:{title:string;body:ReactNode;action:string;danger?:boolean;run:()=>void;onClose:()=>void;isEn?:boolean}){
  const ref=useRef<HTMLButtonElement>(null);
  useEffect(()=>{ref.current?.focus();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k);},[onClose]);
  return <div className="tt-backdrop tt-top" onClick={onClose}>
    <section className="tt-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tt-confirm-title" onClick={e=>e.stopPropagation()}>
      <h2 id="tt-confirm-title">{title}</h2>
      <div className="tt-confirm-body">{body}</div>
      <div className="study-actions"><button className="study-btn alt" ref={ref} onClick={onClose}>{isEn ? 'Cancel' : '取消'}</button><button className={'study-btn'+(danger?' tt-danger-solid':'')} onClick={()=>{onClose();run();}}>{action}</button></div>
    </section>
  </div>;
}
