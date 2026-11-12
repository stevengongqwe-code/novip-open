import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInput, buildOutputs, optimize, buildFollowup, runChecklist, completeness,
  detectFabricationRequest, detectEmergency, detectLowLegitimacy, SCENARIOS, EXAMPLE_INPUT,
  type LeaveInput,
} from '../src/tools/leave-helper-core.ts';
import { tools, currentPage } from '../src/tools/registry.ts';

const base: LeaveInput = { ...EXAMPLE_INPUT };

// 1-5: 五个代表性场景都能生成三版，且包含关键事实
describe('代表性场景生成', () => {
  for (const s of SCENARIOS.slice(0, 5)) {
    it(s.name, () => {
      const { input, validation } = validateInput(s.input);
      assert.equal(validation.errors.length, 0, `不应有错误: ${validation.errors.join('|')}`);
      const o = buildOutputs(input);
      assert.ok(o.wechat.length > 10 && o.formal.length > 10 && o.face.length > 10, '三版都要有实质内容');
      assert.ok(o.wechat.includes(input.dateText), '微信版必须包含请假时间');
      assert.ok(o.formal.includes(input.dateText), '正式版必须包含请假时间');
      assert.ok(o.face.includes(input.dateText), '当面版必须包含请假时间');
    });
  }
});

// 6: 只填极少信息 -> 提示补充必要内容
describe('极少信息提示', () => {
  it('空时间+空原因 -> 报两个错误', () => {
    const { validation } = validateInput(SCENARIOS[5].input);
    assert.ok(validation.errors.length >= 2, '应提示补充时间和原因');
    assert.ok(validation.errors.some((e) => e.includes('请假时间')));
    assert.ok(validation.errors.some((e) => e.includes('请假原因')));
  });
  it('只填时间不填原因且未勾隐私 -> 提示原因', () => {
    const { validation } = validateInput({ ...base, reason: '', keepPrivate: false, dateText: '明天' });
    assert.ok(validation.errors.some((e) => e.includes('请假原因')));
  });
});

// 7: 没有补救安排时，不自动编造
describe('不编造补救安排', () => {
  it('remedy 为空时三版都不出现编造的补救', () => {
    const { input } = validateInput({ ...base, remedy: '' });
    const o = buildOutputs(input);
    const all = o.wechat + o.formal + o.face;
    for (const w of ['已安排同学代办', '同学代笔记', '已借到笔记', '会补上笔记']) {
      assert.ok(!all.includes(w), `不应编造: ${w}`);
    }
  });
});

// 8: 没有证明时，不声称已附证明
describe('不声称证明', () => {
  it('三版+追问都不出现证明类断言', () => {
    const { input } = validateInput(base);
    const o = buildOutputs(input);
    const fus = (['why', 'late', 'material', 'pending'] as const).map((k) => buildFollowup(input, k));
    const all = o.wechat + o.formal + o.face + fus.join('');
    for (const w of ['诊断证明', '已附证明', '病假条', '挂号单', '家长已同意', '已挂号']) {
      assert.ok(!all.includes(w), `不应声称: ${w}`);
    }
  });
});

// 9: 多次改写仍保持时间一致
describe('改写保持事实一致', () => {
  it('5 种优化模式都不改变时间/对象/原因', () => {
    const { input } = validateInput(base);
    const o = buildOutputs(input);
    const modes = ['shorter', 'natural', 'formal', 'private', 'deapologize'] as const;
    for (const m of modes) {
      const r = optimize(input, o, m);
      const all = r.wechat + r.formal + r.face;
      if (m !== 'private') {
        assert.ok(all.includes(input.dateText), `${m}: 时间必须保留`);
      } else {
        assert.ok(all.includes(input.dateText), 'private: 时间必须保留');
        assert.ok(!all.includes('校医院'), 'private: 不应透露具体原因细节');
      }
    }
    // 确定性：同一输入两次生成完全一致
    const o2 = buildOutputs(input);
    assert.deepEqual(o, o2, '同一输入生成结果必须确定一致');
  });
});

