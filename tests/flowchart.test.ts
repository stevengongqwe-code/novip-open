import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOWCHART_TEMPLATES,
  validateMermaidCode,
  getMermaidConfig,
  type FlowchartTemplateId,
} from '../src/tools/flowchart-core.ts';

test('NOVIP 流程图核心引擎 · 模板完整性与高校实用性', () => {
  const ids: FlowchartTemplateId[] = [
    'auth-flow',
    'algorithm',
    'tcp-handshake',
    'er-diagram',
    'architecture',
    'gantt-thesis',
    'mindmap-cs',
  ];

  assert.equal(ids.length, 7);
  for (const id of ids) {
    const tpl = FLOWCHART_TEMPLATES[id];
    assert.ok(tpl, `模板 ${id} 必须存在`);
    assert.ok(tpl.name.length > 0);
    assert.ok(tpl.code.length > 50, '代码段不可过短');
    const check = validateMermaidCode(tpl.code);
    assert.equal(check.valid, true, `模板 ${id} 语法应通过前置校验: ${check.error}`);
  }
});

test('NOVIP 流程图核心引擎 · 语法校验与脚本防御', () => {
  assert.equal(validateMermaidCode('').valid, false);
  assert.equal(validateMermaidCode('flowchart TD\n A-->B').valid, true);
  assert.equal(validateMermaidCode('sequenceDiagram\n A->>B: Hi').valid, true);
  assert.equal(validateMermaidCode('random invalid text').valid, false);
  assert.equal(validateMermaidCode('flowchart TD\n <script>alert(1)</script>').valid, false);
});

test('NOVIP 流程图核心引擎 · 主题配置生成', () => {
  const cfg1 = getMermaidConfig('apple-blue');
  assert.equal(cfg1.theme, 'default');
  assert.ok(cfg1.fontFamily.includes('BlinkMacSystemFont'));

  const cfg2 = getMermaidConfig('dark');
  assert.equal(cfg2.theme, 'dark');

  const cfg3 = getMermaidConfig('neutral');
  assert.equal(cfg3.theme, 'neutral');
});
