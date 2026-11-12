import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CARD_PRESETS,
  DEFAULT_WATERMARK,
  LAYOUT_OPTIONS,
  WATERMARK_PRESETS,
  calculateCardPlacement,
  normalizeWatermarkText,
} from '../src/tools/id-card-layout-core';

// 覆盖目标：id-card-layout-core 中 3 项零直接测试覆盖的导出——
// LAYOUT_OPTIONS / WATERMARK_PRESETS / DEFAULT_WATERMARK。
// 它们直接渲染在 IdCardLayout.tsx 中（版式 <select> 选项、水印快捷 chip、
// 组件水印 state 初始值），此前只有几何换算等函数被 tests/id-card-layout.test.ts 覆盖。
// 全部预期值先经 tsx 探针核对再写入；本文件不改生产代码。

const MODES = ['stacked', 'side-by-side', 'compact'] as const;
const PRESET_IDS = ['id-card', 'student-card', 'driver-license'] as const;

function approx(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `期望 ${expected}，实际 ${actual}`);
}

describe('证件拼版 · 版式选项与水印预设契约', () => {
  it('版式选项恰好 3 种，key 与 id 一致', () => {
    assert.deepEqual(Object.keys(LAYOUT_OPTIONS).sort(), ['compact', 'side-by-side', 'stacked']);
    for (const key of Object.keys(LAYOUT_OPTIONS)) {
      assert.equal(LAYOUT_OPTIONS[key as (typeof MODES)[number]].id, key);
    }
  });

  it('版式名称与说明逐字锁定', () => {
    assert.deepEqual(LAYOUT_OPTIONS.stacked, {
      id: 'stacked',
      name: '经典上下居中（推荐）',
      desc: '正面在上方居中，反面在下方居中，留足裁剪与装订边距',
    });
    assert.deepEqual(LAYOUT_OPTIONS['side-by-side'], {
      id: 'side-by-side',
      name: '横向左右并排',
      desc: '正反面在页面中上部左右排列，适合作业纸与简明材料',
    });
    assert.deepEqual(LAYOUT_OPTIONS.compact, {
      id: 'compact',
      name: '紧凑置顶（下半页留白）',
      desc: '正反面紧凑排列在上半页，下半页预留大面积空白用于签字盖章',
    });
  });

  it('下拉短标签（desc 首段）非空且三者互不相同', () => {
    // IdCardLayout.tsx 以 opt.desc.split('，')[0] 作为 <option> 短标签。
    const heads = MODES.map((m) => LAYOUT_OPTIONS[m].desc.split('，')[0]);
    assert.deepEqual(heads, ['正面在上方居中', '正反面在页面中上部左右排列', '正反面紧凑排列在上半页']);
    assert.equal(new Set(heads).size, 3);
    for (const h of heads) assert.ok(h.length > 0);
  });

  it('9 组版式×证件排版矩形尺寸与证件规格一致，纸张为 A4', () => {
    for (const mode of MODES) {
      for (const presetId of PRESET_IDS) {
        const preset = CARD_PRESETS[presetId];
        const r = calculateCardPlacement(presetId, mode);
        assert.deepEqual(r.paperMm, { width: A4_WIDTH_MM, height: A4_HEIGHT_MM });
        assert.equal(r.paperMm.width, 210);
        assert.equal(r.paperMm.height, 297);
        for (const rect of [r.front, r.back]) {
          assert.equal(rect.width, preset.widthMm);
          assert.equal(rect.height, preset.heightMm);
        }
      }
    }
  });

  it('排版矩形落在 A4 内且正反面不重叠（锁定 1 处已知 1mm 溢出）', () => {
    for (const mode of MODES) {
      for (const presetId of PRESET_IDS) {
        const r = calculateCardPlacement(presetId, mode);
        const inBounds = (rect: { x: number; y: number; width: number; height: number }) =>
          rect.x >= 0 &&
          rect.y >= 0 &&
          rect.x + rect.width <= A4_WIDTH_MM + 1e-9 &&
          rect.y + rect.height <= A4_HEIGHT_MM + 1e-9;
        if (mode === 'side-by-side' && presetId === 'student-card') {
          // 已知 quirks（探针实测，非测试侧推断）：学生证 100mm 宽，
          // side-by-side 总宽 100×2+12=212 > 210，起始 x = (210-212)/2 = -1，
          // 正面左缘溢出 A4 外 1mm。本轮只锁定该行为，不擅自改几何；
          // 修复（起始 x 钳制 ≥0 或宽预设下缩 gap）留待后续轮次/用户决策。
          assert.equal(r.front.x, -1);
          assert.equal(r.back.x, 111);
        } else {
          assert.ok(inBounds(r.front), `${mode}/${presetId} front 越界：${JSON.stringify(r.front)}`);
          assert.ok(inBounds(r.back), `${mode}/${presetId} back 越界：${JSON.stringify(r.back)}`);
        }
        // 正反面不重叠且留有固定间隔。
        if (mode === 'side-by-side') {
          approx(r.back.x - (r.front.x + r.front.width), 12);
          assert.equal(r.back.y, r.front.y);
        } else {
          const gap = mode === 'stacked' ? 34 : 18;
          approx(r.back.y - (r.front.y + r.front.height), gap);
          assert.equal(r.back.x, r.front.x);
        }
      }
    }
  });

  it('水印预设恰好 6 条，逐字锁定', () => {
    assert.deepEqual([...WATERMARK_PRESETS], [
      '仅供大学评奖评优核验使用 他用无效',
      '仅供勤工助学兼职入职签约 他用无效',
      '仅供校园网与宿舍宽带开户 他用无效',
      '仅供全国英语四六级报名审核 他用无效',
      '仅供考研复试资格审查使用 他用无效',
      '仅供高校社团注册登记使用 他用无效',
    ]);
  });

  it('每条水印预设均以“仅供”开头、以“ 他用无效”结尾', () => {
    for (const p of WATERMARK_PRESETS) {
      assert.ok(p.startsWith('仅供'), p);
      assert.ok(p.endsWith(' 他用无效'), p);
    }
  });

  it('水印快捷 chip 标签（剥离前后缀后）非空且互不相同', () => {
    // IdCardLayout.tsx 以 p.replace('仅供', '').replace(' 他用无效', '') 作 chip 文案，
    // 并以 watermark.text === p 判断 active 状态；剥离后标签必须可区分。
    const labels = WATERMARK_PRESETS.map((p) => p.replace('仅供', '').replace(' 他用无效', ''));
    assert.deepEqual(labels, [
      '大学评奖评优核验使用',
      '勤工助学兼职入职签约',
      '校园网与宿舍宽带开户',
      '全国英语四六级报名审核',
      '考研复试资格审查使用',
      '高校社团注册登记使用',
    ]);
    assert.equal(new Set(labels).size, 6);
  });

  it('每条水印预设长度不超过 48 且 normalize 原样返回', () => {
    // 输入框 maxLength={48}，normalizeWatermarkText 截断上限亦为 48；
    // 预设超长会被截断、与 chip 的严格相等判断失配，故逐条锁定。
    for (const p of WATERMARK_PRESETS) {
      assert.ok(p.length <= 48, `${p} 长 ${p.length}`);
      assert.equal(normalizeWatermarkText(p), p);
    }
  });

  it('水印预设与默认水印文本均不含首尾空白', () => {
    for (const p of WATERMARK_PRESETS) assert.equal(p, p.trim());
    assert.equal(DEFAULT_WATERMARK.text, DEFAULT_WATERMARK.text.trim());
  });

  it('默认水印逐字锁定且默认文本即首条预设', () => {
    assert.deepEqual(DEFAULT_WATERMARK, {
      enabled: true,
      text: '仅供大学评奖评优核验使用 他用无效',
      color: 'gray',
      density: 'standard',
    });
    assert.equal(DEFAULT_WATERMARK.text, WATERMARK_PRESETS[0]);
  });

  it('默认水印颜色与密度为合法枚举值，默认文本经 normalize 原样返回', () => {
    assert.ok(['gray', 'red', 'blue'].includes(DEFAULT_WATERMARK.color));
    assert.ok(['standard', 'dense'].includes(DEFAULT_WATERMARK.density));
    assert.equal(DEFAULT_WATERMARK.enabled, true);
    assert.equal(normalizeWatermarkText(DEFAULT_WATERMARK.text), DEFAULT_WATERMARK.text);
  });
});
