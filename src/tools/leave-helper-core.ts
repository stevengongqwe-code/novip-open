/**
 * 请假理由优化助手 · 本地表达整理核心
 *
 * 纯前端本地规则实现：不调用任何 AI 接口，不上传、不记录用户输入。
 * 铁律：
 *  - 只使用用户提供的信息，绝不编造"已挂号/家长已同意/附诊断证明/已安排同学代办"等事实；
 *  - 检测到"编造事故/疾病/证明"类请求时，拒绝编造，转为整理真实情况或保留隐私的表达；
 *  - 不承诺批准效果，不做"批准概率"评分。
 */

// ---------- 类型 ----------

export type LeaveTarget = 'course-teacher' | 'counselor' | 'advisor' | 'intern-supervisor' | 'club-lead';
export type LeaveChannel = 'wechat' | 'formal' | 'face';
export type LeaveStyle = 'concise' | 'polite' | 'familiar';

export interface LeaveInput {
  target: LeaveTarget;
  /** 对方称呼（选填），如"李老师"/"王经理"。不填则用默认称呼 */
  targetName: string;
  /** 真实原因自由输入；可只写概括性描述 */
  reason: string;
  /** 请假日期/时段，如"10月24日（周五）上午第3-4节" */
  dateText: string;
  /** 课程或活动名称（选填） */
  courseName: string;
  channel: LeaveChannel;
  style: LeaveStyle;
  /** 是否临时请假 */
  isUrgent: boolean;
  /** 补救安排（选填），原样引用，不改写事实 */
  remedy: string;
  /** 返校/恢复时间（选填） */
  returnText: string;
  /** 希望保留隐私，不展开原因 */
  keepPrivate: boolean;
  /** 署名（选填） */
  signature: string;
}

export interface LeaveOutputs {
  wechat: string;
  formal: string;
  face: string;
}

export type OptimizeMode = 'shorter' | 'natural' | 'formal' | 'private' | 'deapologize';

export type FollowupKind = 'why' | 'late' | 'material' | 'pending';

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'info';
  detail: string;
}

// ---------- 常量 ----------

export const TARGETS: Record<LeaveTarget, { label: string; teacherLike: boolean; defaultSal: string }> = {
  'course-teacher': { label: '任课老师', teacherLike: true, defaultSal: '老师' },
  'counselor': { label: '辅导员', teacherLike: true, defaultSal: '老师' },
  'advisor': { label: '导师', teacherLike: true, defaultSal: '老师' },
  'intern-supervisor': { label: '实习负责人', teacherLike: false, defaultSal: '您好' },
  'club-lead': { label: '社团负责人', teacherLike: false, defaultSal: '你好' },
};

export const CHANNELS: Record<LeaveChannel, string> = {
  wechat: '微信短消息',
  formal: '正式申请',
  face: '当面说',
};

export const STYLES: Record<LeaveStyle, string> = {
  concise: '简洁自然',
  polite: '礼貌正式',
  familiar: '熟悉但有分寸',
};

export const INPUT_LIMITS = {
  reason: 500,
  dateText: 120,
  targetName: 20,
  courseName: 60,
  remedy: 200,
  returnText: 80,
  signature: 30,
} as const;

// ---------- 基础工具 ----------

const trim = (s: string) => s.replace(/\s+/g, ' ').trim();

/** 简单确定性 hash：同一输入 -> 同一措辞变体，保证多次改写事实一致 */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hashStr(seed) % arr.length];
}

/** 去掉原因开头已有的"因为/由于"，避免"因为因为…" */
function cleanReason(reason: string): string {
  return trim(reason).replace(/^(因为|由于|是?因为)\s*/, '');
}

