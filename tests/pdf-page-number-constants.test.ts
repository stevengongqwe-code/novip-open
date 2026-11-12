import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {MM_TO_PT,PAGE_NUMBER_DEFAULTS,PAGE_NUMBER_FORMATS,PAGE_NUMBER_POSITIONS,formatPageNumber,mmToPt,normalizePageNumberOptions,ptToMm} from '../src/tools/pdf-page-number-core';

// PDF 加页码：位置/格式选项表、默认值与毫米—磅换算常量契约。
// 这 4 项导出此前在主分支测试中零直接引用；它们直接决定工具页的下拉/单选选项、
// 初始表单值与非法选项回落行为（PdfPageNumber.tsx 渲染 POSITIONS/FORMATS、
// 以 DEFAULTS 为初始 state；normalizePageNumberOptions 以 DEFAULTS 为回落值）。
// 运行：node --import tsx --test tests/pdf-page-number-constants.test.ts

const close=(actual:number,expected:number,message='',epsilon=1e-9)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${message} 期望 ${expected}，实际 ${actual}`);

describe('PAGE_NUMBER_POSITIONS 九宫格位置表',()=>{
 it('恰好 9 项，按上→中→下、左→中→右的行主序排列',()=>{
  assert.deepEqual(PAGE_NUMBER_POSITIONS.map(item=>item.id),[
   'top-left','top-center','top-right',
   'middle-left','middle-center','middle-right',
   'bottom-left','bottom-center','bottom-right',
  ]);
 });
 it('覆盖 3 纵 × 3 横全部组合，每种组合恰好出现一次',()=>{
  const verticals=['top','middle','bottom'],horizontals=['left','center','right'];
  for(const vertical of verticals)for(const horizontal of horizontals){
   assert.equal(PAGE_NUMBER_POSITIONS.filter(item=>item.id===`${vertical}-${horizontal}`).length,1,`${vertical}-${horizontal} 应恰好出现一次`);
  }
  assert.equal(new Set(PAGE_NUMBER_POSITIONS.map(item=>item.id)).size,9);
 });
 it('标签逐字锁定（工具页单选按钮直接渲染）',()=>{
  assert.deepEqual(PAGE_NUMBER_POSITIONS.map(item=>item.label),[
   '左上','上中','右上','左中','居中','右中','左下','下中','右下',
  ]);
  assert.equal(new Set(PAGE_NUMBER_POSITIONS.map(item=>item.label)).size,9);
 });
});

describe('PAGE_NUMBER_FORMATS 编号格式表',()=>{
 it('恰好 3 项，id 与标签逐字锁定（工具页下拉直接渲染）',()=>{
  assert.deepEqual(PAGE_NUMBER_FORMATS.map(item=>item.id),['plain','slash','page-of']);
  assert.deepEqual(PAGE_NUMBER_FORMATS.map(item=>item.label),['1（仅数字）','1 / N','Page 1 of N']);
 });
 it('格式 id 与 formatPageNumber 的实际输出一致',()=>{
  assert.equal(formatPageNumber(3,10,'plain'),'3');
  assert.equal(formatPageNumber(3,10,'slash'),'3 / 10');
  assert.equal(formatPageNumber(3,10,'page-of'),'Page 3 of 10');
 });
});

describe('PAGE_NUMBER_DEFAULTS 默认值',()=>{
 it('逐字锁定：下中、仅数字、从 1 开始、无范围、跳过 0 页、11 号字、10mm 边距',()=>{
  assert.deepEqual({...PAGE_NUMBER_DEFAULTS},{
   position:'bottom-center',format:'plain',start:1,range:'',skipCount:0,fontSize:11,marginMm:10,
  });
 });
 it('默认位置与默认格式均为选项表成员（初始表单值是合法选项）',()=>{
  assert.ok(PAGE_NUMBER_POSITIONS.some(item=>item.id===PAGE_NUMBER_DEFAULTS.position));
  assert.ok(PAGE_NUMBER_FORMATS.some(item=>item.id===PAGE_NUMBER_DEFAULTS.format));
 });
 it('默认值全部落在 normalize 校验区间内：字号 6–36、边距 0–50mm、起始 ≤99999',()=>{
  const normalized=normalizePageNumberOptions(undefined,5);
  assert.equal(normalized.position,PAGE_NUMBER_DEFAULTS.position);
  assert.equal(normalized.format,PAGE_NUMBER_DEFAULTS.format);
  assert.equal(normalized.start,PAGE_NUMBER_DEFAULTS.start);
  assert.equal(normalized.range,PAGE_NUMBER_DEFAULTS.range);
  assert.equal(normalized.skipCount,PAGE_NUMBER_DEFAULTS.skipCount);
  assert.equal(normalized.fontSize,PAGE_NUMBER_DEFAULTS.fontSize);
  assert.equal(normalized.marginMm,PAGE_NUMBER_DEFAULTS.marginMm);
  assert.equal(normalized.totalValue,5);
 });
 it('非法位置/格式回落到默认值（锁定常量与回落行为的绑定）',()=>{
  const normalized=normalizePageNumberOptions({position:'nope' as never,format:'nope' as never},5);
  assert.equal(normalized.position,PAGE_NUMBER_DEFAULTS.position);
  assert.equal(normalized.format,PAGE_NUMBER_DEFAULTS.format);
 });
});

describe('MM_TO_PT 毫米—磅换算常量',()=>{
 it('等于 72/25.4（1 英寸 = 72pt = 25.4mm）',()=>{
  close(MM_TO_PT,72/25.4,'MM_TO_PT');
  assert.equal(MM_TO_PT,72/25.4);
 });
 it('mmToPt/ptToMm 以该常量换算：10mm 与 72pt 互为往返',()=>{
  close(mmToPt(10),28.34645669291339,'mmToPt(10)');
  assert.equal(ptToMm(72),25.4);
  close(ptToMm(mmToPt(25.4)),25.4,'往返 25.4mm');
  close(mmToPt(ptToMm(72)),72,'往返 72pt');
 });
});
