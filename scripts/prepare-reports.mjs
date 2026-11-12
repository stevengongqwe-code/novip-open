import {mkdirSync,copyFileSync,cpSync,existsSync} from 'node:fs';
mkdirSync('public/reports',{recursive:true});
const docs=['feature-audit.md','feature-matrix.md','acceptance-report.md','qa-failures.md','production-acceptance.md'];
let copied=0;
for(const name of docs){
  const src='docs/'+name;
  if(existsSync(src)){copyFileSync(src,'public/reports/'+name);copied++;}
  else console.warn(`[prepare-reports] 缺少 ${src}，已跳过（警告，不阻断构建）`);
}
if(existsSync('docs/qa-logs'))cpSync('docs/qa-logs','public/reports/qa-logs',{recursive:true});
console.log(`[prepare-reports] 已复制 ${copied}/${docs.length} 个文档到 public/reports/`);
