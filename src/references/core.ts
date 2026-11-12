export type Version='2025'|'2015';
export type RefKind='J'|'M'|'D'|'C'|'EB'|'unknown';
export interface Reference {id:string;number:number;raw:string;kind:RefKind;title:string;authors:string;language:'zh'|'en';institution:boolean;source:string;year:string;volume:string;issue:string;pages:string;place:string;publisher:string;edition:string;others:string;editors:string;online:boolean;url:string;doi:string;accessDate:string;updatedDate:string;conferenceMode:'book'|'chapter'|'meeting';specificPages:boolean;confirmed:boolean;}
export interface School {enabled:boolean;name:string;source:string;allAuthors:boolean;hideDoi:boolean;endPeriod:boolean;}
export const defaultSchool:School={enabled:false,name:'',source:'',allAuthors:false,hideDoi:false,endPeriod:true};
export const source2025='https://xuebaobangong.jmu.edu.cn/zkb/Upload/Park/64b9ba1b-df55-4309-87d4-0d037a497bd0.pdf';
export const source2015='https://journal.ustc.edu.cn/uploadfile/yjsjy/20161108/GB%20T%207714-2015%E4%BF%A1%E6%81%AF%E4%B8%8E%E6%96%87%E7%8C%AE-%E5%8F%82%E8%80%83%E6%96%87%E7%8C%AE%E8%91%97%E5%BD%95%E8%A7%84%E5%88%99.pdf';
export interface Finding {rule:string;level:'error'|'review'|'info';message:string;clause:string;}
export const rules=[
 {id:'R01',name:'版本与学校规范',v25:'2025为默认；学校要求可手动选2015。',v15:'2015为历史规范兼容，不代表现行国家标准。',clause:'官方标准状态',url:'https://std.samr.gov.cn/gb/search/gbDetailed?id=4507EFE13D37CB6AE06397BE0A0A601F'},
 {id:'R03',name:'西文与拼音责任者',v25:'姓完整、首字母大写；汉语拼音名宜全称。不从缩写猜全名。',v15:'西文与拼音姓全大写。用“姓|名”明确姓氏。',clause:'2025 §7.1.1 / 2015 §8.1.1'},
 {id:'R04',name:'作者数量',v25:'不超过3位照录；超过3位可列前3位加等/et al.。',v15:'超过3位列前3位并加等/相应词；学校全列要求可覆盖。',clause:'2025 §7.1.2 / 2015 §8.1.2'},
 {id:'R05',name:'DOI / 永久标识符',v25:'DOI不是一律必填；路径已含PID可不重复。语法检查不证明文献真实。',v15:'按原文著录DOI；路径包含时不重复。不凭空补DOI。',clause:'2025 §7.9 / 2015 §8.7'},
 {id:'R06',name:'学位论文与页码',v25:'授予单位必备；引文页码有则必备，不虚构缺失页码。',v15:'按专著类著录，保留用户提供的引文页码。',clause:'2025 §8.7 表6 / 2015 §4.1'},
 {id:'R07',name:'网络资源日期',v25:'按类型表决定：网站/网页需引用日期；不机械给所有在线文献加引用日期。',v15:'在线资源保留引用日期字段。',clause:'2025 第8章 / 2015 §4.6'},
 {id:'R08',name:'预印本与数据集',v25:'PP是新增代码；DS在2015已存在。首版不生成这两类，保留原文。',v15:'不得机械把预印本套为PP。',clause:'2025 附录A、§8.14–8.15 / 2015 附录B'},
 {id:'R09',name:'符号与人工确认',v25:'不整段替换中文标点；模板仅整理项目分隔。特殊语种、宽度与学校细节需人工核对。',v15:'保留题名内部符号；标准与学校细节需人工核对。',clause:'2025 第6章 / 2015 第7章'}
];
export function blankReference(number=1):Reference{return {id:crypto.randomUUID(),number,raw:'',kind:'J',title:'',authors:'',language:'zh',institution:false,source:'',year:'',volume:'',issue:'',pages:'',place:'',publisher:'',edition:'',others:'',editors:'',online:false,url:'',doi:'',accessDate:'',updatedDate:'',conferenceMode:'chapter',specificPages:false,confirmed:false};}
const tidy=(s:string)=>s.trim();
export function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().startsWith(s);}
export function formatAuthors(input:string,language:'zh'|'en',institution:boolean,version:Version,all=false){
 let a=input.split(/[;；\n]+/).map(tidy).filter(Boolean);const alreadyEtAl=a.some(x=>/^(等|et\s+al\.?)$/i.test(x));a=a.filter(x=>!/^(等|et\s+al\.?)$/i.test(x));
 const shorten=alreadyEtAl||(!all&&a.length>3);if(shorten)a=a.slice(0,3);
 a=a.map(name=>{if(institution||language==='zh'||!name.includes('|'))return name;const [family,...given]=name.split('|');const f=family.trim();return `${version==='2015'?f.toUpperCase():f.charAt(0).toUpperCase()+f.slice(1)} ${given.join(' ').trim()}`.trim();});
 return a.join(', ')+(shorten?(language==='zh'?', 等':', et al.'):'');
}
export function findings(r:Reference,v:Version):Finding[]{
 const f:Finding[]=[];const add=(rule:string,level:Finding['level'],message:string,clause:string)=>f.push({rule,level,message,clause});
 if(r.kind==='unknown'){add('R08','error','此条未识别或类型暂不支持，原文已保留。','2025 附录A / 当前MVP边界');return f;}
 if(!r.title.trim())add('R10','error','请填写题名，不会自动补造。',v==='2025'?'第8章各类型项目表':'第4章');
 if(r.kind==='D'&&!r.publisher.trim())add('R06',v==='2025'?'error':'review','请填写或核对学位授予单位。',v==='2025'?'§8.7 表6':'§4.1');
 if(r.kind==='J'&&!r.source.trim())add('R10','review','刊名未填写：若原文存在，应按原文补充。',v==='2025'?'§8.5 表4':'§4.4');
 if(r.kind==='C'&&r.conferenceMode!=='book'&&!r.source.trim())add('R10','review','会议录或会议名称未填，请核对会议形式。',v==='2025'?'§8.6':'§4.2');
 if(r.kind==='C'&&r.conferenceMode==='meeting'&&v==='2015')add('R08','error','2015模式暂不自动生成无出版信息的会议条目，请手工核对或改选出版类会议录。','2015 §4.1–4.2 / 当前边界');
 if(!r.year&&r.kind!=='EB')add('R10','review','年份未填，若原文存在请补充；不会猜测出版年。',v==='2025'?'第8章项目表':'第4章');
 if(r.year&&!/^\d{4}(-\d{2}-\d{2})?$/.test(r.year))add('R10','review','当前年份模板支持YYYY或YYYY-MM-DD；其他纪年请人工著录。',v==='2025'?'§7.5.4':'§8.4.4');
 if(/^\d{4}-/.test(r.year)&&!validDate(r.year))add('R10','error','日期不是有效的YYYY-MM-DD。',v==='2025'?'§7.6':'§8.4.4');
 const online=r.online||r.kind==='EB';
 if(online&&!/^https?:\/\/[^\s]+$/i.test(r.url))add('R07','error','在线资源需要填写完整http/https访问路径。',v==='2025'?'§7.8及第8章':'§4.6、§8.6');
 if((r.kind==='EB'||(online&&v==='2015'))&&!validDate(r.accessDate))add('R07','error','请填写有效引用日期；不会自动用今天代填。',v==='2025'?'§8.11 表10/11':'§4.6');
 if(r.updatedDate&&!validDate(r.updatedDate))add('R07','error','创建/修改日期格式应为有效YYYY-MM-DD。',v==='2025'?'§7.6':'§8.4.4');
 if(r.specificPages&&!r.pages)add('R06','error','你选择了引用具体页，请补引文页码或取消此选项。',v==='2025'?'§7.7、§8.7 表6':'§8.5');
 if(r.doi&&!/^10\.\d{4,9}\/\S+$/i.test(r.doi.replace(/^https?:\/\/doi\.org\//i,'').replace(/^doi:\s*/i,'')))add('R05','review','DOI语法疑似异常，请核对原文；此检查不联网验真。',v==='2025'?'§7.9':'§8.7');
 if(r.language==='en'&&!r.institution&&r.authors.split(/[;；\n]+/).some(a=>a.trim()&&!a.includes('|')&&!/^(等|et\s+al\.?)$/i.test(a.trim())))add('R03','review','西文个人作者请用“姓|名”逐人填写；未明确姓氏的部分保持原样，不猜测。',v==='2025'?'§7.1.1':'§8.1.1');
 if(r.raw&&!r.confirmed)add('CONFIRM','review','导入结果需逐项核对，确认后才可复制/导出。','输入解析边界');
 return f;
}
export function renderReference(r:Reference,v:Version,school:School=defaultSchool):string {
 if(r.kind==='unknown')return r.raw;
 const s=school.enabled?school:defaultSchool,online=r.online||r.kind==='EB',tag=`[${r.kind}${online?'/OL':''}]`;
 const author=formatAuthors(r.authors,r.language,r.institution,v,s.allAuthors);const prefix=author?author+'. ':'';
 const pub=[r.place.trim(),r.publisher.trim()].filter(Boolean).join(': ');
 let body='';
 if(r.kind==='J')body=prefix+r.title+tag+'. '+(r.others?r.others+'. ':'')+r.source+(r.year?', '+r.year:'')+(r.volume?', '+r.volume:'')+(r.issue?`(${r.issue})`:'')+(r.pages?': '+r.pages:'');
 else if(r.kind==='EB')body=prefix+r.title+tag+'. '+(r.updatedDate?'('+r.updatedDate+')':'')+`[${r.accessDate}]`;
 else if(r.kind==='C'&&r.conferenceMode==='meeting')body=prefix+r.title+tag+'//'+r.source+(r.year?', '+r.year:'')+(r.pages?': '+r.pages:'');
 else if(r.kind==='C'&&r.conferenceMode==='chapter')body=prefix+r.title+tag+'//'+(r.editors?formatAuthors(r.editors,r.language,r.institution,v,s.allAuthors)+'. ':'')+r.source+'. '+[pub,r.year].filter(Boolean).join(', ')+(r.pages?': '+r.pages:'');
 else body=prefix+r.title+tag+'. '+(r.others?r.others+'. ':'')+(r.edition?r.edition+'. ':'')+[pub,r.year].filter(Boolean).join(', ')+(r.pages?': '+r.pages:'');
 if(online&&v==='2015'&&r.kind!=='EB')body+=`[${r.accessDate}]`;
 if(online&&r.url)body+='. '+r.url;
 const doi=r.doi.trim().replace(/^https?:\/\/doi\.org\//i,'').replace(/^doi:\s*/i,'');
 let decoded=r.url;try{decoded=decodeURIComponent(r.url);}catch{/* preserve malformed URL for manual review */}
 if(doi&&!s.hideDoi&&!decoded.toLowerCase().includes(doi.toLowerCase()))body+='. DOI:'+doi;
 return `[${r.number}] ${body.trim()}${s.endPeriod&&!body.trim().endsWith('.')?'.':''}`;
}
export function sequenceProblems(items:Reference[]):string[]{const seen=new Set<number>(),f:string[]=[];items.forEach((r,i)=>{if(!Number.isSafeInteger(r.number)||r.number<1)f.push(`第${i+1}条编号无效`);else if(seen.has(r.number))f.push(`编号[${r.number}]重复`);if(r.number!==i+1)f.push(`第${i+1}条不是连续编号[${i+1}]`);seen.add(r.number);});return [...new Set(f)];}
// Deliberately narrow parser: only explicit type markers and complete, recognisable skeletons.
// Every imported entry requires human confirmation. Unknown inputs are never discarded.
export function parseReferences(text:string):Reference[]{
 if(new TextEncoder().encode(text).length>2*1024*1024)throw new Error('题录文本超过2MB，请分批处理。');
 const lines=text.trim().split(/\r?\n/).filter(x=>x.trim());if(lines.length>200)throw new Error('最多200条。每条请放在同一行，换行条目先手工整理。');
 return lines.map((raw,i)=>{
  const r=blankReference(i+1);r.raw=raw;const n=raw.match(/^\s*\[(\d+)\]\s*/);if(n)r.number=+n[1];const value=raw.replace(/^\s*\[\d+\]\s*/,'');
  const m=value.match(/^(.+?)\[(J|M|D|C|EB)(\/OL)?\][.．]?\s*(.*)$/i);if(!m){r.kind='unknown';return r;}
  r.kind=m[2].toUpperCase() as RefKind;r.online=!!m[3]||r.kind==='EB';
  // Split at the first project delimiter. Western initials/abbreviations remain manual.
  const head=m[1].match(/^([^\.．]+)[.．]\s*(.+)$/);if(head){r.authors=head[1].split(/[,，]/).map(tidy).join('; ');r.title=head[2].trim();}else r.title=m[1].trim();
  r.language=/[\u3400-\u9fff]/.test(r.authors+r.title)?'zh':'en';
  let tail=m[4].trim();
  // Extract an explicit DOI field first so a DOI URL is not mistaken for the access URL.
  const doi=tail.match(/(?:^|[.．\s])DOI[:：]\s*(\S+)/i);if(doi){r.doi=doi[1].replace(/[.。．]$/,'');tail=tail.replace(doi[0],'').trim();}
  const u=tail.match(/https?:\/\/\S+/i);if(u){r.url=u[0].replace(/[.。．]$/,'');tail=tail.replace(u[0],'').trim();}
  const access=tail.match(/\[(\d{4}-\d{2}-\d{2})\]/);if(access){r.accessDate=access[1];tail=tail.replace(access[0],'');}
  if(r.kind==='J'){
   const t=tail.match(/^(.+?)[,，]\s*(\d{4}(?:-\d{2}-\d{2})?)(?:[,，]\s*([^():：.．]+))?(?:[（(]([^）)]+)[）)])?(?:[:：]\s*([^\.．]+))?[.．]?\s*$/);
   if(t){[,r.source,r.year]=t;r.volume=(t[3]||'').trim();r.issue=(t[4]||'').trim();r.pages=(t[5]||'').trim();}else{r.kind='unknown';return r;}
  }else if(r.kind==='M'||r.kind==='D'){
   const t=tail.match(/^([^:：.．]+)[:：]\s*([^,，.．]+)[,，]\s*(\d{4})(?:[:：]\s*([^\.．]+))?[.．]?\s*$/);
   if(t){[,r.place,r.publisher,r.year]=t;r.pages=(t[4]||'').trim();}else{r.kind='unknown';return r;}
  }else if(r.kind==='C'){r.kind='unknown';return r;} // proceedings form must be explicitly chosen
  else{const date=tail.match(/[（(](\d{4}-\d{2}-\d{2})[）)]/);if(date)r.updatedDate=date[1];if(tail.replace(date?.[0]||'','').replace(/[.．\s]/g,'')){r.kind='unknown';return r;}}
  return r;
 });
}
export function exportable(items:Reference[],v:Version){return items.length>0&&!sequenceProblems(items).length&&items.every(r=>r.confirmed&&!findings(r,v).some(f=>f.level==='error'));}
export const examples=()=>[
 {...blankReference(1),kind:'J' as const,authors:'于潇; 刘义; 柴跃廷; 等',title:'互联网药品可信交易环境中主体资质审核备案模式',source:'清华大学学报（自然科学版）',year:'2012',volume:'52',issue:'11',pages:'1518-1523'},
 {...blankReference(2),kind:'M' as const,authors:'张伯伟',title:'全唐五代诗格汇考',place:'南京',publisher:'江苏古籍出版社',year:'2002',pages:'288'},
 {...blankReference(3),kind:'D' as const,authors:'王琦',title:'融合星载GNSS-R和SAR数据的高时空分辨率土壤湿度反演方法研究',place:'武汉',publisher:'武汉大学',year:'2022',pages:'87'},
 {...blankReference(4),kind:'C' as const,authors:'李妍; 王莹',title:'医疗机构保洁人员“一前五后”手卫生干预效果研究',source:'中华预防医学会医院感染控制分会第31次全国医院感染学术年会',year:'2022',pages:'2',conferenceMode:'meeting' as const},
 {...blankReference(5),kind:'EB' as const,title:'中国国家博物馆',online:true,url:'https://www.chnmuseum.cn/',accessDate:'2025-05-06'}
];