// ---------- 输入校验 ----------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateInput(raw: Partial<LeaveInput>): { input: LeaveInput; validation: ValidationResult } {
  const input: LeaveInput = {
    target: raw.target && TARGETS[raw.target] ? raw.target : 'course-teacher',
    targetName: trim(raw.targetName ?? '').slice(0, INPUT_LIMITS.targetName),
    reason: trim(raw.reason ?? '').slice(0, INPUT_LIMITS.reason),
    dateText: trim(raw.dateText ?? '').slice(0, INPUT_LIMITS.dateText),
    courseName: trim(raw.courseName ?? '').slice(0, INPUT_LIMITS.courseName),
    channel: raw.channel && CHANNELS[raw.channel] ? raw.channel : 'wechat',
    style: raw.style && STYLES[raw.style] ? raw.style : 'concise',
    isUrgent: !!raw.isUrgent,
    remedy: trim(raw.remedy ?? '').slice(0, INPUT_LIMITS.remedy),
    returnText: trim(raw.returnText ?? '').slice(0, INPUT_LIMITS.returnText),
    keepPrivate: !!raw.keepPrivate,
    signature: trim(raw.signature ?? '').slice(0, INPUT_LIMITS.signature),
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.dateText) errors.push('请填写请假时间（日期/时段），这是请假消息里最关键的信息。');
  if (!input.reason && !input.keepPrivate)
    errors.push('请简单写一下请假原因（可以只写概括，如"身体不舒服"）；或勾选"保留隐私，不展开原因"。');
  if (input.reason && input.keepPrivate)
    warnings.push('你同时填写了原因又勾选了保留隐私：生成时会用"因个人原因"代替具体原因。');
  if (input.dateText && input.dateText.length < 2)
    warnings.push('请假时间写得太短了，对方可能看不明白是哪天、哪节课。');
  return { input, validation: { errors, warnings } };
}

// ---------- 安全检测 ----------

// ---------- 低正当性理由提示（D5：只提示、不阻止、不评判） ----------
// 依据：E02 中山大学明文"平时旅游不批"、E01 哈金融"正常上课期间原则上不准事假"、E10/E13。
// 只是弱提示——各校规定差异大（D1），不做断言。
const LOW_LEGIT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /演唱会|音乐节|livehouse/i, label: '演唱会/音乐节' },
  { re: /旅游|出游|出去玩|散心|自驾游/i, label: '旅游出行' },
  { re: /吃席|喝喜酒|婚礼/i, label: '参加婚宴' },
  { re: /追星|见偶像|粉丝见面/i, label: '追星活动' },
  { re: /开黑|打游戏|网吧/i, label: '娱乐活动' },
];
export function detectLowLegitimacy(reason: string): string | null {
  for (const p of LOW_LEGIT_PATTERNS) if (p.re.test(reason)) return p.label;
  return null;
}

/** 要求编造事故/疾病/证明的请求：不生成虚构事实 */
const FABRICATE_PATTERNS = [
  /编(造|个|一下|得)/, /帮我编/, /编.{0,8}(理由|借口|病|证明|假条)/, /编得(像|真)/,
  /假装/, /伪造/, /装病/, /谎称/,
  /诊断证明/, /病假条/,
];

export function detectFabricationRequest(text: string): boolean {
  return FABRICATE_PATTERNS.some((p) => p.test(text));
}

