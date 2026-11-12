import { useState } from 'react';
import { ToolPage } from './common';
import { copyLocal } from '../tool-common';
import {
  TARGETS, CHANNELS, STYLES, INPUT_LIMITS,
  validateInput, buildOutputs, optimize, buildFollowup, FOLLOWUP_LABELS,
  runChecklist, completeness, detectFabricationRequest, detectEmergency,
  detectLowLegitimacy,
  EXAMPLE_INPUT,
  type LeaveInput, type LeaveOutputs, type OptimizeMode, type FollowupKind,
} from './leave-helper-core';
import { Copy, Check, Sparkles, Send, ShieldCheck, ChevronDown } from 'lucide-react';

const OPTIMIZE_LABELS: Record<OptimizeMode, string> = {
  shorter: '再短一点',
  natural: '更自然一点',
  formal: '更正式一点',
  private: '少透露隐私',
  deapologize: '去掉过度道歉',
};

const EMPTY: LeaveInput = {
  target: 'course-teacher', targetName: '', reason: '', dateText: '', courseName: '',
  channel: 'wechat', style: 'concise', isUrgent: false, remedy: '', returnText: '',
  keepPrivate: false, signature: '',
};

const PRESET_SCENARIOS = [
  {
    icon: '🤒',
    label: '感冒就医',
    data: {
      target: 'counselor' as const,
      targetName: '导员',
      reason: '突发身体不适伴有低烧，需要前往校医院门诊就诊看病并遵医嘱静养',
      dateText: '今天下午及晚自习',
      remedy: '就诊完后会找班长借课堂笔记补齐',
      keepPrivate: false,
    },
  },
  {
    icon: '🚗',
    label: '紧急私事返家',
    data: {
      target: 'counselor' as const,
      targetName: '导员',
      reason: '家中有突发紧急私事需要回去协助处理，已提前向家长沟通报备',
      dateText: '本周五下午至周末',
      remedy: '返校后第一时间向您销假并补齐作业',
      keepPrivate: false,
    },
  },
  {
    icon: '📝',
    label: '资格考试/比赛',
    data: {
      target: 'course-teacher' as const,
      targetName: '老师',
      reason: '需要前往考点参加全国专业技能资格考试/竞赛',
      dateText: '明天上午（第1-4节）',
      remedy: '考完后及时复习借阅笔记，不耽误课程进度',
      keepPrivate: false,
    },
  },
  {
    icon: '💼',
    label: '企业面试',
    data: {
      target: 'counselor' as const,
      targetName: '导员',
      reason: '已收到企业用人单位正式面试通知，需按时到场参加现场面试',
      dateText: '明天下午（第5-8节）',
      remedy: '面试结束后立即返校并向您报备',
      keepPrivate: false,
    },
  },
  {
    icon: '🔒',
    label: '个人私事（保留隐私）',
    data: {
      target: 'counselor' as const,
      targetName: '导员',
      reason: '因个人原因需要请假',
      dateText: '明天全天',
      remedy: '',
      keepPrivate: true,
    },
  },
];

const QUICK_DATES = [
  '今天下午（第3-4节）',
  '明天全天课程',
  '请假2天（明后两天）',
  '本周五下午至周末',
];

