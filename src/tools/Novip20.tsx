import {useEffect,useState} from 'react';
import {ToolPage,saveLocal} from './common';
import {
  NOVIP20_KEYS,wrongbookProgress,budgetSummary,workShiftMinutes,workSummary,
  matrixSummary,speechSummary,csvText,
  type FlashCard,type BudgetExpense,type WorkShift,type MatrixTask,
} from './novip20-core';
import './novip20.css';

function newId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
function useSaved<T>(key:string,initial:T){
  const [value,setValue]=useState<T>(()=>{
    if(typeof window==='undefined')return initial;
    try{const raw=window.localStorage.getItem(key);return raw===null?initial:JSON.parse(raw) as T;}
    catch{return initial;}
  });
  useEffect(()=>{try{window.localStorage.setItem(key,JSON.stringify(value));}catch{/* private browsing / quota */}},[key,value]);
  return [value,setValue] as const;
}
function exportCsv(rows:(string|number)[][],filename:string){
  saveLocal(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}),filename);
}
function exportJson(value:unknown,filename:string){
  saveLocal(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),filename);
}
const money=(n:number)=>'¥'+n.toFixed(2);
const localPrivacy='隐私：所有输入仅在当前浏览器本地处理。记录保存在此设备的 localStorage 中，不上传服务器；可在页面内清空。清理浏览器数据或换设备将失去记录，重要内容请导出备份。';

