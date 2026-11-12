/* NOVIP 2.0 — pure, offline-first campus utilities. */
export interface FlashCard {id:string;question:string;answer:string;tag:string;mastered:boolean}
export interface BudgetExpense {id:string;date:string;category:string;note:string;amount:number}
export interface WorkShift {id:string;date:string;start:string;end:string;breakMinutes:number;hourlyRate:number}
export interface MatrixTask {id:string;title:string;urgent:boolean;important:boolean;done:boolean}

export const NOVIP20_KEYS = {
  mistakes:'novip20-mistakes-v1',
  budget:'novip20-budget-v1',
  shifts:'novip20-shifts-v1',
  matrix:'novip20-matrix-v1',
  budgetLimit:'novip20-budget-limit-v1',
} as const;

export function wrongbookProgress(cards:readonly FlashCard[]) {
  const mastered = cards.filter(c=>c.mastered).length;
  return {total:cards.length,mastered,pending:cards.length-mastered,percent:cards.length?Math.round(mastered/cards.length*100):0};
}
export function budgetSummary(limit:number,expenses:readonly BudgetExpense[]) {
  if(!Number.isFinite(limit)||limit<0) throw new Error('预算必须为非负数字');
  const spent=expenses.reduce((sum,e)=>{
    if(!Number.isFinite(e.amount)||e.amount<0) throw new Error('存在无效支出');
    return sum+e.amount;
  },0);
  return {limit,spent,remaining:limit-spent,percent:limit>0?Math.round(spent/limit*100):0};
}
export function workShiftMinutes(start:string,end:string,breakMinutes:number):number {
  const toMinutes=(s:string)=>{
    const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
    if(!m) throw new Error('时间格式不正确');
    return Number(m[1])*60+Number(m[2]);
  };
  const a=toMinutes(start),b=toMinutes(end);
  const total=(b-a+1440)%1440;
  if(total===0) throw new Error('开始与结束时间不能相同');
  if(!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>=total) throw new Error('休息时长无效');
  return total-breakMinutes;
}
export function workSummary(shifts:readonly WorkShift[]) {
  let minutes=0,earnings=0;
  for(const s of shifts){
    if(!Number.isFinite(s.hourlyRate)||s.hourlyRate<0)throw new Error('时薪不能为负');
    const m=workShiftMinutes(s.start,s.end,s.breakMinutes);
    minutes+=m;earnings+=m/60*s.hourlyRate;
  }
  return {minutes,hours:minutes/60,earnings};
}
export function matrixSummary(tasks:readonly MatrixTask[]){
  return {total:tasks.length,done:tasks.filter(t=>t.done).length,
    quadrants:[0,1,2,3].map(q=>tasks.filter(t=>(t.important?0:2)+(t.urgent?0:1)===q).length)};
}
export function speechSummary(text:string,charactersPerMinute:number,targetMinutes:number) {
  if(!Number.isFinite(charactersPerMinute)||charactersPerMinute<60||charactersPerMinute>600)throw new Error('语速范围为每分钟 60–600 字');
  if(!Number.isFinite(targetMinutes)||targetMinutes<=0||targetMinutes>180)throw new Error('时长应为 0–180 分钟');
  const chinese=(text.match(/\p{Script=Han}/gu)||[]).length;
  const western=(text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)||[]).length;
  const digits=(text.match(/\d+(?:\.\d+)?/g)||[]).length;
  const units=chinese+western+digits;
  return {units,estimatedMinutes:units/charactersPerMinute,
    differenceMinutes:units/charactersPerMinute-targetMinutes,
    recommendedUnits:Math.round(targetMinutes*charactersPerMinute)};
}
export function csvText(rows:readonly (readonly (string|number)[])[]):string {
  return '\ufeff'+rows.map(row=>row.map(v=>{
    const raw=String(v);
    const safe=typeof v==='string'&&/^\s*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
    return '"'+safe.replace(/"/g,'""')+'"';
  }).join(',')).join('\r\n');
}