/** 紧急/危险情况：不拖延生成，先提醒处理现实紧急情况；不做诊断 */
const EMERGENCY_PATTERNS = [
  /自杀/, /自残/, /想死/, /活不下去/, /割腕/, /跳楼/,
  /大出血/, /昏迷/, /休克/, /呼吸困难/, /胸痛难忍/,
  /120/, /急救/, /救护车/,
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

// ---------- 称呼与句式 ----------

function salutation(input: LeaveInput): string {
  const name = input.targetName;
  const meta = TARGETS[input.target];
  if (!name) return meta.defaultSal;
  if (meta.teacherLike) {
    return /(老师|教授|导员)$/.test(name) ? name : `${name}老师`;
  }
  return name;
}

/** 原因句：保留隐私时用中性说法，绝不脑补"家里有事"等具体事实 */
function reasonClause(input: LeaveInput, seed: string, spoken: boolean): string {
  if (input.keepPrivate) {
    return pick(['因个人原因', '有点私事需要处理一下', '有些个人事务要处理'], seed + 'private');
  }
  const r = cleanReason(input.reason);
  if (!r) return pick(['有点事情需要处理一下', '有些事要处理'], seed + 'empty');
  if (spoken) return pick([`就是${r}`, `主要是${r}`, `${r}，得去处理一下`], seed + 'spoken');
  return pick([`因为${r}`, `由于${r}`, `${r}`], seed + 'written');
}

function urgentClause(input: LeaveInput, seed: string): string {
  if (!input.isUrgent) return '';
  return pick(
    ['不好意思，这么临时才跟您说。', '抱歉通知得有点晚，确实是临时有情况。', '实在不好意思，时间有点赶，刚确定下来就马上跟您说了。'],
    seed + 'urgent',
  );
}

function remedySentence(input: LeaveInput): string {
  if (!input.remedy) return '';
  // 原样引用用户提供的补救安排，不改写、不脑补
  return input.remedy;
}

function returnSentence(input: LeaveInput): string {
  if (!input.returnText) return '';
  return input.returnText;
}

function courseRef(input: LeaveInput): string {
  if (!input.courseName) return '';
  // 时间里已经写了课程/活动名，不再重复加括号
  if (input.dateText.includes(input.courseName)) return '';
  return `（${input.courseName}）`;
}

// ---------- 三版本生成 ----------

export function buildOutputs(input: LeaveInput): LeaveOutputs {
  const sal = salutation(input);
  // 防御：UI 层会拦截空时间，这里兜底避免模板出现"请个假：，"这种断裂
  const timeText = input.dateText || '这段时间';
  const seed = `${input.target}|${input.targetName}|${input.reason}|${timeText}|${input.style}`;
  const teacherLike = TARGETS[input.target].teacherLike;
  const polite = input.style === 'polite';
  const familiar = input.style === 'familiar';

  // 敬语选择
  const hello = polite ? '您好' : familiar && !teacherLike ? '你好' : teacherLike ? '您好' : '你好';
  const you = polite ? '您' : familiar ? '你' : teacherLike ? '您' : '你';
  const thanks = polite
    ? '麻烦您了，非常感谢！'
    : familiar
      ? '麻烦啦，谢谢！'
      : '麻烦您了，谢谢！';
  const askWord = polite ? '恳请批准' : familiar ? '麻烦批一下' : '请批准';
  const remedyLabel =
    input.target === 'intern-supervisor' ? '工作交接：' : input.target === 'club-lead' ? '活动这边：' : '关于落下的部分：';

  // ---- 微信短消息：简洁自然，直接复制 ----
  const wechatParts: string[] = [];
  const wOpen = pick(
    [`${sal}${hello}，我想请个假`, `${hello}，${sal}，想跟${you}请个假`, `打扰一下${sal}，我想请个假`],
    seed + 'w-open',
  );
  wechatParts.push(`${wOpen}：${timeText}${courseRef(input)}，${reasonClause(input, seed, false)}。`);
  const urg = urgentClause(input, seed);
  if (urg) wechatParts.push(urg);
  const rem = remedySentence(input);
  if (rem) wechatParts.push(`${rem}。`);
  const ret = returnSentence(input);
  if (ret) wechatParts.push(`${ret}。`);
  wechatParts.push(thanks);
  const wechat = wechatParts.join('');

  // ---- 完整说明：称呼 + 时间 + 原因 + 申请语气 + 补救 ----
  const fLines: string[] = [];
  fLines.push(`${sal}：`, '');
  const reasonShort = cleanReason(input.keepPrivate ? '' : input.reason);
  const reasonForFormal = input.keepPrivate
    ? pick(['因个人原因', '因有些个人事务需要处理'], seed + 'f-reason')
    : reasonShort
      ? pick([`因${reasonShort}`, `由于${reasonShort}`], seed + 'f-reason')
      : '因有些事情需要处理';
  fLines.push(
    pick(
      [
        `${hello}！我想申请请假，时间是${timeText}${courseRef(input)}，${reasonForFormal}。`,
        `${hello}！${reasonForFormal}，想申请${timeText}${courseRef(input)}的假。`,
      ],
      seed + 'f-open',
    ),
  );
  const urgF = urgentClause(input, seed);
  if (urgF) fLines.push(urgF);
  if (rem) fLines.push(`${remedyLabel}${rem}。`);
  if (ret) fLines.push(`${ret}。`);
  fLines.push('', `${askWord}，谢谢！`);
  if (input.signature) fLines.push('', input.signature);
  const formal = fLines.join('\n');

  // ---- 当面开口版：口语化，适合说出口 ----
  const faceParts: string[] = [];
  faceParts.push(
    pick(
      [`${sal}${hello}，不好意思打扰一下，我想请个假。`, `${hello}${sal}，耽误您一分钟，我想请个假。`, `${sal}，那个……我想请个假。`],
      seed + 'face-open',
    ),
  );
  faceParts.push(`${timeText}${courseRef(input)}${reasonClause(input, seed, true)}。`);
  if (urg) faceParts.push('确实有点突然，不好意思。');
  if (rem) faceParts.push(`${rem}。`);
  if (ret) faceParts.push(`${ret}。`);
  faceParts.push(polite ? '麻烦您了，谢谢！' : familiar ? '谢啦！' : teacherLike ? '谢谢老师！' : '谢谢！');
  const face = faceParts.join('');

  return { wechat, formal, face };
}

// ---------- 二次优化 ----------

export function optimize(input: LeaveInput, outputs: LeaveOutputs, mode: OptimizeMode): LeaveOutputs {
  const sal = salutation(input);
  switch (mode) {
    case 'shorter': {
      // 更短：压缩客套，保留全部事实（时间/原因/补救/返校）
      const bits: string[] = [`${sal}，我想请个假：${input.dateText}${courseRef(input)}，${reasonClause(input, 'shorter', false)}。`];
      if (input.isUrgent) bits.push('抱歉通知晚了。');
      const rem = remedySentence(input);
      if (rem) bits.push(`${rem}。`);
      const ret = returnSentence(input);
      if (ret) bits.push(`${ret}。`);
      bits.push('谢谢！');
      const short = bits.join('');
      return { wechat: short, formal: short, face: short };
    }
    case 'natural': {
      // 更自然：口语连接，去掉"恳请"类书面语
      const nat = (s: string) =>
        s
          .replace(/恳请批准/g, '麻烦批一下')
          .replace(/非常感谢/g, '谢谢')
          .replace(/您好！/g, '你好！')
          .replace(/关于落下的部分：/g, '');
      return { wechat: nat(outputs.wechat), formal: nat(outputs.formal), face: nat(outputs.face) };
    }
    case 'formal': {
      // 更正式：敬语拉满
      const f = (s: string) =>
        s
          .replace(/麻烦批一下/g, '恳请批准')
          .replace(/麻烦啦，谢谢！/g, '麻烦您了，非常感谢！')
          .replace(/谢啦！/g, '谢谢！')
          .replace(/你好！/g, '您好！');
      return { wechat: f(outputs.wechat), formal: f(outputs.formal), face: f(outputs.face) };
    }
    case 'private': {
      // 少透露隐私：原因替换为中性说法，其余不变
      const privInput = { ...input, keepPrivate: true };
      return buildOutputs(privInput);
    }
    case 'deapologize': {
      // 去掉过度道歉：保留至多一句致歉表达
      const deap = (s: string) => {
        let count = 0;
        return s
          .split(/(。|！|？|\n)/)
          .map((seg) => {
            if (/不好意思|抱歉|对不起|实在抱歉/.test(seg)) {
              count++;
              if (count > 1) return seg.replace(/不好意思，?|抱歉，?|对不起，?|实在抱歉，?/g, '');
            }
            return seg;
          })
          .join('');
      };
      return { wechat: deap(outputs.wechat), formal: deap(outputs.formal), face: deap(outputs.face) };
    }
  }
}

// ---------- 追问应答 ----------

export function buildFollowup(input: LeaveInput, kind: FollowupKind): string {
  const sal = salutation(input);
  const timeRef = input.dateText || '请假的时间';
  switch (kind) {
    case 'why':
      // 老师问"具体什么事"：保留隐私、不编造细节
      return input.keepPrivate || !input.reason
        ? `${sal}，是一些个人事务，不太方便细说。时间是${timeRef}，落下的部分我会按要求补上。需要我走什么流程或补什么材料吗？`
        : `${sal}，${reasonClause(input, 'fu', false)}。时间是${timeRef}，更具体的不太方便多说，落下的部分我会补上。需要我补什么材料吗？`;
    case 'late':
      // 临时请假：说明通知较晚，不找借口
      return `不好意思${sal}，这次确实通知得有点晚，${reasonClause(input, 'fu', false)}，刚确定下来就马上跟您说了。${timeRef}的假，落下的部分我会补上，麻烦您了！`;
    case 'material':
      // 需要补材料：询问真实流程，不伪造证明
      return `好的${sal}，我按要求准备。请问需要补交什么材料、交到哪里、截止时间是什么时候？我这边准备好就交过去。`;
    case 'pending':
      // 暂未获批：询问流程或备选安排，不擅自缺席
      return `${sal}您好，我${timeRef}的请假还在等批复。想问下大概需要走什么流程，或者有没有备选安排？在确认之前我不会擅自缺席，谢谢！`;
  }
}

export const FOLLOWUP_LABELS: Record<FollowupKind, { title: string; desc: string }> = {
  why: { title: '老师问"具体什么事"', desc: '保留隐私、不编造细节的回应' },
  late: { title: '临时请假，通知晚了', desc: '说明通知较晚，不找借口' },
  material: { title: '需要补交材料', desc: '询问真实流程，不伪造证明' },
  pending: { title: '还没批下来', desc: '询问流程/备选，不擅自缺席' },
};

// ---------- 表达检查 ----------

export function runChecklist(input: LeaveInput, outputs: LeaveOutputs): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const all = `${outputs.wechat}\n${outputs.formal}\n${outputs.face}`;

  // 1. 时间明确
  items.push(
    input.dateText
      ? { id: 'time', label: '请假时间是否明确', status: 'pass', detail: `已写明：${input.dateText}` }
      : { id: 'time', label: '请假时间是否明确', status: 'warn', detail: '还没填请假时间，这是请假消息里最重要的信息。' },
  );

  // 2. 称呼合适
  items.push({
    id: 'sal',
    label: '称呼是否合适',
    status: 'info',
    detail: input.targetName ? `用了"${salutation(input)}"，发送前确认对方确实这么称呼。` : `用了默认称呼"${salutation(input)}"，知道对方姓名的话建议填上。`,
  });

  // 3. 申请而非单方面通知
  const notifyWords = ['通知你', '通知您', '我就不来', '不用来了', '爱批不批', '反正'];
  const hitNotify = notifyWords.find((w) => all.includes(w) || input.reason.includes(w));
  items.push(
    hitNotify
      ? { id: 'ask', label: '是申请，而不是单方面通知', status: 'warn', detail: `出现了"${hitNotify}"这类说法，容易显得像通知。建议改成"想申请请假""恳请批准"。` }
      : { id: 'ask', label: '是申请，而不是单方面通知', status: 'pass', detail: '用的是"想请个假""恳请批准"这类申请语气。' },
  );

  // 4. 补救安排（用户提供的才算）
  items.push(
    input.remedy
      ? { id: 'remedy', label: '有没有补救安排', status: 'pass', detail: '已包含你提供的补救安排，没有脑补。' }
      : { id: 'remedy', label: '有没有补救安排', status: 'info', detail: '你没填补救安排，生成结果里不会编造；如果有（比如"课后借笔记"），填上会显得更有责任感。' },
  );

  // 5. 不必要的隐私
  const sensitive = ['身份证', '学号', '手机号', '电话', '家庭住址', '父母'];
  const hitSensitive = sensitive.find((w) => input.reason.includes(w));
  items.push(
    hitSensitive
      ? { id: 'privacy', label: '是否包含不必要的隐私', status: 'warn', detail: `原因里出现了"${hitSensitive}"，请假消息里一般不需要。可用"少透露隐私"一键替换。` }
      : { id: 'privacy', label: '是否包含不必要的隐私', status: 'pass', detail: input.keepPrivate ? '已按"保留隐私"生成，只用了"因个人原因"。' : '没发现身份证、电话、家庭住址这类敏感信息。' },
  );

  // 6. 重复或过度道歉
  const apologies = (all.match(/不好意思|抱歉|对不起/g) || []).length;
  items.push(
    apologies > 4
      ? { id: 'apology', label: '是否重复或过度道歉', status: 'warn', detail: `三版加起来道歉了 ${apologies} 次，有点多。可用"去掉过度道歉"精简。` }
      : { id: 'apology', label: '是否重复或过度道歉', status: 'pass', detail: '致歉表达适度，没有写成检讨书。' },
  );

  // 7. 未经确认的事实
  const invented = ['已挂号', '家长已同意', '附诊断证明', '诊断证明', '必须回老家', '已安排同学代办', '已请好假', '已获批'];
  const hitInvented = invented.find((w) => all.includes(w));
  items.push(
    hitInvented
      ? { id: 'facts', label: '是否新增了未经确认的事实', status: 'warn', detail: `发现"${hitInvented}"——请检查是否真是你提供的信息。` }
      : { id: 'facts', label: '是否新增了未经确认的事实', status: 'pass', detail: '生成结果只用了你填写的信息，没有添加"已挂号""家长已同意"这类没说过的话。' },
  );

  return items;
}

