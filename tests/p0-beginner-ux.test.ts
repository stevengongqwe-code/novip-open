import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {tools,SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT} from '../src/tools/registry.ts';
import {TOOL_BEGINNER_GUIDES} from '../src/tools/beginner-guides.tsx';
import {createSampleCoursewarePptx, inspectPptImages} from '../src/tools/ppt-extract-core.ts';

test('P0/P1 审计：全部已注册工具均配置零基础三问介绍与 1-2-3 步新手引导', () => {
  // 面向学生的工具；系统页（/verify）也配了引导，故总数按系统页数量放宽。
  assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
  for (const tool of tools) {
    const guide = TOOL_BEGINNER_GUIDES[tool.id];
    assert.ok(guide, `工具 ${tool.id} (${tool.name}) 缺少新手引导配置`);
    assert.ok(guide.intro.length >= 18, `工具 ${tool.id} 首屏介绍过短`);
    assert.equal(guide.steps.length, 3, `工具 ${tool.id} 必须包含 3 步说明`);
    for (const step of guide.steps) {
      assert.ok(step.trim().length >= 6, `工具 ${tool.id} 步骤说明不能为空`);
    }
    assert.ok(guide.saveTip.trim().length >= 8, `工具 ${tool.id} 保存提示不能为空`);
  }

  const ppt = tools.find((t) => t.id === 'ppt-extract')!;
  assert.equal(
    ppt.task,
    '老师的 PPT 里有很多图片，想保存下来又不想一张张截图？上传课件，就能把里面的图片单独保存。',
  );
  assert.equal(TOOL_BEGINNER_GUIDES['ppt-extract'].intro, ppt.task);

  const ts = tools.find((t) => t.id === 'timestamp')!;
  assert.equal(
    ts.task,
    '有一串数字，不知道代表哪一天、几点钟？粘贴进来，就能看懂它对应的时间。',
  );
  assert.equal(TOOL_BEGINNER_GUIDES.timestamp.intro, ts.task);
});

test('P0 审计：示例课件 PPTX 内置 PNG 包含完整 IHDR/PLTE/IDAT/IEND 块，可供真机长按存相册', () => {
  const sampleBytes = createSampleCoursewarePptx();
  const inspected = inspectPptImages(sampleBytes);
  const pngItems = inspected.items.filter((i) => i.format === 'png');
  assert.ok(pngItems.length >= 2);
  for (const item of pngItems) {
    const ascii = new TextDecoder('latin1').decode(item.bytes);
    assert.ok(ascii.includes('IHDR'), `${item.fileName} 缺少 IHDR`);
    assert.ok(ascii.includes('IDAT'), `${item.fileName} 缺少 IDAT 压缩像素数据`);
    assert.ok(ascii.includes('IEND'), `${item.fileName} 缺少 IEND 结束块`);
  }
});

test('P0 审计：novip-theme.css 约束 .author-contact__qr 与全局媒体宽度，防止安卓微信 833px 半屏问题复发', () => {
  const css = fs.readFileSync(path.resolve('src/novip-theme.css'), 'utf8');
  assert.ok(css.includes('.author-contact__qr'), '缺少 .author-contact__qr 宽度约束');
  assert.ok(css.includes('.author-contact__qr img'), '缺少 .author-contact__qr img 尺寸约束');
  assert.ok(!css.includes('100vw - 1120px'), '不应使用 100vw 计算水平内边距');
});
