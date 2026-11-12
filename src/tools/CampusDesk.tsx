import {useMemo, useRef, useState, type MouseEvent} from 'react';
import {ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Camera, FileStack, Folder, Search, X} from 'lucide-react';
import {LanguageSwitcher, useI18n} from '../i18n';
import {PUBLIC_TOOL_COUNT, SYSTEM_TOOL_IDS, recentTools, tools} from './registry';
import {searchTools} from './search-core';
import {getStoredPinnedTools} from './pinned-core';

type Navigation = (event: MouseEvent<HTMLAnchorElement>) => void;
const groups: Record<string,string> = {'文件工具':'Documents','图片与报名':'Images & ID','学习写作':'Study & writing','数据处理':'Tables','文本工具':'Text','实用计算':'Calculators','开发者工具':'Development','功能许愿池':'Wishlist'};
const featured = [
  {id:'pdf-merge-split', zh:'整理 PDF', en:'Organize PDFs', sub:'合并讲义，拆出要打印的几页。', desc:'Combine handouts or pull out a few pages.', Icon:FileStack, mark:'PDF'},
  {id:'photo', zh:'做报名照', en:'Make an ID photo', sub:'选好规格，调整尺寸和文件大小。', desc:'Resize a photo for your next application.', Icon:Camera, mark:'ID'},
  {id:'timetable', zh:'排课程表', en:'Plan your timetable', sub:'把每周的课导入手机日历。', desc:'Send your weekly classes to your calendar.', Icon:CalendarDays, mark:'ICS'},
] as const;

export default function CampusDesk({navigate, openClassic}: {navigate:Navigation; openClassic:()=>void}) {
  const {lang,dict}=useI18n(), en=lang==='en-US';
  const [q,setQ]=useState(''), [group,setGroup]=useState('');
  const input=useRef<HTMLInputElement>(null), catalog=useRef<HTMLElement>(null);
  const found=useMemo(()=>searchTools(q).filter(t=>!SYSTEM_TOOL_IDS.some(id=>id===t.id) && (!group || t.group===group)),[q,group]);
  const label=(t:typeof tools[number])=>dict.tools[t.id]?.name||t.name;
  const scroll=()=>catalog.current?.scrollIntoView({block:'start'});
  const jump=()=>{scroll(); catalog.current?.focus({preventScroll:true});};
  const [saved]=useState(()=>{ try {return [...new Set([...recentTools(localStorage),...getStoredPinnedTools()])].slice(0,6);} catch {return [];} });
  return <div className="campus-desk">
    <header className="desk-bar"><div className="desk-wrap desk-bar-in">
      <a className="desk-brand" href="/" onClick={navigate}><span aria-hidden="true"><BookOpen size={21}/></span>NOVIP</a>
      <nav aria-label={en?'Navigation':'主导航'}><button onClick={jump}>{en?'Tool index':'工具目录'}</button><a href="/nav" onClick={navigate}>{en?'Campus links':'校园导航'}</a></nav>
      <LanguageSwitcher compact/>
    </div></header>
    <main className="desk-wrap">
      <section className="desk-cover">
        <div className="desk-intro"><div className="desk-edition"><span/>{en?'Free for students':'大学生免费工具站'}</div>
        <h1>{en?'Campus toolkit':'校园工具箱'}</h1>
        <p>{en?'Format a paper, prepare an ID photo, or plan your week. No membership needed.':'从整理课件、准备报名照，到排好一周的课。不用开会员。'}</p>
        <form className="desk-search" role="search" onSubmit={e=>{e.preventDefault();jump();}}>
          <Search aria-hidden="true" size={20}/><input ref={input} type="search" aria-label={en?'Search tools':'搜索工具'} placeholder={en?'Search PDF, ID photos, GPA…':'搜 PDF、证件照、课表…'} value={q} onChange={e=>{setQ(e.target.value);setGroup('');}}/>
          <button type="submit" aria-label={en?'View results':'查看搜索结果'}><ArrowRight size={20}/></button>
        </form></div>
        <img className="desk-folio" src="/campus-folio.svg" width="480" height="300" alt="" fetchPriority="high"/>
      </section>
      {!q.trim() && <section className="desk-shortcuts"><h2>{en?'Quick starts':'常用工具'}</h2><div className="desk-picks">{featured.map(({id,zh,en:title,sub,desc,Icon,mark},i)=>{
        const tool=tools.find(t=>t.id===id)!;
        return <a key={id} href={tool.path} onClick={navigate} className={'desk-pick pick-'+i}><span className="desk-tool-stamp" aria-hidden="true"><Icon size={24}/><small>{mark}</small></span><div><h3>{en?title:zh}</h3><p>{en?desc:sub}</p></div><ArrowUpRight className="desk-arrow" size={16}/></a>;
      })}</div></section>}
      <section className="desk-index" ref={catalog} tabIndex={-1} aria-labelledby="desk-index-title">
        <div className="desk-heading"><h2 id="desk-index-title">{q.trim()?(en?'Search results':'搜索结果'):(en?'Tool index':'工具目录')}</h2><span role="status">{en?found.length+' tools':found.length+' 款工具'}</span></div>
        <div className="desk-filters" aria-label={en?'Categories':'工具分类'}><button aria-pressed={!group} onClick={()=>setGroup('')}>{en?'All':'全部'}</button>{Object.entries(groups).map(([zh,title])=><button key={zh} aria-pressed={group===zh} onClick={()=>setGroup(zh)}>{en?title:zh}</button>)}</div>
        {!q.trim()&&!group&&saved.length>0&&<div className="desk-saved"><Folder size={15}/><span>{en?'My shortcuts':'我的常用'}</span>{saved.map(id=>{const t=tools.find(t=>t.id===id);return t&&<a key={id} href={t.path} onClick={navigate}>{label(t)}</a>;})}</div>}
        <div className="desk-list">{found.map(t=><a key={t.id} href={t.path} onClick={navigate}><div><small>{en?groups[t.group]:t.group}</small><h3>{label(t)}</h3><p>{dict.tools[t.id]?.task||t.task}</p></div><ArrowUpRight size={16}/></a>)}</div>
        {!found.length&&<div className="desk-empty"><p>{en?'No tools match this search. Try “PDF” or “photo”.':'没有找到匹配的工具。可以试试「PDF」或「照片」。'}</p><button onClick={()=>{setQ('');setGroup('');input.current?.focus();}}><X size={15}/>{en?'Clear filters':'清除筛选'}</button></div>}
      </section>
    </main>
    <footer className="desk-wrap desk-foot"><b>NOVIP</b><span>{en?PUBLIC_TOOL_COUNT+' free tools':PUBLIC_TOOL_COUNT+' 款免费工具'}</span><nav><a href="/tools/wishes" onClick={navigate}>{en?'Wishlist':'功能许愿'}</a><a href="/stats" onClick={navigate}>{en?'Site stats':'网站数据'}</a><button onClick={openClassic}>{en?'Classic home':'经典首页'}</button></nav></footer>
  </div>;
}