/** 信息完整度提示（只检查信息与表达完整度，不预测批准概率） */
export function completeness(input: LeaveInput): { filled: number; total: number; missing: string[] } {
  const fields: [string, boolean][] = [
    ['请假时间', !!input.dateText],
    ['请假原因', !!input.reason || input.keepPrivate],
    ['对方称呼', !!input.targetName],
    ['课程/活动名称', !!input.courseName],
    ['补救安排', !!input.remedy],
    ['返校/恢复时间', !!input.returnText],
  ];
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  return { filled: fields.length - missing.length, total: fields.length, missing };
}

// ---------- 虚构示例 ----------

export const EXAMPLE_INPUT: LeaveInput = {
  target: 'course-teacher',
  targetName: '李老师',
  reason: '身体不太舒服，想去校医院看看',
  dateText: '10月24日（周五）上午第3-4节',
  courseName: '大学物理',
  channel: 'wechat',
  style: 'concise',
  isUrgent: false,
  remedy: '课后找同学借笔记，把落下的内容补上',
  returnText: '当天下午返校',
  keepPrivate: false,
  signature: '',
};

/** 供自动化测试与人工审读的虚构场景（全部虚构） */
export const SCENARIOS: { name: string; input: LeaveInput }[] = [
  {
    name: '身体不适向任课老师请半天假',
    input: { ...EXAMPLE_INPUT },
  },
  {
    name: '私人事务向辅导员请假，不愿透露细节',
    input: {
      target: 'counselor', targetName: '', reason: '家里有点私事', dateText: '10月25日全天',
      courseName: '', channel: 'wechat', style: 'polite', isUrgent: false,
      remedy: '', returnText: '10月26日返校', keepPrivate: true, signature: '',
    },
  },
  {
    name: '面试向实习负责人申请调整时间',
    input: {
      target: 'intern-supervisor', targetName: '王经理', reason: '有个面试安排冲突了', dateText: '10月24日下午',
      courseName: '', channel: 'wechat', style: 'familiar', isUrgent: true,
      remedy: '手头的工作上午提前做完，交接给小刘', returnText: '', keepPrivate: false, signature: '',
    },
  },
  {
    name: '向社团负责人说明不能参加活动',
    input: {
      target: 'club-lead', targetName: '学姐', reason: '那天要参加学院的讲座', dateText: '10月26日晚上',
      courseName: '社团例会', channel: 'wechat', style: 'familiar', isUrgent: false,
      remedy: '会议纪要我会后找人要', returnText: '', keepPrivate: false, signature: '',
    },
  },
  {
    name: '临时请假，需要说明通知较晚',
    input: {
      target: 'course-teacher', targetName: '', reason: '早上起来发烧了', dateText: '今天上午的课',
      courseName: '', channel: 'wechat', style: 'concise', isUrgent: true,
      remedy: '', returnText: '烧退了就去上下午的课', keepPrivate: false, signature: '',
    },
  },
  {
    name: '只填极少信息',
    input: {
      target: 'course-teacher', targetName: '', reason: '', dateText: '',
      courseName: '', channel: 'wechat', style: 'concise', isUrgent: false,
      remedy: '', returnText: '', keepPrivate: false, signature: '',
    },
  },
  {
    name: '导师+正式申请+署名',
    input: {
      target: 'advisor', targetName: '张教授', reason: '要去参加一个学术会议', dateText: '10月28日-29日',
      courseName: '组会', channel: 'formal', style: 'polite', isUrgent: false,
      remedy: '组会汇报材料提前发到群里', returnText: '10月30日回来', keepPrivate: false, signature: '学生 陈晨',
    },
  },
  {
    name: '当面说版本',
    input: {
      target: 'course-teacher', targetName: '刘老师', reason: '牙疼得厉害，约了牙医', dateText: '明天下午',
      courseName: '', channel: 'face', style: 'concise', isUrgent: false,
      remedy: '回来找同学补笔记', returnText: '', keepPrivate: false, signature: '',
    },
  },
];