export function Wrongbook20(){
  const [cards,setCards]=useSaved<FlashCard[]>(NOVIP20_KEYS.mistakes,[]);
  const [question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[tag,setTag]=useState('');
  const [active,setActive]=useState(''),[reveal,setReveal]=useState(false),[notice,setNotice]=useState('');
  const valid=Array.isArray(cards)?cards:[];
  const progress=wrongbookProgress(valid);
  const pending=valid.filter(c=>!c.mastered);
  const focus=valid.find(c=>c.id===active)??pending[0]??valid[0];
  function add(){
    if(!question.trim()||!answer.trim()){setNotice('题目和答案都需要填写。');return;}
    if(valid.length>=120){setNotice('最多记录120道；请先导出备份并整理。');return;}
    const card:FlashCard={id:newId(),question:question.trim().slice(0,1000),answer:answer.trim().slice(0,2000),tag:tag.trim().slice(0,40),mastered:false};
    setCards([card,...valid]);setActive(card.id);setReveal(false);setQuestion('');setAnswer('');setTag('');setNotice('错题已保存到本机。');
  }
  return <ToolPage id="wrongbook" title="错题本 · 主动回忆复习" description="记录知识点与答案，先独立作答再翻看答案，一键标记已掌握。记录只存在当前设备，可导出JSON备份。" privacy={localPrivacy}>
    <div className="novip20-layout">
      <section className="novip20-card">
        <h2>添加错题</h2>
        <label>题目 / 知识点<textarea maxLength={1000} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="例如：什么是风险分析的四个环节？"/></label>
        <label>正确答案<textarea maxLength={2000} rows={3} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="先记录正确答案，复习时默认隐藏"/></label>
        <label>学科标签<input maxLength={40} value={tag} onChange={e=>setTag(e.target.value)} placeholder="例如：兽医公共卫生"/></label>
        <div className="novip20-actions"><button className="study-btn" onClick={add}>保存错题</button><button className="study-btn alt" disabled={!valid.length} onClick={()=>exportJson(valid,'novip-错题本.json')}>导出备份</button><button className="study-btn alt" disabled={!valid.length} onClick={()=>{if(window.confirm('确定删除当前设备上的全部错题吗？')){setCards([]);setActive('');setNotice('已清空本机错题。');}}}>清空全部</button></div>
        {notice&&<p role="status">{notice}</p>}
      </section>
      <section className="novip20-card">
        <h2>复习进度</h2>
        <div className="novip20-statline"><strong>{progress.pending}</strong><span>待掌握</span><strong>{progress.mastered}</strong><span>已掌握</span><strong>{progress.percent}%</strong><span>掌握率</span></div>
        <progress max={100} value={progress.percent} aria-label="错题掌握率"/>
        {focus?<div className="novip20-focus">
          <p className="novip20-subtle">{focus.tag||'未分类'} · {focus.mastered?'已掌握':'待复习'}</p>
          <h3>{focus.question}</h3>
          {reveal?<div className="novip20-answer"><strong>参考答案</strong><p>{focus.answer}</p></div>:<p className="novip20-subtle">先回想答案，再点“查看答案”。</p>}
          <div className="novip20-actions">
            <button className="study-btn" onClick={()=>setReveal(v=>!v)}>{reveal?'隐藏答案':'查看答案'}</button>
            <button className="study-btn alt" onClick={()=>{setCards(valid.map(c=>c.id===focus.id?{...c,mastered:!c.mastered}:c));setReveal(false);}}>{focus.mastered?'重新列入复习':'我已掌握 ✓'}</button>
            <button className="study-btn alt" onClick={()=>{const pool=pending.length?pending:valid;setActive(pool[Math.floor(Math.random()*pool.length)].id);setReveal(false);}}>随机复习</button>
          </div>
        </div>:<p className="novip20-subtle">错题本为空。添加第一道题开始复习。</p>}
        {!!valid.length&&<div className="novip20-items">{valid.slice(0,120).map(c=><div key={c.id} className="novip20-item"><button className="novip20-link" onClick={()=>{setActive(c.id);setReveal(false);}}>{c.mastered?'✓ ':''}{c.question.slice(0,48)}</button><button aria-label="删除错题" className="novip20-remove" onClick={()=>setCards(valid.filter(x=>x.id!==c.id))}>删除</button></div>)}</div>}
      </section>
    </div>
  </ToolPage>;
}

export function Budget20(){
  const [limit,setLimit]=useSaved<number>(NOVIP20_KEYS.budgetLimit,1500);
  const [items,setItems]=useSaved<BudgetExpense[]>(NOVIP20_KEYS.budget,[]);
  const [category,setCategory]=useState('餐饮'),[note,setNote]=useState(''),[amount,setAmount]=useState(''),[msg,setMsg]=useState('');
  const list=Array.isArray(items)?items:[],sum=budgetSummary(Math.max(0,Number(limit)||0),list);
  function add(){
    const num=Number(amount);
    if(!Number.isFinite(num)||num<=0||num>100000){setMsg('请输入 0–100000 元之间的有效支出金额。');return;}
    if(list.length>=150){setMsg('最多150笔，请先导出记录。');return;}
    setItems([{id:newId(),date:new Date().toISOString().slice(0,10),category,note:note.trim().slice(0,60),amount:Math.round(num*100)/100},...list]);
    setNote('');setAmount('');setMsg('支出已保存在本机。');
  }
  return <ToolPage id="campus-budget" title="大学生生活费预算账本" description="按餐饮、交通、学习与其他分类记录每日支出，自动看本月预算使用情况；无需账号、没有云端同步。" privacy={localPrivacy}>
    <div className="novip20-layout">
      <section className="novip20-card"><h2>预算与记账</h2>
        <label>本期预算（元）<input type="number" min={0} max={1000000} step="0.01" value={limit} onChange={e=>setLimit(Math.min(1000000,Math.max(0,Number(e.target.value)||0)))}/></label>
        <label>支出分类<select value={category} onChange={e=>setCategory(e.target.value)}>{['餐饮','交通','学习','住宿','娱乐','购物','其他'].map(c=><option key={c}>{c}</option>)}</select></label>
        <label>金额（元）<input type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="例如：12.50"/></label>
        <label>说明（选填）<input maxLength={60} value={note} onChange={e=>setNote(e.target.value)} placeholder="例如：食堂午餐"/></label>
        <div className="novip20-actions"><button className="study-btn" onClick={add}>记一笔支出</button><button className="study-btn alt" disabled={!list.length} onClick={()=>exportCsv([['日期','分类','金额（元）','备注'],...list.map(e=>[e.date,e.category,e.amount,e.note])],'novip-生活费.csv')}>导出CSV</button><button className="study-btn alt" disabled={!list.length} onClick={()=>{if(window.confirm('清空当前设备的所有生活费记录？'))setItems([]);}}>清空记录</button></div>
        {msg&&<p role="status">{msg}</p>}
      </section>
      <section className="novip20-card"><h2>预算实时概览</h2>
        <div className="novip20-statline"><strong>{money(sum.spent)}</strong><span>已支出</span><strong>{money(sum.remaining)}</strong><span>{sum.remaining<0?'已超支':'可用余额'}</span></div>
        <progress max={100} value={Math.min(100,sum.percent)} aria-label="预算使用比例"/>
        <p className="novip20-subtle">已使用预算 {sum.percent}% · 每期自行清空，暂不按月份自动归档。</p>
        <div className="novip20-items">{list.length?list.map(e=><div key={e.id} className="novip20-item"><span><strong>{e.category}</strong> · {e.note||e.date}</span><span>{money(e.amount)} <button className="novip20-remove" onClick={()=>setItems(list.filter(x=>x.id!==e.id))}>删除</button></span></div>):<p>暂无支出记录。</p>}</div>
      </section>
    </div>
  </ToolPage>;
}

export function InternshipHours20(){
  const [shifts,setShifts]=useSaved<WorkShift[]>(NOVIP20_KEYS.shifts,[]);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10)),[start,setStart]=useState('09:00'),[end,setEnd]=useState('18:00');
  const [rest,setRest]=useState('60'),[rate,setRate]=useState('18'),[error,setError]=useState('');
  const list=Array.isArray(shifts)?shifts:[],summary=workSummary(list);
  function add(){
    try{
      if(!date)throw new Error('请选择日期');
      const breakMinutes=Number(rest),hourlyRate=Number(rate);
      workShiftMinutes(start,end,breakMinutes);
      if(!Number.isFinite(hourlyRate)||hourlyRate<0||hourlyRate>100000)throw new Error('时薪范围必须是0–100000元');
      if(list.length>=120)throw new Error('最多120条记录，请先导出。');
      setShifts([{id:newId(),date,start,end,breakMinutes,hourlyRate},...list]);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'输入无效');}
  }
  return <ToolPage id="internship-hours" title="实习工时与报酬结算" description="登记每天上下班、休息时长与时薪，自动汇总工时与预计报酬。支持跨午夜班次；结果仅供对账，不代表劳动法规认定。" privacy={localPrivacy}>
    <div className="novip20-layout">
      <section className="novip20-card"><h2>登记班次</h2>
        <label>日期<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <div className="novip20-pair"><label>上班<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>下班<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
        <div className="novip20-pair"><label>休息（分钟）<input type="number" min={0} max={1439} step={1} value={rest} onChange={e=>setRest(e.target.value)}/></label><label>时薪（元）<input type="number" min={0} max={100000} step="0.01" value={rate} onChange={e=>setRate(e.target.value)}/></label></div>
        <div className="novip20-actions"><button className="study-btn" onClick={add}>添加班次</button><button className="study-btn alt" disabled={!list.length} onClick={()=>exportCsv([['日期','上班','下班','休息分钟','工时小时','时薪','预计报酬'],...list.map(s=>[s.date,s.start,s.end,s.breakMinutes,(workShiftMinutes(s.start,s.end,s.breakMinutes)/60).toFixed(2),s.hourlyRate,(workShiftMinutes(s.start,s.end,s.breakMinutes)/60*s.hourlyRate).toFixed(2)])],'novip-实习工时.csv')}>导出工时表</button><button className="study-btn alt" disabled={!list.length} onClick={()=>{if(window.confirm('清空全部工时记录？'))setShifts([]);}}>清空</button></div>
        {error&&<p role="alert">{error}</p>}
        <p className="novip20-subtle">跨午夜：如 20:00 至次日 02:00，自动按 6 小时计算；不自动计算加班、税费、社保及法定补贴。</p>
      </section>
      <section className="novip20-card"><h2>结算概览</h2>
        <div className="novip20-statline"><strong>{summary.hours.toFixed(2)} h</strong><span>累计工时</span><strong>{money(summary.earnings)}</strong><span>预计报酬</span></div>
        <div className="novip20-items">{list.length?list.map(s=><div key={s.id} className="novip20-item"><span>{s.date} · {s.start}–{s.end} · {(workShiftMinutes(s.start,s.end,s.breakMinutes)/60).toFixed(2)}h</span><span>{money(workShiftMinutes(s.start,s.end,s.breakMinutes)/60*s.hourlyRate)} <button className="novip20-remove" onClick={()=>setShifts(list.filter(x=>x.id!==s.id))}>删除</button></span></div>):<p>暂无班次。</p>}</div>
      </section>
    </div>
  </ToolPage>;
}

