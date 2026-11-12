import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {solveAiQuery} from '../src/tools/ai-core';
import {tools, currentPage} from '../src/tools/registry';
import {TOOL_BEGINNER_GUIDES} from '../src/tools/beginner-guides';
import {TOOL_IOS_CONFIG} from '../src/tools/ios-icons';

describe('NOVIP AI 助手核心引擎 (AiAssistant & solveAiQuery)', () => {
  it('注册表中已正确收录 ai 助手工具且路由无缝匹配', () => {
    const aiTool = tools.find(t => t.id === 'ai');
    assert.ok(aiTool, '注册表中应收录 ai 工具');
    assert.equal(aiTool.path, '/tools/ai');
    assert.equal(currentPage('/tools/ai', ''), 'ai');
    assert.equal(currentPage('/tools/ai/', ''), 'ai');
    assert.ok(TOOL_IOS_CONFIG.ai, 'ai 工具应配置 iOS Squircle 图标');
    assert.equal(TOOL_BEGINNER_GUIDES.ai.steps.length, 3, 'ai 工具应配置 3 步新手引导');
  });

  it('问候与网站身份意图准确识别', () => {
    const greet = solveAiQuery('你好');
    assert.match(greet.reply, /NOVIP AI 助手/);
    assert.ok(greet.matchedToolIds.length > 0);

    const who = solveAiQuery('你是谁？');
    assert.match(who.reply, /本地智能工具向导/);

    const what = solveAiQuery('NOVIP 是一个什么样的网站？');
    assert.match(what.reply, /大学生，别花冤枉钱/);
  });

  it('四六级照片需求精准匹配 photo 并输出指导步骤', () => {
    const res = solveAiQuery('四六级照片480×640怎么改，还要压缩到100KB以内？');
    assert.ok(res.matchedToolIds.includes('photo'));
    assert.match(res.reply, /报名照片尺寸助手/);
    assert.match(res.reply, /推荐操作步骤/);
  });

  it('多份 PDF 合并与加页码需求精准匹配', () => {
    const res = solveAiQuery('有几份大作业实验报告 PDF，想合并在一起并且加上页码');
    assert.ok(res.matchedToolIds.includes('files') || res.matchedToolIds.includes('pdf-page-number'));
  });

  it('证件照加防盗水印需求精准匹配 image-watermark', () => {
    const res = solveAiQuery('给身份证和学生证照片加防盗水印');
    assert.ok(res.matchedToolIds.includes('image-watermark'));
  });

  it('期末算绩点与保研分精准匹配 grades', () => {
    const res = solveAiQuery('期末考多少分才能及格不挂科，算保研 GPA 绩点');
    assert.ok(res.matchedToolIds.includes('grades'));
  });

  it('班委收作业比对名单需求精准匹配 material-collector', () => {
    const res = solveAiQuery('班长收全班作业，怎么核对名单查出谁没交？');
    assert.ok(res.matchedToolIds.includes('material-collector'));
  });

  it('论文参考文献 GB/T 7714 格式精准匹配 references', () => {
    const res = solveAiQuery('毕业论文参考文献按 GB/T 7714-2015 怎么调格式？');
    assert.ok(res.matchedToolIds.includes('references'));
  });

  it('给辅导员请假消息精准匹配 leave-helper', () => {
    const res = solveAiQuery('生病要找辅导员和老师请假，怎么委婉礼貌措辞？');
    assert.ok(res.matchedToolIds.includes('leave-helper'));
  });

  it('网站打包生成安卓 APK 需求精准匹配 web-to-apk', () => {
    const res = solveAiQuery('怎么把我的网页博客打包成安卓手机能安装的 APK 安装包？');
    assert.ok(res.matchedToolIds.includes('web-to-apk'));
    assert.match(res.reply, /网站一键生成安卓 APK/);
  });

  it('功能建议与许愿痛点生成结构化草稿', () => {
    const res = solveAiQuery('想建议增加一个去除视频水印的免费工具');
    assert.ok(res.matchedToolIds.includes('wishes'));
    assert.match(res.reply, /功能许愿 \/ 痛点反馈草稿/);
  });

  it('成绩与绩点反推计算：平时40%得75分，反推总评85分期末需要91.7分', () => {
    const res = solveAiQuery('平时成绩考了75分，占比40%，目标想上85分期末要考多少？');
    assert.ok(res.matchedToolIds.includes('grades'));
    assert.ok(res.calcBreakdown?.includes('91.7'));
    assert.match(res.reply, /91\.7/);
    assert.ok(res.followUps && res.followUps.length >= 2);
  });

  it('开题与答辩 PPT 需求直接生成 6 页标准大纲框架', () => {
    const res = solveAiQuery('毕业设计开题报告答辩PPT怎么构思大纲和结构？');
    assert.ok(res.matchedToolIds.includes('ppt-generate'));
    assert.ok(res.draftTitle?.includes('大纲'));
    assert.ok(res.draftContent?.includes('选题背景'));
    assert.ok(res.draftContent?.includes('技术路线'));
  });

  it('多轮对话上下文：在请假上下文中追问天数与病情能无缝更新草稿', () => {
    const res = solveAiQuery('发烧38.5度，想请假两天', [
      { role: 'user', content: '生病找辅导员请假' },
      { role: 'assistant', content: '为你推荐请假条草稿助手，针对大学请假已为你起草...' }
    ]);
    assert.ok(res.matchedToolIds.includes('leave-helper'));
    assert.ok(res.draftContent?.includes('2 天'));
    assert.ok(res.draftContent?.includes('38.5'));
  });

  it('Mermaid 流程图需求直接生成可运行的代码模板', () => {
    const res = solveAiQuery('帮我画一个选课系统的业务流程图放入报告');
    assert.ok(res.matchedToolIds.includes('flowchart'));
    assert.ok(res.draftContent?.includes('graph TD'));
    assert.ok(res.draftContent?.includes('选课'));
  });

  it('蓝底一寸照需求一站式准确识别并指导', () => {
    const res = solveAiQuery('我想做一张蓝底一寸照片');
    assert.ok(res.matchedToolIds.includes('photo'));
    assert.match(res.reply, /一站式/);
    assert.match(res.reply, /标准天蓝底/);
  });

  it('照片太大传不上去痛点准确匹配精准压缩与证件照', () => {
    const res = solveAiQuery('手机拍的照片太大了传不上去，怎么压缩到100KB');
    assert.ok(res.matchedToolIds.includes('image-compress'));
    assert.match(res.reply, /100KB/);
  });

  it('微信长按保存图片技巧准确解答', () => {
    const res = solveAiQuery('在安卓微信里怎么把做好的照片保存到相册');
    assert.match(res.reply, /长按图片/);
    assert.match(res.reply, /保存到手机/);
  });
});
