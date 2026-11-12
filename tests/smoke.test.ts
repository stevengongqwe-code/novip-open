import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {tools,currentPage,SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT} from '../src/tools/registry';

// 工具冒烟测试：保证 74 个工具的 id/path/路由解析不被意外破坏。
// 运行：npm test（node --import tsx --test tests/*.test.ts）

const EXPECTED_IDS=[
 'developer','timestamp','text','finance','health','color-picker','stitch','pdf-page-number','pdf-crop','pdf-watermark','image-watermark','timetable',
 'leave-helper','material-collector','file-organizer',
 'batch-pdf','materials','ppt','ppt-extract','scan','privacy','wishes',
 'handwrite','files','photo','images','background','ocr',
 'references','docx-check','compare','resume','course',
 'sheets','table-clean','lab','grades','cost','college-nav','ai',
 'ppt-generate','pdf-form','image-compress','flowchart','media-converter',
 'web-to-apk','qr','photo-check','pdf-merge-split','pdf-compress','random-pick','id-card-layout','split-bill','class-fund','exam-plan','composite-score','fitness-test','internship-tax','student-loan','thesis-check','docx-format','group-free-time',
];

describe('工具注册表（动态工具数）',()=>{
  it('工具总数与唯一性，id 唯一',()=>{
    // 面向学生的 73 款工具（新增 dorm-power-limit）；注册表额外包含系统页（如 /verify 验证门户）。
    assert.equal(tools.length,PUBLIC_TOOL_COUNT+SYSTEM_TOOL_IDS.length,`期望 ${PUBLIC_TOOL_COUNT+SYSTEM_TOOL_IDS.length} 个条目，实际 ${tools.length}`);
    assert.equal(new Set(tools.map(t=>t.id)).size,PUBLIC_TOOL_COUNT+SYSTEM_TOOL_IDS.length,'工具 id 有重复');
  });

  it('审计要求的基线工具 id 齐备',()=>{
    const ids=new Set<string>(tools.map(t=>t.id));
    for(const id of EXPECTED_IDS) assert.ok(ids.has(id),`缺失工具: ${id}`);
  });

  it('每个工具的 path 格式正确',()=>{
    for(const t of tools){
      assert.match(t.path,/^(\/nav|\/tools\/[a-z0-9-]+|\/#[a-z-]+|\/verify)$/,`path 非法: ${t.id} -> ${t.path}`);
      assert.ok(t.name.length>0,`工具 ${t.id} 缺少名称`);
      assert.ok(t.task.length>0,`工具 ${t.id} 缺少任务描述`);
    }
  });

  it('路由解析正确',()=>{
    assert.equal(currentPage('/tools/developer',''),'developer');
    assert.equal(currentPage('/tools/timestamp',''),'timestamp');
    assert.equal(currentPage('/tools/text',''),'text');
    assert.equal(currentPage('/tools/finance',''),'finance');
    assert.equal(currentPage('/tools/health',''),'health');
    assert.equal(currentPage('/tools/color-picker',''),'color-picker');
    assert.equal(currentPage('/tools/stitch',''),'stitch');
    assert.equal(currentPage('/tools/pdf-page-number',''),'pdf-page-number');
    assert.equal(currentPage('/tools/pdf-crop',''),'pdf-crop');
    assert.equal(currentPage('/tools/pdf-watermark',''),'pdf-watermark');
    assert.equal(currentPage('/tools/pdf-merge-split',''),'pdf-merge-split');
    assert.equal(currentPage('/tools/pdf-compress',''),'pdf-compress');
    assert.equal(currentPage('/tools/photo-check',''),'photo-check');
    assert.equal(currentPage('/tools/image-watermark',''),'image-watermark');
    assert.equal(currentPage('/tools/image-watermark/',''),'image-watermark');
    assert.equal(currentPage('/tools/ppt-extract',''),'ppt-extract');
    assert.equal(currentPage('/tools/ppt-extract/',''),'ppt-extract');
    assert.equal(currentPage('/tools/timetable',''),'timetable');
    assert.equal(currentPage('/tools/timetable/',''),'timetable');
    assert.equal(currentPage('/tools/ai',''),'ai');
    assert.equal(currentPage('/tools/ai/',''),'ai');
    assert.equal(currentPage('/tools/web-to-apk',''),'web-to-apk');
    assert.equal(currentPage('/tools/web-to-apk/',''),'web-to-apk');
    assert.equal(currentPage('/tools/random-pick',''),'random-pick');
    assert.equal(currentPage('/tools/random-pick/',''),'random-pick');
    assert.equal(currentPage('/tools/id-card-layout',''),'id-card-layout');
    assert.equal(currentPage('/tools/id-card-layout/',''),'id-card-layout');
    assert.equal(currentPage('/tools/split-bill',''),'split-bill');
    assert.equal(currentPage('/tools/split-bill/',''),'split-bill');
    assert.equal(currentPage('/tools/class-fund',''),'class-fund');
    assert.equal(currentPage('/tools/class-fund/',''),'class-fund');
    assert.equal(currentPage('/tools/exam-plan',''),'exam-plan');
    assert.equal(currentPage('/tools/exam-plan/',''),'exam-plan');
    assert.equal(currentPage('/tools/composite-score',''),'composite-score');
    assert.equal(currentPage('/tools/composite-score/',''),'composite-score');
    assert.equal(currentPage('/tools/fitness-test',''),'fitness-test');
    assert.equal(currentPage('/tools/fitness-test/',''),'fitness-test');
    assert.equal(currentPage('/tools/internship-tax',''),'internship-tax');
    assert.equal(currentPage('/tools/thesis-check',''),'thesis-check');
    assert.equal(currentPage('/tools/thesis-check/',''),'thesis-check');
    assert.equal(currentPage('/tools/internship-tax/',''),'internship-tax');
    assert.equal(currentPage('/stats',''),'stats');
    assert.equal(currentPage('/tools/resume',''),'resume');
    assert.equal(currentPage('/tools/grades',''),'grades');
    assert.equal(currentPage('/tools/batch-pdf',''),'batch-pdf');
    assert.equal(currentPage('/tools/leave-helper',''),'leave-helper');
    assert.equal(currentPage('/tools/material-collector',''),'material-collector');
    assert.equal(currentPage('/tools/file-organizer',''),'file-organizer');
    assert.equal(currentPage('/',''),'home');
    assert.equal(currentPage('/','#grades'),'grades');
    assert.equal(currentPage('/404',''),'not-found');
    assert.equal(currentPage('/tools/not-exist',''),'home');
  });
});
