import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tools,SYSTEM_TOOL_IDS, PUBLIC_TOOL_COUNT} from '../src/tools/registry.ts';
import {TOOL_IOS_CONFIG, CAMPUS_SCENARIOS} from '../src/tools/ios-icons.tsx';

describe('iPhone UI (iOS) 视觉与图标系统规范', () => {
  it('全部已注册工具均配置专属 iOS Squircle 图标与渐变色彩', () => {
    // 面向学生的工具；系统页（/verify）同样配图标，故总数按系统页数量放宽。
    assert.equal(tools.length, PUBLIC_TOOL_COUNT + SYSTEM_TOOL_IDS.length);
    for (const tool of tools) {
      const config = TOOL_IOS_CONFIG[tool.id];
      assert.ok(config, `工具 ${tool.id} (${tool.name}) 必须配置 TOOL_IOS_CONFIG`);
      assert.ok(config.gradient.startsWith('linear-gradient'), `工具 ${tool.id} 渐变格式不合法`);
      assert.ok(config.icon, `工具 ${tool.id} 缺少矢量图标组件`);
      assert.ok(config.shortName.length >= 2 && config.shortName.length <= 8, `工具 ${tool.id} 桌面简称长度应在 2-8 字符之间`);
    }
  });

  it('关键高频工具具备正确的 NEW / HOT 徽标', () => {
    assert.equal(TOOL_IOS_CONFIG['ppt-extract'].badge, 'NEW');
    assert.equal(TOOL_IOS_CONFIG['timetable'].badge, 'NEW');
    assert.equal(TOOL_IOS_CONFIG['photo'].badge, 'HOT');
    assert.equal(TOOL_IOS_CONFIG['files'].badge, 'HOT');
  });

  it('大学生活情境速查覆盖 5 大场景并包含全部 59 款工具', () => {
    assert.equal(CAMPUS_SCENARIOS.length, 5);
    const coveredToolIds = new Set<string>();
    for (const sc of CAMPUS_SCENARIOS) {
      assert.ok(sc.name.length >= 2, `${sc.id} 缺少场景名称`);
      assert.ok(sc.icon.length >= 1, `${sc.id} 缺少场景图标`);
      assert.ok(sc.tagline.length >= 10, `${sc.id} 说明过短`);
      assert.ok(sc.toolIds.length >= 4, `${sc.id} 场景至少包含 4 款工具`);
      for (const id of sc.toolIds) {
        assert.ok(tools.some(t => t.id === id), `场景 ${sc.id} 包含未知工具 ${id}`);
        coveredToolIds.add(id);
      }
    }
    assert.equal(coveredToolIds.size, 59, '5 大场景应覆盖全部 59 款场景工具');
  });

  it('场景定义与简称不包含技术术语黑话', () => {
    const techWords = ['Unix', 'OCR', 'DPI', 'JSON', 'WASM', 'Base64'];
    for (const sc of CAMPUS_SCENARIOS) {
      for (const word of techWords) {
        assert.ok(!sc.name.includes(word), `场景名称 ${sc.name} 不应包含技术黑话 ${word}`);
        assert.ok(!sc.tagline.includes(word), `场景说明 ${sc.tagline} 不应包含技术黑话 ${word}`);
      }
    }
  });

  it('iOS 18 状态栏、灵动岛镜头高光、苹果官网 Hero 行动条与主屏分页指示点完备', () => {
    const homeSource = fs.readFileSync(path.resolve('src/tools/Home.tsx'), 'utf8');
    const themeCss = fs.readFileSync(path.resolve('src/novip-theme.css'), 'utf8');

    assert.ok(homeSource.includes('ios-status-bar-strip'), 'Home.tsx 应包含 iOS 18 状态栏容器');
    assert.ok(homeSource.includes('ios-island-lens'), '灵动岛应包含 TrueDepth 镜头细节');
    assert.ok(homeSource.includes('apple-hero-ribbon'), 'Home.tsx 应包含苹果官网风格 Hero 行动条');
    assert.ok(homeSource.includes('ios-page-dots'), 'Springboard 应包含 iOS 主屏分页指示圆点');

    assert.ok(themeCss.includes('.ios-status-bar-strip'), 'novip-theme.css 应定义状态栏样式');
    assert.ok(themeCss.includes('.apple-hero-ribbon'), 'novip-theme.css 应定义苹果官网行动条样式');
    assert.ok(themeCss.includes('grid-template-columns: repeat(4, 1fr)'), '灵动岛展开面板应为对称 4 列网格');
    assert.ok(themeCss.includes('@media (prefers-color-scheme: dark)'), 'novip-theme.css 应支持 iOS 18 深色模式');
  });
});