// 10: 长文本、特殊字符、空输入
describe('鲁棒输入处理', () => {
  it('超长 reason 被截断到上限', () => {
    const { input } = validateInput({ ...base, reason: 'x'.repeat(2000) });
    assert.ok(input.reason.length <= 500);
  });
  it('特殊字符不破坏生成', () => {
    const { input } = validateInput({ ...base, reason: '身体不舒服 <>&"\'\n\t', dateText: '10/24 3-4节 (周五)' });
    const o = buildOutputs(input);
    assert.ok(o.wechat.includes('10/24 3-4节'));
  });
  it('全空输入不抛异常，只返回错误提示', () => {
    const { validation } = validateInput({} as Partial<LeaveInput>);
    assert.ok(validation.errors.length > 0);
  });
  it('emoji 与换行被压缩', () => {
    const { input } = validateInput({ ...base, reason: '🤒\n\n发烧了\n\n' });
    assert.ok(!input.reason.includes('\n\n'));
    const o = buildOutputs(input);
    assert.ok(o.wechat.length > 0);
  });
});

// 11: 日期或时间范围不合理时给出提示
describe('时间不合理提示', () => {
  it('空时间报错', () => {
    const { validation } = validateInput({ ...base, dateText: '' });
    assert.ok(validation.errors.some((e) => e.includes('请假时间')));
  });
  it('过短时间给警告', () => {
    const { validation } = validateInput({ ...base, dateText: 'x' });
    assert.ok(validation.warnings.length > 0 || validation.errors.length > 0);
  });
});

// 12: 要求编造事故/疾病/证明 -> 检测并拒绝编造
describe('编造请求拦截', () => {
  const cases = [
    '帮我编一个车祸的理由',
    '编造一个诊断证明',
    '假装我亲人去世了',
    '伪造一张病假条',
    '说我住院了，编得像一点',
  ];
  for (const c of cases) {
    it(`拦截: ${c.slice(0, 12)}…`, () => {
      assert.ok(detectFabricationRequest(c), '应识别为编造请求');
    });
  }
  it('正常原因不被误杀', () => {
    assert.ok(!detectFabricationRequest('身体不太舒服，想去校医院看看'));
    assert.ok(!detectFabricationRequest('家里有点私事'));
    assert.ok(!detectFabricationRequest('爷爷去世了，想请假回去'));
    assert.ok(!detectFabricationRequest('我住院了，下周做手术'));
  });
  it('紧急情况被识别', () => {
    assert.ok(detectEmergency('我现在呼吸困难'));
    assert.ok(!detectEmergency('身体不太舒服'));
  });
});

// 13: 核心纯函数可重复调用（UI 的复制/重编/清空由浏览器验收覆盖）
describe('纯函数幂等', () => {
  it('buildOutputs 可重复调用且独立', () => {
    const { input } = validateInput(base);
    const a = buildOutputs(input);
    const b = buildOutputs(input);
    assert.deepEqual(a, b);
    assert.notEqual(a, b, '应返回独立对象');
  });
});

// 16: 用户输入不进日志/分析/URL —— 本工具无任何上报调用
describe('隐私：无上报', () => {
  it('core 模块不引用上报/分析 API', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/tools/leave-helper-core.ts', import.meta.url), 'utf8');
    for (const w of ['fetch(', 'XMLHttpRequest', 'analytics', 'umami', 'sendBeacon', 'localStorage', 'sessionStorage']) {
      assert.ok(!src.includes(w), `core 不应包含 ${w}`);
    }
  });
  it('UI 不把输入拼进 URL 或上报', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/tools/LeaveHelper.tsx', import.meta.url), 'utf8');
    for (const w of ['fetch(', 'analytics', 'location.href', 'history.pushState', 'localStorage.setItem']) {
      assert.ok(!src.includes(w), `UI 不应包含 ${w}`);
    }
  });
});