function ChoiceRow<T extends string>({ label, options, value, onChange }: {
  label: string; options: [T, string][]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="study-field">
      <span className="study-field-label">{label}</span>
      <div className="study-choices" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v}
            className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export default function LeaveHelper() {
  const [form, setForm] = useState<LeaveInput>(EMPTY);
  const [outputs, setOutputs] = useState<LeaveOutputs | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fabricate, setFabricate] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [optMode, setOptMode] = useState<OptimizeMode | null>(null);
  const [baseOutputs, setBaseOutputs] = useState<LeaveOutputs | null>(null);
  const [openFu, setOpenFu] = useState<FollowupKind | null>(null);
  const [msg, setMsg] = useState('');
  const [lastInput, setLastInput] = useState<LeaveInput | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const set = <K extends keyof LeaveInput>(k: K, v: LeaveInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setMsg('');
  };

  const applyPreset = (preset: (typeof PRESET_SCENARIOS)[number]) => {
    setForm((prev) => ({
      ...prev,
      ...preset.data,
    }));
    setErrors([]);
    setWarnings([]);
    setFabricate(false);
    setEmergency(false);
    setMsg(`已填入「${preset.label}」快捷模板，点击下方生成即可！`);
  };

  const generate = () => {
    const rawReason = form.reason;
    const isFabricate = detectFabricationRequest(rawReason);
    setFabricate(isFabricate);
    setEmergency(detectEmergency(rawReason));
    // 检测到编造请求：不把"帮我编一个…"当成请假原因，转为保留隐私的表达
    const { input, validation } = validateInput(isFabricate ? { ...form, keepPrivate: true } : form);
    setErrors(validation.errors);
    setWarnings(validation.warnings);
    setLastInput(input);
    if (validation.errors.length > 0) {
      setOutputs(null);
      setBaseOutputs(null);
      return;
    }
    const o = buildOutputs(input);
    setOutputs(o);
    setBaseOutputs(o);
    setOptMode(null);
    setOpenFu(null);
    setMsg('');
    setTimeout(() => {
      document.getElementById('lh-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const applyOptimize = (mode: OptimizeMode) => {
    if (!baseOutputs || !lastInput) return;
    if (mode === optMode) {
      setOutputs(baseOutputs);
      setOptMode(null);
      return;
    }
    setOutputs(optimize(lastInput, baseOutputs, mode));
    setOptMode(mode);
  };

  const copy = async (text: string, label: string, key?: string) => {
    try {
      await copyLocal(text);
      setMsg(`已复制${label}。可直接打开微信发送。`);
      if (key) {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2500);
      }
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          const Evt = window.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
          if (Evt) {
            window.dispatchEvent(new Evt('novip:toast', { detail: { message: `已复制${label}，去微信直接粘贴发给导员吧！` } }));
          }
        }
      } catch {}
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const loadExample = () => {
    setForm({ ...EXAMPLE_INPUT });
    setErrors([]);
    setWarnings([]);
    setFabricate(false);
    setEmergency(false);
    setOutputs(null);
    setBaseOutputs(null);
    setOptMode(null);
    setMsg('已填入虚构示例（人物和事由均为虚构），点"立即生成"看看效果。');
  };

  const reset = () => {
    setForm(EMPTY);
    setOutputs(null);
    setBaseOutputs(null);
    setErrors([]);
    setWarnings([]);
    setFabricate(false);
    setEmergency(false);
    setOptMode(null);
    setOpenFu(null);
    setMsg('');
    setCopiedKey(null);
  };

  const comp = lastInput ? completeness(lastInput) : null;
  const checklist = outputs && lastInput ? runChecklist(lastInput, outputs) : [];

  return (
    <ToolPage id="leave-helper" title="请假理由优化助手"
      description="有事想请假，不知道怎么说？把真实情况说清楚，帮你组织成合适的话。本地整理，不上传、不记录。">
      <p className="study-lead">请假已经够紧张了，消息别再写成检讨书。</p>

      {emergency && (
        <div role="alert" className="study-error">
          检测到你提到的情况可能比较紧急：先处理现实中的紧急情况（比如联系身边的人或拨打急救电话），文案可以晚点再整理，我不会耽误你。
        </div>
      )}
      {fabricate && (
        <div role="alert" className="study-error">
          我不会帮你编造没发生过的事（比如虚构事故、疾病或证明）。你可以把真实情况写清楚，或者勾选"保留隐私"，我帮你组织成得体的说法。
        </div>
      )}

      {/* 1. 快捷场景标签金刚区 */}
      <section className="study-card novip-leave-presets-card" aria-label="快捷高频请假场景">
        <div className="novip-card-head" style={{ marginBottom: 10 }}>
          <Sparkles size={16} className="novip-icon-primary" />
          <h3 style={{ fontSize: 14, margin: 0 }}>⚡ 大学生高频场景一键填入：</h3>
        </div>
        <div className="novip-leave-presets-grid">
          {PRESET_SCENARIOS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="novip-preset-chip-btn"
              onClick={() => applyPreset(p)}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 2. 核心必要信息输入 */}
      <section className="study-card" aria-label="请假信息">
        <h2>先说清楚情况</h2>
        <ChoiceRow label="向谁请假" value={form.target}
          options={Object.entries(TARGETS).map(([k, v]) => [k as LeaveInput['target'], v.label])}
          onChange={(v) => set('target', v)} />

        <div className="study-fields">
          <label>对方称呼（选填）
            <input maxLength={INPUT_LIMITS.targetName} value={form.targetName}
              onChange={(e) => set('targetName', e.target.value)} placeholder="如：李老师 / 导员，不填用默认称呼" />
          </label>
        </div>

        <label className="study-field">真实原因（自由写，可只写概括）
          <textarea maxLength={INPUT_LIMITS.reason} value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="说到大类即可，比如：身体不适 / 家中有急事。不想细说就只写大类，不用描述症状和细节。" rows={3} />
        </label>
        <label className="study-check">
          <input type="checkbox" checked={form.keepPrivate} onChange={(e) => set('keepPrivate', e.target.checked)} />
          保留隐私，不展开原因（生成时用"因个人原因"代替）
        </label>
        {detectLowLegitimacy(form.reason) && !form.keepPrivate && (
          <p className="study-note" style={{ color: '#92400e' }}>
            小提醒：部分学校平时不批{detectLowLegitimacy(form.reason)}类请假，建议先确认本校规定或考虑改期——这里只帮你把话说得体，不做保证。
          </p>
        )}

        <label className="study-field">请假时间<span className="study-req">＊</span>
          <input maxLength={INPUT_LIMITS.dateText} value={form.dateText}
            onChange={(e) => set('dateText', e.target.value)} placeholder="如：10月24日（周五）上午第3-4节" />
        </label>

        <div className="novip-quick-date-row" style={{ marginTop: -8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>快捷时间：</span>
          {QUICK_DATES.map((d) => (
            <button
              key={d}
              type="button"
              className="novip-quick-date-btn"
              onClick={() => set('dateText', d)}
            >
              {d}
            </button>
          ))}
        </div>

        {/* 3. 折叠的高级备案信息（需要写正式书面审批时才展开） */}
        <details className="novip-collapsible-options" style={{ margin: '14px 0', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📋 展开更多官方假条备案信息（补救安排、返校时间、课程名、署名等）</span>
            <ChevronDown size={14} />
          </summary>
          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="study-fields">
              <label>课程或活动名称（选填）
                <input maxLength={INPUT_LIMITS.courseName} value={form.courseName}
                  onChange={(e) => set('courseName', e.target.value)} placeholder="如：大学物理 / 社团例会" />
              </label>
              <label>补救安排（选填，有就写）
                <input maxLength={INPUT_LIMITS.remedy} value={form.remedy}
                  onChange={(e) => set('remedy', e.target.value)} placeholder="如：课后找同学借笔记补上" />
              </label>
            </div>
            <div className="study-fields">
              <label>返校 / 恢复时间（选填）
                <input maxLength={INPUT_LIMITS.returnText} value={form.returnText}
                  onChange={(e) => set('returnText', e.target.value)} placeholder="如：当天下午返校" />
              </label>
              <label>署名（选填）
                <input maxLength={INPUT_LIMITS.signature} value={form.signature}
                  onChange={(e) => set('signature', e.target.value)} placeholder="如：学生 张三" />
              </label>
            </div>
            <ChoiceRow label="沟通形式" value={form.channel}
              options={Object.entries(CHANNELS).map(([k, v]) => [k as LeaveInput['channel'], v])}
              onChange={(v) => set('channel', v)} />
            <ChoiceRow label="表达风格" value={form.style}
              options={Object.entries(STYLES).map(([k, v]) => [k as LeaveInput['style'], v])}
              onChange={(v) => set('style', v)} />
            <label className="study-check">
              <input type="checkbox" checked={form.isUrgent} onChange={(e) => set('isUrgent', e.target.checked)} />
              临时请假（通知比较晚）
            </label>
            {form.isUrgent && (
              <p className="study-note">很急的话，建议先打电话说明情况，消息随后补上——别只发消息就当请好了。</p>
            )}
          </div>
        </details>

        <div className="study-actions" style={{ marginTop: 16 }}>
          <button
            className="novip-btn-tactile novip-btn-tactile--primary"
            style={{ width: '100%', maxWidth: 320, padding: '12px 20px', fontSize: 15 }}
            onClick={generate}
          >
            <Send size={16} />
            <span>⚡ 立即生成三版请假文案</span>
          </button>
          <button className="study-btn alt" onClick={loadExample}>试试虚构示例</button>
          <button className="study-btn alt" onClick={reset}>清空</button>
        </div>

        {errors.length > 0 && (
          <div role="alert" className="study-error" style={{ marginTop: 12 }}>
            {errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="study-note" role="note" style={{ marginTop: 12 }}>
            {warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}
        <p role="status" style={{ marginTop: 8, color: '#059669', fontWeight: 600 }}>{msg}</p>

        <div className="novip-privacy-note" style={{ marginTop: 12 }}>
          <ShieldCheck size={14} />
          <span>本地规则纯端侧生成，无 AI 接口调用，请假内容绝不上传云端</span>
        </div>
      </section>

      {/* 4. 生成结果展示与强闭环复制 */}
      {outputs && lastInput && (
        <section className="study-card" id="lh-result" aria-label="生成结果">
          <h2>三版消息，拿去用</h2>
          {([
            ['wechat', '微信短消息', '简洁自然，复制就能发'],
            ['formal', '完整说明', '称呼、时间、原因、补救都在'],
            ['face', '当面开口版', '口语化，照着说就行'],
          ] as [keyof LeaveOutputs, string, string][]).map(([k, title, desc]) => {
            const isWechat = k === 'wechat';
            const isCopied = copiedKey === k;
            return (
              <div
                className={`study-result ${isWechat ? 'novip-result-highlight' : ''}`}
                key={k}
                style={{
                  border: isWechat ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px 18px',
                  marginBottom: 16,
                  background: isWechat ? '#f8faff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {title}
                    {isWechat && (
                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                        ⭐ 大学生首选
                      </span>
                    )}
                    <small style={{ color: '#64748b', fontWeight: 400 }}>{desc}</small>
                  </h3>
                </div>
                <pre className="study-pre" style={{ margin: '12px 0', fontSize: 13, lineHeight: 1.7, background: '#fff' }}>
                  {outputs[k]}
                </pre>
                <div className="study-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className={`novip-btn-tactile ${isCopied ? 'novip-btn-tactile--success' : isWechat ? 'novip-btn-tactile--primary' : 'novip-btn-tactile--secondary'}`}
                    style={{ minWidth: 200, padding: '10px 18px' }}
                    onClick={() => copy(outputs[k], title, k)}
                  >
                    {isCopied ? <Check size={16} /> : <Copy size={16} />}
                    <span>{isCopied ? '✓ 已复制到剪贴板！去微信直接粘贴' : `一键复制${title}`}</span>
                  </button>
                </div>
                <p className="study-note" style={{ marginTop: 8 }}>已发送 ≠ 已批准，记得确认对方批复。</p>
              </div>
            );
          })}

          <h2>二次调整</h2>
          <div className="study-choices">
            {(Object.keys(OPTIMIZE_LABELS) as OptimizeMode[]).map((m) => (
              <button key={m} type="button" aria-pressed={optMode === m}
                className={optMode === m ? 'on' : ''} onClick={() => applyOptimize(m)}>
                {OPTIMIZE_LABELS[m]}
              </button>
            ))}
          </div>
          <p className="study-note">所有改写都保留你填的时间、对象和事实，不会因为"优化"改变请假原因。再点一次可恢复。</p>

          <h2>如果被追问</h2>
          {(Object.keys(FOLLOWUP_LABELS) as FollowupKind[]).map((k) => (
            <div className="study-faq" key={k}>
              <button type="button" aria-expanded={openFu === k}
                onClick={() => setOpenFu(openFu === k ? null : k)}>
                {FOLLOWUP_LABELS[k].title}<small>{FOLLOWUP_LABELS[k].desc}</small>
              </button>
              {openFu === k && (
                <div>
                  <pre className="study-pre">{buildFollowup(lastInput, k)}</pre>
                  <div className="study-actions">
                    <button
                      type="button"
                      className={`novip-btn-tactile ${copiedKey === `fu-${k}` ? 'novip-btn-tactile--success' : 'novip-btn-tactile--secondary'}`}
                      onClick={() => copy(buildFollowup(lastInput, k), '追问回复', `fu-${k}`)}
                    >
                      {copiedKey === `fu-${k}` ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedKey === `fu-${k}` ? '✓ 已复制！' : '复制这条回复'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <h2>表达检查</h2>
          <ul className="study-checklist">
            {checklist.map((c) => (
              <li key={c.id} className={`st-${c.status}`}>
                <strong>{c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : 'i'} {c.label}</strong>
                <span>{c.detail}</span>
              </li>
            ))}
          </ul>
          {comp && (
            <p className="study-note">
              信息完整度：{comp.filled}/{comp.total}
              {comp.missing.length > 0 ? `（还可补充：${comp.missing.join('、')}）` : '（关键信息都齐了）'}
              ——只检查信息与表达完整度，不预测老师会不会批准。
            </p>
          )}
        </section>
      )}

      <section className="study-card" aria-label="说明">
        <h2>说明</h2>
        <ul className="study-list">
          <li><strong>本地表达整理</strong>：所有措辞由本机规则生成，没有调用 AI 接口，你的请假内容不会被上传或记录。</li>
          <li>生成结果只使用你填写的信息，不会添加"已挂号""家长已同意"这类你没说过的话。</li>
          <li>不承诺批准效果；"完整度"只看信息齐不齐，不预测老师的决定。</li>
          <li>本工具不代发消息、不对接任何请假系统，复制后由你自己发送。</li>
          <li>遇到紧急情况请先处理现实问题，不要为了等文案耽误时间。</li>
          <li>各校请假流程差别很大（几天找谁批、要什么证明、能不能补假都不一样），关键步骤请先查本校学生手册。</li>
        </ul>
      </section>
    </ToolPage>
  );
}
