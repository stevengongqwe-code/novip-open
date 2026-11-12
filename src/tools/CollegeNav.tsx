// NOVIP 大学生导航 · 主组件
// 全部展示数据来自 ./college-nav-data.ts 的真实核验值；组件不编造任何使用步骤。
// 外链：新窗口打开 + rel="noopener noreferrer"，绝不用 iframe 嵌套。
import {useEffect,useMemo,useState} from 'react';
import {ToolPage} from './common';
import {
  NAV_CATEGORIES,NAV_ENTRIES,NAV_FAVORITES_KEY,
  searchNav,filterNav,getFavorites,
  type NavCategory,type NavEntry,type FeeKind,
} from './college-nav-data';

const FEES:('全部'|FeeKind)[]=['全部','免费','部分免费','付费','待确认'];

function domainOf(url:string):string{
  try{const h=new URL(url).hostname;return h.replace(/^www\./,'');}
  catch{return url;}
}
const isInternal=(url:string)=>url.startsWith('/')||url.startsWith('#');

// 站内跳转：与 main.tsx 的 navigate 保持一致（pushState + popstate 事件）
function internalNavigate(href:string){
  history.pushState(null,'',href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({top:0});
}

function badgeFor(e:NavEntry){
  const self=e.category==='NOVIP自有工具';
  if(self)return <span className="cn-badge cn-badge-self">NOVIP自有</span>;
  if(e.official)return <span className="cn-badge cn-badge-official">官方</span>;
  return <span className="cn-badge cn-badge-third">第三方</span>;
}

function verifyLine(e:NavEntry){
  const how=e.status==='verified'?'已实际打开核验':'官方来源确认入口';
  return `核验于 ${e.verifiedAt} · ${how}`;
}

export default function CollegeNav(){
  const [q,setQ]=useState('');
  const [cat,setCat]=useState<'全部'|NavCategory>('全部');
  const [officialOnly,setOfficialOnly]=useState(false);
  const [fee,setFee]=useState<'全部'|FeeKind>('全部');
  const [favOnly,setFavOnly]=useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [favorites,setFavorites]=useState<string[]>(()=>{try{return getFavorites(localStorage);}catch{return [];}});
  const [copyMsg,setCopyMsg]=useState<Record<string,string>>({});
  const [copiedUrl,setCopiedUrl]=useState('');

  useEffect(()=>{try{localStorage.setItem(NAV_FAVORITES_KEY,JSON.stringify(favorites));}catch{/* 收藏持久化非必需 */}},[favorites]);

  const results=useMemo(()=>{
    const found=filterNav(searchNav(NAV_ENTRIES,q),{category:cat,officialOnly,fee});
    return favOnly?found.filter(e=>favorites.includes(e.id)):found;
  },[q,cat,officialOnly,fee,favOnly,favorites]);

  const toggleExpanded=(id:string)=>setExpanded(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const toggleFavorite=(id:string)=>setFavorites(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const scrollToFeedback=()=>{document.querySelector('.study-feedback')?.scrollIntoView({behavior:'smooth',block:'start'});};

  const copyUrl=async(e:NavEntry)=>{
    try{
      await navigator.clipboard.writeText(e.url);
      setCopiedUrl('');
      setCopyMsg(m=>({...m,[e.id]:'已复制'}));
    }catch{
      setCopiedUrl(e.url);
      setCopyMsg(m=>({...m,[e.id]:'浏览器未允许自动复制，请手动复制上方网址'}));
    }
    setTimeout(()=>setCopyMsg(m=>{const n={...m};delete n[e.id];return n;}),3000);
  };

  const reset=()=>{setQ('');setCat('全部');setOfficialOnly(false);setFee('全部');setFavOnly(false);};

  const count=favorites.length;

  return (
  <ToolPage title="大学生导航" description="报名、查成绩、找资源、处理文件——大学要用的网站，这里帮你找。" id="college-nav">
  <style>{`
  .cn-bar{display:flex;flex-direction:column;gap:12px;margin:18px 0}
  .cn-search{width:100%;padding:14px;border:1px solid #a1a1aa;border-radius:10px;font-size:16px}
  .cn-tabs{display:flex;gap:8px;flex-wrap:wrap}
  .cn-tab{padding:9px 14px;border:1px solid #e4e4e7;border-radius:999px;background:#fff;font-size:14px;cursor:pointer;color:#27272a}
  .cn-tab[aria-pressed="true"]{background:#c9232c;border-color:#c9232c;color:#fff}
  .cn-filters{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:14px;color:#52525b}
  .cn-filters select{padding:8px;border:1px solid #a1a1aa;border-radius:8px;font-size:14px}
  .cn-check{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
  .cn-count{font-size:13px;color:#71717a}
  .cn-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:8px 0 20px}
  .cn-card{border:1px solid #e4e4e7;border-radius:12px;padding:16px;background:#fff;display:flex;flex-direction:column;gap:8px}
  .cn-card-top{display:flex;align-items:flex-start;gap:8px}
  .cn-card h3{font-size:16px;margin:0;flex:1;min-width:0}
  .cn-fav{background:none;border:none;font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;color:#a1a1aa}
  .cn-fav[aria-pressed="true"]{color:#c9232c}
  .cn-domain{font-size:12px;color:#71717a;overflow-wrap:anywhere}
  .cn-purpose{font-size:14px;color:#27272a;margin:0}
  .cn-badges{display:flex;gap:6px;flex-wrap:wrap}
  .cn-badge{font-size:12px;padding:3px 10px;border-radius:999px}
  .cn-badge-official{background:#c9232c;color:#fff}
  .cn-badge-third{background:#f4f4f5;color:#52525b}
  .cn-badge-self{background:#c9232c;color:#fff}
  .cn-meta{font-size:12.5px;color:#71717a;margin:0}
  .cn-verify{font-size:12px;color:#71717a;margin:0}
  .cn-actions{display:flex;gap:10px;margin-top:4px;flex-wrap:wrap}
  .cn-btn{padding:10px 18px;border-radius:10px;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block;text-align:center}
  .cn-btn-primary{background:#c9232c;color:#fff;border:1px solid #c9232c}
  .cn-btn-ghost{background:#fff;color:#27272a;border:1px solid #d4d4d8}
  .cn-detail{margin-top:6px;border-top:1px dashed #e4e4e7;padding-top:12px;display:flex;flex-direction:column;gap:8px;font-size:14px}
  .cn-detail h4{font-size:13px;margin:0;color:#52525b;font-weight:600}
  .cn-detail p{margin:0;color:#27272a}
  .cn-sources{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
  .cn-sources a{font-size:12.5px;color:#1d4ed8;overflow-wrap:anywhere}
  .cn-copy-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .cn-copy-row input{flex:1;min-width:0;padding:9px;border:1px solid #d4d4d8;border-radius:8px;font-size:12.5px}
  .cn-wechat{font-size:12px;color:#71717a;margin:0}
  .cn-feedback-link{background:none;border:none;padding:0;color:#1d4ed8;font-size:13px;cursor:pointer;text-decoration:underline;text-align:left}
  .cn-empty{border:1px dashed #a1a1aa;border-radius:12px;padding:28px 20px;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center}
  .cn-empty p{margin:0;color:#52525b}
  .cn-copy-msg{font-size:12.5px;color:#166534;margin:0}
  @media(max-width:760px){.cn-list{grid-template-columns:1fr}}
  `}</style>

  <section className="cn-bar" aria-label="搜索与筛选">
    <label>
      <input className="cn-search" type="search" value={q} onChange={e=>setQ(e.target.value)}
        placeholder="搜索要办的事：试试 四级 / 查学籍 / 考研报名 / 照片太大" aria-label="搜索网站"/>
    </label>
    <p className="cn-count">关键词匹配，来自人工维护清单；不是实时AI回答。</p>
    <div className="cn-tabs" role="group" aria-label="分类">
      {(['全部',...NAV_CATEGORIES] as const).map(c=>(
        <button key={c} className="cn-tab" aria-pressed={cat===c} onClick={()=>setCat(c)}>{c}</button>
      ))}
    </div>
    <div className="cn-filters">
      <label className="cn-check"><input type="checkbox" checked={officialOnly} onChange={e=>setOfficialOnly(e.target.checked)}/>仅看官方入口</label>
      <label>费用：<select value={fee} onChange={e=>setFee(e.target.value as '全部'|FeeKind)} aria-label="按费用筛选">
        {FEES.map(f=><option key={f} value={f}>{f}</option>)}
      </select></label>
      <label className="cn-check"><input type="checkbox" checked={favOnly} onChange={e=>setFavOnly(e.target.checked)}/>我的收藏{count>0?`（${count}）`:''}</label>
    </div>
    <p className="cn-count">共收录 {results.length} 个词条 · 收藏只保存在当前浏览器，可清除，不跨设备同步，不收集个人信息</p>
  </section>

  {results.length===0?(
    <div className="cn-empty" role="status">
      <p>没找到，试试换关键词（如把"四级报名"改成"四级"）。</p>
      <div className="cn-actions">
        <button className="cn-btn cn-btn-ghost" onClick={reset}>浏览全部分类</button>
        <a className="cn-btn cn-btn-primary" href="/tools/wishes" onClick={e=>{e.preventDefault();internalNavigate('/tools/wishes');}}>反馈想收录的网站</a>
      </div>
    </div>
  ):(
    <div className="cn-list">
      {results.map(e=>{
        const open=expanded.has(e.id);
        const internal=isInternal(e.url);
        const fav=favorites.includes(e.id);
        return (
        <article className="cn-card" key={e.id}>
          <div className="cn-card-top">
            <h3>{e.name}</h3>
            <button className="cn-fav" aria-pressed={fav} aria-label={fav?'取消收藏':'收藏'} title={fav?'取消收藏':'收藏'}
              onClick={()=>toggleFavorite(e.id)}>{fav?'★':'☆'}</button>
          </div>
          {!internal&&<p className="cn-domain">{domainOf(e.url)}</p>}
          <p className="cn-purpose">{e.purpose}</p>
          <div className="cn-badges">{badgeFor(e)}</div>
          <p className="cn-meta">费用：{e.fee} · {e.login}</p>
          <p className="cn-verify">{verifyLine(e)}</p>
          <div className="cn-actions">
            {internal
              ?<a className="cn-btn cn-btn-primary" href={e.url} onClick={ev=>{ev.preventDefault();internalNavigate(e.url);}}>进入网站</a>
              :<a className="cn-btn cn-btn-primary" href={e.url} target="_blank" rel="noopener noreferrer">进入网站</a>}
            <button className="cn-btn cn-btn-ghost" aria-expanded={open} onClick={()=>toggleExpanded(e.id)}>{open?'收起说明':'查看说明'}</button>
          </div>
          {open&&(
            <div className="cn-detail">
              <div><h4>适合办什么事</h4><p>{e.scenarios}</p></div>
              <div><h4>注意事项</h4><p>{e.notes}</p></div>
              <div><h4>费用与登录</h4><p>费用：{e.fee}；登录：{e.login}。报名、考试、认证本身的官方收费以官方公布为准。</p></div>
              <div><h4>核验</h4><p>{verifyLine(e)}<br/>核验方式：{e.verifyMethod}</p></div>
              <div><h4>来源</h4>
                <ul className="cn-sources">
                  {e.sources.map(s=><li key={s}><a href={/^https?:\/\//i.test(s)?s:undefined} target="_blank" rel="noopener noreferrer">{s}</a></li>)}
                </ul>
              </div>
              <div><h4>复制网址</h4>
                <div className="cn-copy-row">
                  <input readOnly value={e.url} aria-label="网址" onFocus={ev=>ev.target.select()}/>
                  <button className="cn-btn cn-btn-ghost" onClick={()=>copyUrl(e)}>复制网址</button>
                </div>
                {copiedUrl&&<p className="cn-copy-msg">请手动复制：{copiedUrl}</p>}
                {copyMsg[e.id]&&!copiedUrl&&<p className="cn-copy-msg" role="status">{copyMsg[e.id]}</p>}
              </div>
              <p className="cn-wechat">微信内打不开时：复制网址到系统浏览器打开。</p>
              <button className="cn-feedback-link" onClick={scrollToFeedback}>发现信息有误？反馈错误</button>
            </div>
          )}
        </article>);
      })}
    </div>
  )}
  </ToolPage>);
}
