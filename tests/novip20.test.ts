import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 wrongbookProgress,budgetSummary,workShiftMinutes,workSummary,matrixSummary,
 speechSummary,csvText,
 type FlashCard,type BudgetExpense,type WorkShift,type MatrixTask,
} from '../src/tools/novip20-core';
import {tools,PUBLIC_TOOL_COUNT,SYSTEM_TOOL_IDS,currentPage} from '../src/tools/registry';

describe('NOVIP 2.0 campus tools',()=>{
  it('registers five distinct reachable tools with student-facing descriptions',()=>{
    const ids=['wrongbook','campus-budget','internship-hours','priority-matrix','defense-pacer'] as const;
    for(const id of ids){
      const item=tools.find(t=>t.id===id);
      assert.ok(item,id);
      assert.equal(currentPage(item.path,''),id);
      assert.ok(item.name.length>3&&item.task.length>10);
    }
    assert.equal(PUBLIC_TOOL_COUNT,tools.length-SYSTEM_TOOL_IDS.length);
    assert.equal(new Set(tools.map(t=>t.path)).size,tools.length);
  });
  it('routes all five pages through lazy loading and homepage entry points',()=>{
    const main=fs.readFileSync('src/main.tsx','utf8');
    const home=fs.readFileSync('src/tools/Home.tsx','utf8');
    for(const id of ['wrongbook','campus-budget','internship-hours','priority-matrix','defense-pacer']){
      assert.ok(main.includes("id === '"+id+"'"),id);
      assert.ok(home.includes('href="/tools/'+id+'"'),id);
    }
  });
  it('calculates wrongbook progress without dividing by zero',()=>{
    assert.deepEqual(wrongbookProgress([]),{total:0,mastered:0,pending:0,percent:0});
    const c:FlashCard[]=[
      {id:'a',question:'Q',answer:'A',tag:'math',mastered:true},
      {id:'b',question:'Q2',answer:'A2',tag:'math',mastered:false},
      {id:'c',question:'Q3',answer:'A3',tag:'math',mastered:true}
    ];
    assert.deepEqual(wrongbookProgress(c),{total:3,mastered:2,pending:1,percent:67});
  });
  it('calculates budget totals and overspending accurately',()=>{
    const entries:BudgetExpense[]=[
      {id:'a',date:'2026-11-10',category:'餐饮',note:'饭',amount:12.5},
      {id:'b',date:'2026-11-10',category:'交通',note:'公交',amount:3.5},
    ];
    assert.deepEqual(budgetSummary(100,entries),{limit:100,spent:16,remaining:84,percent:16});
    assert.equal(budgetSummary(10,entries).remaining,-6);
    assert.throws(()=>budgetSummary(-1,entries));
  });
  it('calculates shifts including midnight, subtracts unpaid breaks and rejects invalid times',()=>{
    assert.equal(workShiftMinutes('09:00','18:00',60),480);
    assert.equal(workShiftMinutes('20:00','02:00',30),330);
    assert.throws(()=>workShiftMinutes('20:00','20:00',0));
    assert.throws(()=>workShiftMinutes('25:00','02:00',0));
    assert.throws(()=>workShiftMinutes('09:00','10:00',60));
  });
  it('calculates total actual work time and estimated hourly earnings',()=>{
    const shifts:WorkShift[]=[
      {id:'a',date:'2026-11-10',start:'09:00',end:'18:00',breakMinutes:60,hourlyRate:20},
      {id:'b',date:'2026-11-11',start:'20:00',end:'02:00',breakMinutes:30,hourlyRate:20},
    ];
    const x=workSummary(shifts);
    assert.equal(x.minutes,810);
    assert.equal(x.hours,13.5);
    assert.equal(x.earnings,270);
  });
  it('sorts the four quadrant counts by importance and urgency',()=>{
    const tasks:MatrixTask[]=[
      {id:'a',title:'1',important:true,urgent:true,done:false},
      {id:'b',title:'2',important:true,urgent:false,done:true},
      {id:'c',title:'3',important:false,urgent:true,done:false},
      {id:'d',title:'4',important:false,urgent:false,done:true},
    ];
    assert.deepEqual(matrixSummary(tasks),{total:4,done:2,quadrants:[1,1,1,1]});
  });
  it('estimates speech length without claiming recognition or AI processing',()=>{
    assert.deepEqual(speechSummary('',240,5),{units:0,estimatedMinutes:0,differenceMinutes:-5,recommendedUnits:1200});
    const s=speechSummary('你好 Hello 2026',120,1);
    assert.equal(s.units,4);
    assert.equal(s.recommendedUnits,120);
    assert.throws(()=>speechSummary('hello',0,5));
  });
  it('quotes CSV values and prevents formula execution after exporting user input',()=>{
    const result=csvText([['task','notes'],['=1+1','hello, "world"']]);
    assert.ok(result.startsWith('\ufeff'));
    assert.ok(result.includes('hello, ""world""'));
    assert.ok(result.includes("'=1+1"));
  });
});