const quadrantTitles=['重要且紧急 · 立即做','重要不紧急 · 计划做','不重要但紧急 · 快速处理','不重要不紧急 · 考虑舍弃'];
export function PriorityMatrix20(){
  const [tasks,setTasks]=useSaved<MatrixTask[]>(NOVIP20_KEYS.matrix,[]);
  const [title,setTitle]=useState(''),[urgent,setUrgent]=useState(false),[important,setImportant]=useState(true),[message,setMessage]=useState('');
  const list=Array.isArray(tasks)?tasks:[],summary=matrixSummary(list);
  function add(){
    if(!title.trim()){setMessage('请输入具体任务');return;}
    if(list.length>=120){setMessage('任务已达120项，请先完成或删除部分任务。');return;}
    setTasks([{id:newId(),title:title.trim().slice(0,120),urgent,important,done:false},...list]);
    setTitle('');setMessage('');
  }
  return <ToolPage id="priority-matrix" title="四象限任务管理" description="将学习、实习、社团与生活任务按重要/紧急程度分类，减少被琐事带着走。任务只保存在当前设备。" privacy={localPrivacy}>
    <section className="novip20-card"><h2>新建任务</h2>
      <label>任务名称<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add();}} placeholder="例如：完成毕业论文开题报告"/></label>
      <div className="novip20-actions"><label className="novip20-checkbox"><input type="checkbox" checked={important} onChange={e=>setImportant(e.target.checked)}/>重要</label><label className="novip20-checkbox"><input type="checkbox" checked={urgent} onChange={e=>setUrgent(e.target.checked)}/>紧急</label><button className="study-btn" onClick={add}>加入象限</button><button className="study-btn alt" disabled={!list.length} onClick={()=>exportJson(list,'novip-四象限任务.json')}>备份JSON</button><button className="study-btn alt" disabled={!list.length} onClick={()=>{if(window.confirm('清空全部任务？'))setTasks([]);}}>清空</button></div>
      {message&&<p role="alert">{message}</p>}
      <p className="novip20-subtle">已完成 {summary.done} / {summary.total} 项</p>
    </section>
    <div className="novip20-quadrants">{quadrantTitles.map((name,q)=>{
      const inQuadrant=list.filter(t=>(t.important?0:2)+(t.urgent?0:1)===q);
      return <section key={name} className="novip20-card"><h2>{name} <span className="novip20-subtle">({summary.quadrants[q]})</span></h2>
        {inQuadrant.length?<div className="novip20-items">{inQuadrant.map(t=><div className="novip20-item" key={t.id}><label className="novip20-checkbox"><input type="checkbox" checked={t.done} onChange={()=>setTasks(list.map(x=>x.id===t.id?{...x,done:!x.done}:x))}/><span style={{textDecoration:t.done?'line-through':undefined,opacity:t.done?0.65:1}}>{t.title}</span></label><button className="novip20-remove" onClick={()=>setTasks(list.filter(x=>x.id!==t.id))}>删除</button></div>)}</div>:<p className="novip20-subtle">暂无任务。</p>}
      </section>;
    })}</div>
  </ToolPage>;
}

