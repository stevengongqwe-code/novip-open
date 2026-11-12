import * as XLSX from 'xlsx';
import {zipEntries} from '../conversion/files';
import {DOMParser} from '@xmldom/xmldom';
export const SHEET_LIMITS={files:10,fileBytes:5*1024*1024,totalBytes:20*1024*1024,rows:50000,cols:100,cells:500000};
export type Value=string|number|boolean|null;
export interface Cell {value:Value;display:string;numeric:boolean;}
export interface Grid {id:string;fileId:string;fileName:string;sheetName:string;rows:Cell[][];warnings:string[];}
export interface Column {index:number;original:string;target:string;ignored:boolean;}
export interface SheetConfig {id:string;selected:boolean;headerRow:number;columns:Column[];}
export interface SourceInfo extends SheetConfig {fileId:string;fileName:string;sheetName:string;totalRows:number;preview:string[][];warnings:string[];}
export interface MergeOptions {provenance:boolean;protectIdentifiers:boolean;}
export interface MergeResult {headers:string[];rows:Value[][];audit:{source:string;inputRows:number;blankRows:number;outputRows:number}[];warnings:string[];protectedCells:number;}
export function parseCsv(text:string):string[][] {
 if(text.includes('\0')||/[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('CSV包含二进制/控制字符，不是支持的UTF-8文本。');
 // Detect separators in the first logical record, ignoring quoted punctuation/newlines.
 let inQuotes=false,commas=0,semicolons=0;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(inQuotes&&text[i+1]==='"'){i++;continue;}inQuotes=!inQuotes;}else if(!inQuotes){if(c==='\n'||c==='\r')break;if(c===',')commas++;if(c===';')semicolons++;}}
 const delim=semicolons>commas?';':',';
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 const end=()=>{row.push(field);field='';closed=false;if(row.length>SHEET_LIMITS.cols)throw new Error('最多100列。');};
 const endRow=()=>{end();rows.push(row);row=[];if(rows.length>SHEET_LIMITS.rows+1)throw new Error('最多50000条数据行和1行表头。');};
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
  else if(c==='"'){if(field||closed)throw new Error('CSV引号位置错误，请重新导出标准CSV。');quoted=true;}
  else if(c===delim)end();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
  else{if(closed)throw new Error('CSV结束引号后只能是分隔符或换行。');field+=c;}
  if(field.length>32767)throw new Error('单元格内容过长（最多32767字符）。');
 }
 if(quoted)throw new Error('CSV引号未闭合。');if(field||row.length||closed)endRow();
 if(rows.reduce((n,r)=>n+r.length,0)>SHEET_LIMITS.cells)throw new Error('累计最多50万单元格。');return rows;
}
function preflightXlsx(bytes:Uint8Array){
 const entries=zipEntries(bytes),names=Object.keys(entries);if(!entries['xl/workbook.xml']||!entries['[Content_Types].xml'])throw new Error('真实格式不是XLSX工作簿；不支持XLS、XLSM或伪装扩展名。');
 let cells=0;
 for(const name of names){
  if(!name.endsWith('/')&&/vbaProject|activeX|embeddings|externalLinks/i.test(name))throw new Error('不接受宏、嵌入对象或外部工作簿链接。请导出纯数据XLSX。');
  if(!/\.xml$|\.rels$/i.test(name))continue;
  if(entries[name].length>8*1024*1024)throw new Error('单个XML超过8MB，请拆分表格。');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(entries[name]);
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('不接受DTD、实体或宏文档。');
  let bad=false;let doc:Document|undefined;try{doc=new DOMParser({errorHandler:{warning:()=>{bad=true;},error:()=>{bad=true;},fatalError:()=>{bad=true;}}}).parseFromString(text,'application/xml') as unknown as Document;}catch{bad=true;}if(bad||!doc?.documentElement)throw new Error('XLSX XML损坏，请用Excel/WPS重新保存。');
  if(/\.rels$/i.test(name))for(const rel of Array.from(doc.getElementsByTagName('*')).filter(e=>e.localName==='Relationship')){
   if(rel.getAttribute('TargetMode')?.toLowerCase()==='external'&&rel.getAttribute('Type')!=='http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink')throw new Error('不接受外部工作簿关系，请保存纯数据副本。');
  }
  if(name==='[Content_Types].xml'){const types=Array.from(doc.getElementsByTagName('*')),main=types.find(e=>e.localName==='Override'&&e.getAttribute('PartName')==='/xl/workbook.xml'),fallback=types.find(e=>e.localName==='Default'&&e.getAttribute('Extension')?.toLowerCase()==='xml');if((main??fallback)?.getAttribute('ContentType')!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')throw new Error('工作簿主类型不是普通XLSX，不接受宏文档。');}
  if(name.startsWith('xl/worksheets/')&&name.endsWith('.xml')){
   for(const c of Array.from(doc.getElementsByTagName('*')).filter(e=>e.localName==='c')){const children=Array.from(c.childNodes).filter(n=>n.nodeType===1) as Element[];if(children.some(n=>n.localName==='f')&&!children.some(n=>n.localName==='v'&&n.textContent!==''))throw new Error('公式没有缓存结果，请在Excel/WPS重算并保存后重试。');}
   cells+=(text.match(/<(?:\w+:)?c\b/g)||[]).length;if(cells>SHEET_LIMITS.cells)throw new Error('累计最多50万单元格。');
   for(const match of text.matchAll(/\br=["']([A-Z]+)(\d+)["']/g)){const p=XLSX.utils.decode_cell(match[1]+match[2]);if(p.r>SHEET_LIMITS.rows||p.c>=SHEET_LIMITS.cols)throw new Error('工作表范围超过50001行/100列；请清除多余格式并拆分文件。');}
  }
 }
}
export function readSpreadsheet(bytes:Uint8Array,name:string,fileId:string):Grid[]{
 if(bytes.length>SHEET_LIMITS.fileBytes)throw new Error('单文件不超过5MB。');if(!bytes.length)throw new Error('文件为空。');
 if(/\.csv$/i.test(name)){
  if(bytes[0]===0x50&&bytes[1]===0x4b||bytes[0]===0xd0||bytes[0]===0x89)throw new Error('CSV扩展名与真实二进制格式不符。');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('CSV仅支持UTF-8编码，请在Excel/WPS另存为CSV UTF-8。');}
  const parsed=parseCsv(text),width=parsed.reduce((n,r)=>Math.max(n,r.length),0);
  const rows=parsed.map(r=>Array.from({length:width},(_,i)=>({value:r[i]??'',display:r[i]??'',numeric:false})));
  if(rows.length*width>SHEET_LIMITS.cells)throw new Error('累计最多50万单元格。');
  if(!rows.length)throw new Error('CSV没有内容。');return [{id:fileId+':0',fileId,fileName:name,sheetName:'CSV',rows,warnings:['CSV所有字段按原始文本读取，保留前导零；不自动推断日期或数字。']}];
 }
 if(!/\.xlsx$/i.test(name)||bytes[0]!==80||bytes[1]!==75)throw new Error('只支持真实XLSX及UTF-8 CSV；不支持XLS、XLSM、加密文件。');
 preflightXlsx(bytes);
 let wb:XLSX.WorkBook;try{wb=XLSX.read(bytes,{type:'array',cellNF:true,cellText:true,cellFormula:true,cellDates:false});}catch{throw new Error('工作簿读取失败，请用Excel/WPS重新保存。');}
 if(wb.SheetNames.length>50)throw new Error('工作表超过50个，请拆分文件。');
 const grids:Grid[]=[],date1904=!!wb.Workbook?.WBProps?.date1904;let allCells=0;
 wb.SheetNames.forEach((sheetName,index)=>{
  const sheet=wb.Sheets[sheetName];if(!sheet['!ref'])return;const range=XLSX.utils.decode_range(sheet['!ref']);const height=range.e.r+1,width=range.e.c+1;
  allCells+=height*width;if(height>SHEET_LIMITS.rows+1||width>SHEET_LIMITS.cols||allCells>SHEET_LIMITS.cells)throw new Error('工作簿超过50001行、100列或50万单元格限制。');
  if(sheet['!merges']?.length)throw new Error(`“${sheetName}”含合并单元格，首版不支持复杂表头；请取消合并并补齐数据。`);
  const warnings=new Set<string>(),rows:Cell[][]=[];
  if(Object.values(sheet).some(cell=>cell&&typeof cell==='object'&&'l' in cell))warnings.add('超链接仅保留单元格显示值，不访问或导出链接。');
  if(wb.Workbook?.Sheets?.[index]?.Hidden)warnings.add('此工作表原本隐藏，默认不选中，请确认后再纳入合并。');
  for(let r=0;r<height;r++){const row:Cell[]=[];for(let c=0;c<width;c++){
   const cell=sheet[XLSX.utils.encode_cell({r,c})] as XLSX.CellObject|undefined;
   if(cell?.f&&(cell.v===undefined||cell.t==='z'))throw new Error(`“${sheetName}”的${XLSX.utils.encode_cell({r,c})}公式没有缓存结果，请先在Excel/WPS重算并保存，或粘贴为值。`);
   if(cell?.t==='e')throw new Error(`“${sheetName}”含错误单元格，请修复后重试。`);
   if(cell?.v instanceof Date)throw new Error('日期类型异常，请保存纯数据副本。');
   let value:Value=cell?.v??null;const numeric=cell?.t==='n';let display=cell?String(cell.w??cell.v??''):'';
   if(numeric&&typeof value==='number'&&!Number.isFinite(value))throw new Error('存在无效数字。');
   if(cell?.f)warnings.add('公式只使用文件保存的缓存值，可能过时，不重新计算公式。');
   if(numeric&&typeof value==='number'&&cell?.z&&XLSX.SSF.is_date(cell.z)){
    display=XLSX.SSF.format(cell.z,value,{date1904});value=display;warnings.add('日期/时间按原表显示格式导出为文本，已区分1900/1904系统。');
   }else if(numeric&&typeof value==='number'&&Math.abs(value)>=1e15)warnings.add('发现15位及以上的数值：原Excel可能已经损失精度，无法还原；学号/证件号应在源表保存为文本。');
   if(typeof value==='string'&&value.length>32767)throw new Error('单元格内容超过32767字符。');
   row.push({value,display,numeric});
  }rows.push(row);}
  grids.push({id:fileId+':'+index,fileId,fileName:name,sheetName,rows,warnings:[...warnings]});
 });
 if(!grids.length)throw new Error('工作簿没有可读取的数据。');return grids;
}
export function describe(g:Grid,headerRow=1):SourceInfo{
 if(!Number.isInteger(headerRow)||headerRow<1||headerRow>g.rows.length)throw new Error('表头行超出工作表范围。');
 const width=Math.max(...g.rows.slice(0,1).map(r=>r.length),g.rows[headerRow-1].length);
 const columns=Array.from({length:width},(_,index)=>{const original=g.rows[headerRow-1][index]?.display.trim()||'';return {index,original,target:original,ignored:false};});
 return {id:g.id,fileId:g.fileId,fileName:g.fileName,sheetName:g.sheetName,totalRows:g.rows.length,selected:!g.warnings.some(x=>x.includes('原本隐藏')),headerRow,columns,preview:g.rows.slice(headerRow,headerRow+5).map(r=>r.map(c=>c.display)),warnings:g.warnings};
}
const empty=(v:Value)=>v===null||v==='';
const identifiers=/(学号|手机|电话|身份证|证件|编号|工号|邮编|(^|[ _])(id|phone|mobile|zip)([ _]|$))/i;
export function mergeSheets(grids:Grid[],configs:SheetConfig[],options:MergeOptions):MergeResult{
 const selected=configs.filter(c=>c.selected);if(!selected.length)throw new Error('请至少选择一个工作表。');
 const headers:string[]=[],reserved=['来源文件编号','来源工作表','来源行号'];const sources=selected.map(c=>{
  const g=grids.find(x=>x.id===c.id);if(!g)throw new Error('来源已失效，请重新选择文件。');
  if(!Number.isInteger(c.headerRow)||c.headerRow<1||c.headerRow>g.rows.length)throw new Error('表头行无效。');
  if(c.columns.length!==g.rows[c.headerRow-1].length)throw new Error('列设置已失效，请重新选择表头行。');
  const own=new Set<string>();let usable=0;
  for(const [i,col] of c.columns.entries()){if(col.index!==i)throw new Error('列索引无效，请重新设置映射。');if(col.ignored)continue;const target=col.target.trim();if(!target)throw new Error(`“${g.sheetName}”有空表头，请填输出列名或明确忽略。`);if(own.has(target))throw new Error(`“${g.sheetName}”输出列名“${target}”重复，请分别命名，不能覆盖数据。`);if(options.provenance&&reserved.includes(target))throw new Error('输出列名与来源追踪列重名，请改名。');own.add(target);usable++;if(!headers.includes(target))headers.push(target);}
  if(!usable)throw new Error('每张选中工作表至少保留一列。');return {g,c};
 });
 if(headers.length>SHEET_LIMITS.cols)throw new Error('映射后超过100列，请减少字段。');
 const rows:Value[][]=[],audit:MergeResult['audit']=[],warnings=new Set<string>();let protectedCells=0,allInput=0;
 for(const {g,c}of sources){let inputRows=0,blankRows=0,outputRows=0;
  g.warnings.forEach(w=>warnings.add(w));if(c.columns.some(x=>x.ignored))warnings.add('你选择忽略的列不会导出；行数核对仍包含其非空来源行。');if(c.headerRow>1)warnings.add('选定表头行之前的说明/标题行不参与合并。');
  for(let r=c.headerRow;r<g.rows.length;r++){
   inputRows++;allInput++;if(allInput>SHEET_LIMITS.rows)throw new Error('所选来源的数据行累计超过50000行，请拆分。');
   const source=g.rows[r];if(source.every(x=>empty(x.value))){blankRows++;continue;}
   const out:Value[]=headers.map(()=>null);
   for(const col of c.columns){if(col.ignored)continue;const cell=source[col.index];let v=cell?.value??null;
    if(options.protectIdentifiers&&identifiers.test(col.target)&&v!==null){if(typeof v!=='string')protectedCells++;v=cell.numeric?cell.display:String(v);}
    out[headers.indexOf(col.target.trim())]=v;
   }
   if(options.provenance)out.push(g.fileId,g.sheetName,r+1);rows.push(out);outputRows++;
   if(rows.length*(headers.length+(options.provenance?3:0))>SHEET_LIMITS.cells)throw new Error('合并后超过50万单元格，请拆分文件。');
  }
  audit.push({source:`${g.fileId} / ${g.sheetName}`,inputRows,blankRows,outputRows});
 }
 if(!rows.length)throw new Error('表头后没有非空数据行，不生成空文件。');
 return {headers:[...headers,...(options.provenance?reserved:[])],rows,audit,warnings:[...warnings],protectedCells};
}
export function safeCsvCell(value:Value){const text=value===null?'':String(value);const safe=typeof value==='string'&&/^[\s\x00-\x1f]*[=+\-@]/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';}
export function exportMerge(result:MergeResult,format:'xlsx'|'csv'):Uint8Array{
 if(!result.rows.length)throw new Error('没有可下载的结果。');
 if(format==='csv')return new TextEncoder().encode('\ufeff'+[result.headers,...result.rows].map(r=>r.map(safeCsvCell).join(',')).join('\r\n'));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([result.headers,...result.rows]),'合并结果');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['来源','表头后数据行','排除空行','输出行数'],...result.audit.map(x=>[x.source,x.inputRows,x.blankRows,x.outputRows])]),'行数核对');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['说明'],['本地值表合并；不保留公式、复杂样式或图表。'],...result.warnings.map(x=>[x])]),'处理说明');
 return new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx',compression:true}));
}