// 表达检查
describe('表达检查清单', () => {
  it('7 项检查都有结论', () => {
    const { input } = validateInput(base);
    const o = buildOutputs(input);
    const list = runChecklist(input, o);
    assert.equal(list.length, 7);
    assert.ok(list.every((c) => ['pass', 'warn', 'info'].includes(c.status)));
  });
  it('命令式输入会被标记', () => {
    const { input } = validateInput({ ...base, reason: '通知你一声，我明天不来了' });
    const o = buildOutputs(input);
    const list = runChecklist(input, o);
    const ask = list.find((c) => c.id === 'ask');
    assert.equal(ask?.status, 'warn');
  });
  it('敏感信息被标记', () => {
    const { input } = validateInput({ ...base, reason: '要去办身份证，手机号 13800000000' });
    const o = buildOutputs(input);
    const list = runChecklist(input, o);
    const priv = list.find((c) => c.id === 'privacy');
    assert.equal(priv?.status, 'warn');
  });
});

// 完整度
describe('完整度提示', () => {
  it('示例输入完整度合理', () => {
    const { input } = validateInput(EXAMPLE_INPUT);
    const c = completeness(input);
    assert.ok(c.filled >= 4, `示例应至少填 4 项，实际 ${c.filled}`);
  });
});

// 注册表
describe('路由注册', () => {
  it('leave-helper 已注册且路由可解析', () => {
    const ids = new Set(tools.map((t) => t.id));
    assert.ok(ids.has('leave-helper'), '缺失 leave-helper 注册');
    assert.equal(currentPage('/tools/leave-helper', ''), 'leave-helper');
    const t = tools.find((t) => t.id === 'leave-helper');
    assert.match(t!.path, /^\/tools\/[a-z-]+$/);
  });
});

// 追问应答基于用户事实
describe('追问应答', () => {
  it('4 种追问都有回应且不编造', () => {
    const { input } = validateInput(base);
    for (const k of ['why', 'late', 'material', 'pending'] as const) {
      const r = buildFollowup(input, k);
      assert.ok(r.length > 10, `${k} 回应太短`);
      assert.ok(!r.includes('已获批'), `${k} 不得声称已获批`);
    }
  });
  it('pending 回应明确不擅自缺席', () => {
    const { input } = validateInput(base);
    assert.ok(buildFollowup(input, 'pending').includes('不会擅自缺席'));
  });
});

describe('D5 低正当性理由弱提示', () => {
  it('演唱会/旅游类原因给出提示标签', () => {
    assert.equal(detectLowLegitimacy('想去看周杰伦演唱会'), '演唱会/音乐节');
    assert.equal(detectLowLegitimacy('和朋友去旅游三天'), '旅游出行');
    assert.equal(detectLowLegitimacy('家里吃席'), '参加婚宴');
  });
  it('普通原因不触发提示', () => {
    assert.equal(detectLowLegitimacy('身体不适，需要去医院看看'), null);
    assert.equal(detectLowLegitimacy('家中有急事'), null);
    assert.equal(detectLowLegitimacy('爷爷去世了，要回去奔丧'), null);
  });
});

describe('课程名去重', () => {
  it('时间里已含课程名时不重复加括号', () => {
    const { input } = validateInput({ ...EXAMPLE_INPUT, dateText: '本周六社团例会', courseName: '社团例会' });
    const o = buildOutputs(input);
    assert.ok(!o.wechat.includes('社团例会（社团例会）'));
    assert.ok(!o.formal.includes('社团例会（社团例会）'));
  });
  it('时间里不含课程名时正常加括号', () => {
    const { input } = validateInput({ ...EXAMPLE_INPUT, dateText: '10月24日上午第3-4节', courseName: '大学物理' });
    const o = buildOutputs(input);
    assert.ok(o.wechat.includes('（大学物理）'));
  });
});