export function DefensePacer20(){
  const [draft,setDraft]=useState(''),[speed,setSpeed]=useState(240),[target,setTarget]=useState(5),[remaining,setRemaining]=useState(300),[running,setRunning]=useState(false);
  const stats=speechSummary(draft,speed,target);
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>setRemaining(n=>{if(n<=1){setRunning(false);return 0;}return n-1;}),1000);
    return ()=>window.clearInterval(timer);
  },[running]);
  function start(){setRemaining(Math.round(target*60));setRunning(true);}
  return <ToolPage id="defense-pacer" title="论文答辩讲稿测速与计时" description="粘贴讲稿，按照每分钟讲话字数估算演讲时长，开计时器排练；不录音、不联网、不保存讲稿。仅供训练参考。" privacy="隐私：讲稿仅在当前页面内存中处理，不上传、不持久保存，刷新立即清空。所有时长均为估算，请以实际试讲为准。">
    <div className="novip20-layout">
      <section className="novip20-card"><h2>讲稿与演讲参数</h2>
        <label>讲稿<textarea rows={12} value={draft} maxLength={30000} onChange={e=>setDraft(e.target.value)} placeholder="粘贴你的开题/毕业论文答辩讲稿（最多30000字符）"/></label>
        <div className="novip20-pair"><label>演讲语速（计数单位/分钟）<input type="number" min={60} max={600} value={speed} onChange={e=>setSpeed(Math.max(60,Math.min(600,Number(e.target.value)||60)))}/></label><label>目标时长（分钟）<input type="number" min={1} max={180} value={target} onChange={e=>setTarget(Math.max(1,Math.min(180,Number(e.target.value)||1)))}/></label></div>
        <p className="novip20-subtle">估算规则：每个汉字、英文单词、数字串按一个计数单位；实际语速、停顿、图表讲解会造成差异。</p>
      </section>
      <section className="novip20-card"><h2>答辩节奏仪表盘</h2>
        <div className="novip20-statline"><strong>{stats.units}</strong><span>计数单位</span><strong>{stats.estimatedMinutes.toFixed(1)} min</strong><span>预计用时</span></div>
        <p>{stats.differenceMinutes>0.1?'比目标超出约 '+stats.differenceMinutes.toFixed(1)+' 分钟':stats.differenceMinutes< -0.1?'比目标少约 '+Math.abs(stats.differenceMinutes).toFixed(1)+' 分钟':'预计接近目标时长'}。目标推荐约 {stats.recommendedUnits} 个计数单位。</p>
        <div className="novip20-clock" role="timer" aria-live="off">{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</div>
        <div className="novip20-actions"><button className="study-btn" onClick={()=>running?setRunning(false):start()}>{running?'暂停排练':'开始 / 重新计时'}</button><button className="study-btn alt" onClick={()=>{setRunning(false);setRemaining(Math.round(target*60));}}>重置计时</button></div>
        <p className="novip20-subtle">计时到 0 会自动停止；手机锁屏或切换后台可能使计时延迟，正式答辩请另备计时设备。</p>
      </section>
    </div>
  </ToolPage>;
}
