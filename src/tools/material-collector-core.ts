// 材料收集助手 · 纯逻辑（无 DOM 依赖，可单元测试）
// 原则：宁可标记"待确认"，也不把别人的材料分错。所有处理在本机内存完成。
// 覆盖：名单导入 → 材料要求 → 文件匹配 → 人工修正 → 状态核对 → 导出规划。

let uidSeq = 0;
export function newUid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}_${uidSeq.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- 基础类型 ----------

export interface Person {
  /** 内部唯一标识，不直接用姓名当键 */
  id: string;
  name: string;
  /** 学号等唯一编号，可为空 */
  code: string;
}

export interface Requirement {
  id: string;
  name: string;
  /** true=必交，false=选交（选交缺失不导致"缺材料"） */
  required: boolean;
  /** 允许的扩展名，小写、无点，如 ['docx','pdf'] */
  extensions: string[];
  /** 单文件大小上限（字节） */
  maxBytes: number;
  /** 每人需要的文件数量，默认 1 */
  count: number;
  /** 文件名关键词，用于辅助区分材料类别 */
  keywords: string[];
}

export interface InFile {
  id: string;
  name: string;
  /** 不含扩展名的文件名主体 */
  base: string;
  /** 小写扩展名，无点；无扩展名则为 '' */
  ext: string;
  size: number;
  /** ZIP 内原始路径（直接选择的文件无此项） */
  sourcePath?: string;
}

export interface Override {
  personId?: string | null;
  reqId?: string | null;
  ignored?: boolean;
}

// ---------- 文件名基础工具（本文件自包含，不依赖其他未合并分支） ----------

const MAX_BASE_LEN = 120;
const ILLEGAL_RE = /[\\/:*?"<>|\x00-\x1f]/g;
const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export function splitName(filename: string): { base: string; ext: string } {
  const i = filename.lastIndexOf('.');
  if (i <= 0 || i === filename.length - 1) return { base: filename, ext: '' };
  return { base: filename.slice(0, i), ext: filename.slice(i + 1) };
}

/** 清理文件名中的非法字符（Windows/ZIP 通用） */
export function sanitizeFileName(name: string): { name: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = name.replace(ILLEGAL_RE, '_');
  if (out !== name) warnings.push('含特殊字符，已替换为下划线');
  out = out.replace(/[.\s]+$/g, '');
  if (!warnings.length && out !== name) warnings.push('结尾多余的点/空格已去掉');
  if (!out) { out = '未命名文件'; warnings.push('文件名为空，已用默认名'); }
  if (out.length > MAX_BASE_LEN) { out = out.slice(0, MAX_BASE_LEN); warnings.push(`文件名过长，已截断至${MAX_BASE_LEN}字符`); }
  if (RESERVED.has(out.toLowerCase())) { out = `${out}_`; warnings.push('与系统保留名冲突，已加后缀'); }
  return { name: out, warnings };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** CSV 单元格转义：防公式注入（=、+、-、@ 开头加单引号） */
export function csvCell(value: string): string {
  const safe = /^[=\-+@]/.test(value.trimStart()) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

// ---------- A. 名单导入 ----------

export interface RosterEntry { line: number; name: string; code: string }

export function parseRosterText(text: string): { entries: RosterEntry[]; skippedEmpty: number; notes: string[] } {
  const entries: RosterEntry[] = [];
  const notes: string[] = [];
  let skippedEmpty = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) { skippedEmpty += 1; continue; }
    const tokens = raw.split(/\s+/);
    let name = raw, code = '';
    // 最后一列看起来像编号（含数字的字母数字串）时，视为"姓名 编号"
    if (tokens.length >= 2 && /^[A-Za-z0-9_-]{2,32}$/.test(tokens[tokens.length - 1]) && /\d/.test(tokens[tokens.length - 1])) {
      code = tokens[tokens.length - 1];
      name = tokens.slice(0, -1).join(' ');
    }
    entries.push({ line: i + 1, name: name.trim(), code: code.trim() });
  }
  if (skippedEmpty > 0) notes.push(`已跳过 ${skippedEmpty} 个空行`);
  return { entries, skippedEmpty, notes };
}

export interface RosterBuild { persons: Person[]; warnings: string[]; errors: string[] }

/** 由条目生成人员记录：每条记录分配内部唯一 id；重复/同名只提示，不合并 */
export function buildRoster(entries: RosterEntry[]): RosterBuild {
  const warnings: string[] = [], errors: string[] = [];
  const persons: Person[] = [];
  const seenExact = new Map<string, number[]>(); // name+code -> lines
  const seenName = new Map<string, { id: string; code: string; line: number }[]>();
  for (const e of entries) {
    const name = e.name.trim();
    const code = e.code.trim();
    if (!name) { errors.push(`第 ${e.line} 行姓名为空，已跳过`); continue; }
    const p: Person = { id: newUid('p'), name, code };
    persons.push(p);
    const exactKey = `${name}|||${code}`;
    seenExact.set(exactKey, [...(seenExact.get(exactKey) ?? []), e.line]);
    seenName.set(name, [...(seenName.get(name) ?? []), { id: p.id, code, line: e.line }]);
  }
  for (const [key, lines] of seenExact) {
    if (lines.length > 1) {
      const name = key.split('|||')[0];
      warnings.push(`「${name}」出现 ${lines.length} 次（第 ${lines.join('、')} 行），已保留为 ${lines.length} 条独立记录，匹配时会要求人工确认`);
    }
  }
  for (const [name, list] of seenName) {
    const codes = new Set(list.map(x => x.code));
    if (codes.size > 1) {
      warnings.push(`同名「${name}」有 ${list.length} 人（编号 ${[...codes].map(c => c || '空').join('、')}），同名文件将进入待确认`);
    }
  }
  if (!persons.length) errors.push('名单为空：请粘贴至少一行姓名，或上传包含姓名列的表格');
  return { persons, warnings, errors };
}

/** 名单模板（XLSX 用二维数组表达，UI 层再转文件） */
export function rosterTemplateRows(): string[][] {
  return [
    ['姓名', '学号（可选）'],
    ['张三', '20240101'],
    ['李四', '20240102'],
    ['王五', ''],
  ];
}

// ---------- B. 材料要求 ----------

export function defaultRequirements(): Requirement[] {
  return [
    { id: newUid('r'), name: '报名表', required: true, extensions: ['docx', 'pdf'], maxBytes: 5 * 1024 * 1024, count: 1, keywords: ['报名表', '报名', '申请表'] },
    { id: newUid('r'), name: '证件照', required: true, extensions: ['jpg', 'jpeg', 'png'], maxBytes: 2 * 1024 * 1024, count: 1, keywords: ['证件照', '照片', '一寸', '二寸'] },
    { id: newUid('r'), name: '学生证明', required: false, extensions: ['pdf', 'jpg', 'jpeg', 'png'], maxBytes: 5 * 1024 * 1024, count: 1, keywords: ['学生证', '证明', '在读'] },
  ];
}

export function validateRequirement(r: Requirement, all: Requirement[]): string[] {
  const errs: string[] = [];
  if (!r.name.trim()) errs.push('材料名称不能为空');
  if (!r.extensions.length) errs.push(`「${r.name || '未命名'}」至少允许一种扩展名`);
  if (!(r.maxBytes > 0)) errs.push(`「${r.name || '未命名'}」大小上限必须大于 0`);
  if (!(r.count >= 1)) errs.push(`「${r.name || '未命名'}」每人份数至少为 1`);
  const dupExt = r.extensions.filter(e => all.some(o => o.id !== r.id && o.extensions.includes(e)));
  if (dupExt.length) errs.push(`扩展名 ${[...new Set(dupExt)].join('、')} 同时用于多个材料类别，匹配时将按关键词区分，无法区分则进入待确认`);
  return errs;
}

export function normalizeExtList(raw: string): string[] {
  const out: string[] = [];
  for (const t of raw.split(/[,，、\s]+/)) {
    const e = t.trim().replace(/^\./, '').toLowerCase();
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

// ---------- C/D. 匹配 ----------

export function normText(s: string): string {
  return s.replace(/[\s\u3000]+/g, '').toLowerCase();
}

/** 微信/相机默认文件名、纯数字名等无法识别身份 */
const UNRECOGNIZABLE_RE = /^(mmexport.*|wx_.*|img[\d_]*|vid[\d_]*|dsc[\d_]*|screenshot_.*|p_\d+|video[\d_]*|photo[\d_]*)$/i;
export function isUnrecognizableName(base: string): boolean {
  const n = normText(base);
  if (UNRECOGNIZABLE_RE.test(base.trim())) return true;
  if (/^[\d\-_.()（）\s]+$/.test(base.trim())) return true; // 纯数字/符号
  return n.length < 2;
}

export type FileState = 'ok' | 'pending' | 'unassigned' | 'ignored';

export interface Candidate { personId: string; reason: string }

export interface FileMatch {
  fileId: string;
  personId: string | null;
  reqId: string | null;
  state: FileState;
  /** 匹配依据，如"文件名包含唯一学号 20240101" */
  evidence: string[];
  /** 规则异常，如"扩展名 txt 不在要求中" */
  issues: string[];
  /** 待确认时的候选 */
  candidates: Candidate[];
  /** 待确认原因 */
  pendingReason: string;
  manual: boolean;
}

interface PersonHit { person: Person; via: 'code' | 'name'; }

function findPersonHits(file: InFile, persons: Person[]): PersonHit[] {
  const fn = normText(file.base);
  const hits: PersonHit[] = [];
  for (const p of persons) {
    const code = normText(p.code);
    if (code.length >= 2 && fn.includes(code)) { hits.push({ person: p, via: 'code' }); continue; }
    const nm = normText(p.name);
    if (nm.length >= 2 && fn.includes(nm)) hits.push({ person: p, via: 'name' });
  }
  return hits;
}

/** 短姓名被包含在另一个已匹配的长姓名中 → 有歧义 */
function hasSubstringAmbiguity(hits: PersonHit[]): boolean {
  const names = hits.map(h => normText(h.person.name));
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i !== j && names[i] !== names[j] && names[j].includes(names[i])) return true;
    }
  }
  return false;
}

function reqCandidatesFor(file: InFile, reqs: Requirement[]): Requirement[] {
  return reqs.filter(r => r.extensions.includes(file.ext));
}

function disambiguateReq(file: InFile, cands: Requirement[]): { req: Requirement | null; byKeyword: boolean } {
  if (cands.length === 0) return { req: null, byKeyword: false };
  if (cands.length === 1) return { req: cands[0], byKeyword: false };
  const fn = normText(file.base);
  const kwHits = cands.filter(r => r.keywords.some(k => k && fn.includes(normText(k))));
  if (kwHits.length === 1) return { req: kwHits[0], byKeyword: true };
  return { req: null, byKeyword: false };
}

export function matchFiles(
  files: InFile[],
  persons: Person[],
  reqs: Requirement[],
  overrides: Record<string, Override> = {},
): FileMatch[] {
  const personById = new Map(persons.map(p => [p.id, p]));
  const reqById = new Map(reqs.map(r => [r.id, r]));
  const results: FileMatch[] = [];

  for (const f of files) {
    const ov = overrides[f.id];
    if (ov?.ignored) {
      results.push({ fileId: f.id, personId: null, reqId: null, state: 'ignored', evidence: [], issues: [], candidates: [], pendingReason: '', manual: true });
      continue;
    }
    const evidence: string[] = [];
    const issues: string[] = [];
    const manual = !!(ov && (ov.personId !== undefined || ov.reqId !== undefined));

    // 1) 定人
    let person: Person | null = null;
    let candidates: Candidate[] = [];
    let pendingReason = '';
    if (ov?.personId) {
      person = personById.get(ov.personId) ?? null;
      if (person) evidence.push(`人工指定人员：${person.name}`);
      else { issues.push('人工指定的人员已不在名单中'); }
    } else {
      const hits = findPersonHits(f, persons);
      const byId = new Map<string, PersonHit>();
      for (const h of hits) if (!byId.has(h.person.id)) byId.set(h.person.id, h);
      const uniq = [...byId.values()];
      const codeHits = uniq.filter(h => h.via === 'code');
      const nameHits = uniq.filter(h => h.via === 'name');
      if (uniq.length === 0) {
        const reason = isUnrecognizableName(f.base)
          ? '文件名无法识别身份（微信默认名/纯数字/过短），请人工指定'
          : '文件名中未出现名单中的姓名或编号，请人工指定';
        results.push({ fileId: f.id, personId: null, reqId: null, state: 'unassigned', evidence, issues, candidates: [], pendingReason: reason, manual });
        continue;
      }
      const codeIds = [...new Set(codeHits.map(h => h.person.id))];
      if (codeIds.length === 1) {
        // 编号唯一确定一人：姓名命中若只是同名，不算"指向不同人"
        const theOne = codeHits[0].person;
        const others = nameHits.filter(h => h.person.id !== theOne.id);
        const diffName = others.filter(h => normText(h.person.name) !== normText(theOne.name));
        if (diffName.length > 0) {
          candidates = [...codeHits, ...diffName].map(h => ({ personId: h.person.id, reason: h.via === 'code' ? `编号 ${h.person.code || '空'} 匹配` : `姓名「${h.person.name}」匹配` }));
          results.push({ fileId: f.id, personId: null, reqId: null, state: 'pending', evidence, issues, candidates, pendingReason: '文件名中的编号与姓名指向不同人员，请人工确认', manual });
          continue;
        }
        person = theOne;
        evidence.push(`文件名包含唯一编号 ${theOne.code}`);
        if (others.length > 0) evidence.push(`同名「${theOne.name}」已按编号区分`);
      } else if (codeIds.length > 1) {
        candidates = codeHits.map(h => ({ personId: h.person.id, reason: `编号 ${h.person.code || '空'} 匹配` }));
        results.push({ fileId: f.id, personId: null, reqId: null, state: 'pending', evidence, issues, candidates, pendingReason: `文件名同时命中 ${codeIds.length} 个编号，请人工确认`, manual });
        continue;
      } else if (uniq.length > 1 || hasSubstringAmbiguity(uniq)) {
        const why = hasSubstringAmbiguity(uniq) ? '短姓名被包含在另一候选长姓名中，无法安全判定' : `文件名同时命中 ${uniq.length} 人`;
        candidates = uniq.map(h => ({ personId: h.person.id, reason: h.via === 'code' ? `编号 ${h.person.code || '空'} 匹配` : `姓名「${h.person.name}」匹配` }));
        results.push({ fileId: f.id, personId: null, reqId: null, state: 'pending', evidence, issues, candidates, pendingReason: `${why}，请人工确认`, manual });
        continue;
      } else {
        person = uniq[0].person;
        evidence.push(`文件名包含姓名「${person.name}」`);
      }
    }
    if (!person) {
      results.push({ fileId: f.id, personId: null, reqId: null, state: 'unassigned', evidence, issues, candidates: [], pendingReason: '未能确定人员，请人工指定', manual });
      continue;
    }

    // 2) 定材料类别
    let req: Requirement | null = null;
    if (ov?.reqId) {
      req = reqById.get(ov.reqId) ?? null;
      if (req) evidence.push(`人工指定材料：${req.name}`);
      else issues.push('人工指定的材料类别已不存在');
    } else {
      const cands = reqCandidatesFor(f, reqs);
      if (!cands.length) {
        issues.push(`扩展名 .${f.ext || '（无）'} 不在任何材料要求中`);
      } else {
        const { req: picked, byKeyword } = disambiguateReq(f, cands);
        if (picked) {
          req = picked;
          evidence.push(byKeyword ? `关键词区分材料为「${picked.name}」` : `扩展名 .${f.ext} 对应「${picked.name}」`);
        } else {
          candidates = [{ personId: person.id, reason: evidence.join('；') || '人员已确定' }];
          results.push({ fileId: f.id, personId: person.id, reqId: null, state: 'pending', evidence: [...evidence, `扩展名 .${f.ext} 可对应 ${cands.map(c => `「${c.name}」`).join('、')}`], issues, candidates, pendingReason: '材料类型待确认：同一扩展名对应多个材料类别', manual });
          continue;
        }
      }
    }

    // 3) 规则检查（格式、大小）
    if (req) {
      if (!req.extensions.includes(f.ext)) issues.push(`扩展名 .${f.ext || '（无）'} 不符合「${req.name}」要求（允许 ${req.extensions.map(e => '.' + e).join('、')}）`);
      if (f.size > req.maxBytes) issues.push(`文件 ${formatSize(f.size)} 超过「${req.name}」单文件上限 ${formatSize(req.maxBytes)}`);
      if (f.size === 0) issues.push('文件大小为 0，可能已损坏');
    }

    results.push({
      fileId: f.id, personId: person.id, reqId: req?.id ?? null,
      state: 'ok', evidence, issues, candidates: [], pendingReason: '', manual,
    });
  }

  // 4) 同一人员同一材料多版本 → 待确认（数量超过每人份数）
  const groups = new Map<string, FileMatch[]>();
  for (const m of results) {
    if (m.state === 'ok' && m.personId && m.reqId) {
      const key = `${m.personId}|||${m.reqId}`;
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
  }
  for (const [key, list] of groups) {
    const req = reqById.get(key.split('|||')[1]);
    const person = personById.get(key.split('|||')[0]);
    if (req && list.length > req.count) {
      for (const m of list) {
        m.state = 'pending';
        m.pendingReason = `「${person?.name}」的「${req.name}」出现 ${list.length} 个版本（每人需要 ${req.count} 份），请人工确认保留哪份`;
        m.candidates = [{ personId: m.personId!, reason: `保留为「${req.name}」` }];
      }
    }
  }
  return results;
}

// ---------- E. 状态核对 ----------

export type PersonState = 'complete' | 'missing' | 'error' | 'pending';
export const PERSON_STATE_LABEL: Record<PersonState, string> = {
  complete: '齐全', missing: '缺材料', error: '规则异常', pending: '待确认',
};

export interface ReqSlot {
  req: Requirement;
  have: number;
  need: number;
  ok: boolean;
  issues: string[];
}

export interface PersonReport {
  person: Person;
  state: PersonState;
  slots: ReqSlot[];
  missing: string[];
  errors: string[];
  pendingNotes: string[];
  files: { file: InFile; match: FileMatch }[];
}

export interface Summary {
  reports: PersonReport[];
  total: number;
  complete: number;
  missing: number;
  error: number;
  pending: number;
  pendingFiles: number;
  unassignedFiles: number;
  ignoredFiles: number;
}

export function summarize(
  persons: Person[],
  reqs: Requirement[],
  files: InFile[],
  matches: FileMatch[],
): Summary {
  const fileById = new Map(files.map(f => [f.id, f]));
  const byPerson = new Map<string, { file: InFile; match: FileMatch }[]>();
  const attach = (pid: string, file: InFile, match: FileMatch) => {
    byPerson.set(pid, [...(byPerson.get(pid) ?? []), { file, match }]);
  };
  let pendingFiles = 0, unassignedFiles = 0, ignoredFiles = 0;
  for (const m of matches) {
    const f = fileById.get(m.fileId);
    if (!f) continue;
    if (m.state === 'ignored') { ignoredFiles += 1; continue; }
    if (m.state === 'unassigned') { unassignedFiles += 1; continue; }
    if (m.state === 'pending') {
      pendingFiles += 1;
      // 待确认文件挂到候选人卡片下，便于在人员维度看到待办
      const ids = m.personId ? [m.personId] : m.candidates.map(c => c.personId);
      for (const pid of new Set(ids)) attach(pid, f, m);
      continue;
    }
    if (m.personId) attach(m.personId, f, m);
  }

  const reports: PersonReport[] = persons.map(person => {
    const list = byPerson.get(person.id) ?? [];
    const slots: ReqSlot[] = reqs.map(req => {
      const okFiles = list.filter(({ match }) => match.reqId === req.id && match.state === 'ok' && !match.issues.length);
      const have = okFiles.length;
      const ok = have >= req.count;
      const issues: string[] = [];
      for (const { file, match } of list.filter(({ match }) => match.reqId === req.id)) {
        for (const issue of match.issues) issues.push(`「${file.name}」${issue}`);
      }
      return { req, have, need: req.count, ok, issues };
    });
    const missing = slots.filter(s => s.req.required && !s.ok).map(s => s.req.name);
    const errors = [...new Set(slots.flatMap(s => s.issues))];
    const pendingNotes = [...new Set(list.filter(({ match }) => match.state === 'pending').map(({ file, match }) => `「${file.name}」${match.pendingReason}`))];
    let state: PersonState = 'complete';
    if (pendingNotes.length) state = 'pending';
    else if (errors.length) state = 'error';
    else if (missing.length) state = 'missing';
    return { person, state, slots, missing, errors, pendingNotes, files: list };
  });

  return {
    reports,
    total: persons.length,
    complete: reports.filter(r => r.state === 'complete').length,
    missing: reports.filter(r => r.state === 'missing').length,
    error: reports.filter(r => r.state === 'error').length,
    pending: reports.filter(r => r.state === 'pending').length,
    pendingFiles, unassignedFiles, ignoredFiles,
  };
}

// ---------- F. 导出 ----------

export interface ExportEntry {
  fileId: string;
  originalName: string;
  sourcePath: string;
  exportPath: string;
  personLabel: string;
  reqLabel: string;
  state: string;
  note: string;
}

/**
 * 导出规划：人员文件夹 / 材料名称_姓名.扩展名
 * - 同名人员用"姓名_编号"区分
 * - 未分配 → _未分配/；待确认 → _待确认/；已忽略不导出但记入清单
 * - 重名文件加 _2、_3（大小写不敏感）
 */
export function planExport(
  persons: Person[],
  reqs: Requirement[],
  files: InFile[],
  matches: FileMatch[],
): { entries: ExportEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const fileById = new Map(files.map(f => [f.id, f]));
  const personById = new Map(persons.map(p => [p.id, p]));
  const reqById = new Map(reqs.map(r => [r.id, r]));

  const nameCount = new Map<string, number>();
  for (const p of persons) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);
  const dirFor = (p: Person): string => {
    const base = nameCount.get(p.name)! > 1 ? `${p.name}_${p.code || '无编号'}` : p.name;
    return sanitizeFileName(base).name;
  };
  const personDir = new Map(persons.map(p => [p.id, dirFor(p)]));

  const used = new Set<string>();
  const claim = (path: string): string => {
    let cand = path, n = 1;
    while (used.has(cand.toLowerCase())) {
      n += 1;
      const { base, ext } = splitName(path);
      cand = `${base}_${n}${ext ? '.' + ext : ''}`;
    }
    used.add(cand.toLowerCase());
    if (n > 1) warnings.push(`导出重名，已改名：${path} → ${cand}`);
    return cand;
  };

  const entries: ExportEntry[] = [];
  for (const m of matches) {
    const f = fileById.get(m.fileId);
    if (!f) continue;
    const person = m.personId ? personById.get(m.personId) : undefined;
    const req = m.reqId ? reqById.get(m.reqId) : undefined;
    if (m.state === 'ignored') {
      entries.push({ fileId: f.id, originalName: f.name, sourcePath: f.sourcePath ?? '', exportPath: '', personLabel: person?.name ?? '', reqLabel: req?.name ?? '', state: '已忽略', note: '用户标记忽略，未导出' });
      continue;
    }
    const stateLabel = m.state === 'ok'
      ? (m.issues.length ? '规则异常' : '已分配')
      : m.state === 'pending' ? '待确认' : '未分配';
    const note = [
      ...m.evidence,
      ...(m.pendingReason ? [`待确认：${m.pendingReason}`] : []),
      ...m.issues,
      ...(f.sourcePath ? [`来源路径：${f.sourcePath}`] : []),
    ].join('；');
    let exportPath: string;
    if (m.state === 'unassigned') {
      exportPath = claim(`_未分配/${sanitizeFileName(f.name).name}`);
    } else if (m.state === 'pending' || !person) {
      exportPath = claim(`_待确认/${sanitizeFileName(f.name).name}`);
    } else {
      const dir = personDir.get(person.id)!;
      const reqLabel = req ? req.name : '未分类';
      const fname = sanitizeFileName(`${reqLabel}_${person.name}`).name + (f.ext ? `.${f.ext}` : '');
      exportPath = claim(`${dir}/${fname}`);
    }
    entries.push({
      fileId: f.id, originalName: f.name, sourcePath: f.sourcePath ?? '', exportPath,
      personLabel: person ? `${person.name}${person.code ? `（${person.code}）` : ''}` : '',
      reqLabel: req?.name ?? '', state: stateLabel, note,
    });
  }
  return { entries, warnings };
}

/** 核对表行：姓名、编号、状态、各材料、缺少、异常、待确认、原始文件名 */
export function buildChecklistRows(reports: PersonReport[], reqs: Requirement[]): string[][] {
  const header = ['姓名', '编号', '状态', ...reqs.map(r => `${r.name}${r.required ? '（必交）' : '（选交）'}`), '缺少项目', '异常说明', '待确认事项', '对应原始文件名'];
  const rows: string[][] = [header];
  for (const r of reports) {
    const slotCells = r.slots.map(s => `${s.have}/${s.need}`);
    const fileNames = r.files.map(({ file }) => file.name).join('；');
    rows.push([
      r.person.name, r.person.code, PERSON_STATE_LABEL[r.state],
      ...slotCells,
      r.missing.join('、'), r.errors.join('；'), r.pendingNotes.join('；'), fileNames,
    ]);
  }
  return rows;
}

/** 整理清单 CSV 行 */
export function buildManifestCsv(entries: ExportEntry[]): string {
  const header = ['原始文件名', '来源路径', '导出路径', '人员', '材料类型', '状态', '备注'];
  const lines = [header.map(csvCell).join(',')];
  for (const e of entries) {
    lines.push([e.originalName, e.sourcePath, e.exportPath, e.personLabel, e.reqLabel, e.state, e.note].map(csvCell).join(','));
  }
  return `﻿${lines.join('\r\n')}`;
}

/** 缺交提醒文案（只生成文字，不发送） */
export function buildReminder(reports: PersonReport[]): string {
  const missing = reports.filter(r => r.state === 'missing' || r.state === 'pending');
  if (!missing.length) return '本批材料已全部收齐，无需再催交。';
  const parts = missing.map(r => {
    const need = r.missing.length ? `缺${r.missing.join('、')}` : '有待确认事项';
    return `${r.person.name}${need}`;
  });
  return `还缺报名材料的同学：${parts.join('，')}，请核对后补交。`;
}

// ---------- ZIP 安全校验（先审目录，再解压） ----------

export const ZIP_LIMITS = {
  files: 500,
  totalBytes: 150 * 1024 * 1024,
  singleBytes: 30 * 1024 * 1024,
};

export interface ZipEntryInfo { name: string; size: number }

const SYS_FILE_RE = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._)/;

export function inspectZip(bytes: Uint8Array): { entries: ZipEntryInfo[]; ignored: string[]; nestedZips: string[]; order: string[] } {
  if (bytes.length < 22) throw new Error('文件太小，不是有效的 ZIP 压缩包');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('不是有效的 ZIP 压缩包（中央目录缺失），文件可能损坏');
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true)) throw new Error('暂不支持多卷压缩包');
  const count = v.getUint16(end + 8, true);
  const offset = v.getUint32(end + 16, true);
  if (!count || count > ZIP_LIMITS.files || count === 65535) throw new Error(`压缩包文件数量异常（${count}），已拒绝`);
  const decodeName = (at: number, len: number, flags: number): string => {
    const raw = bytes.subarray(at, at + len);
    try {
      return new TextDecoder(flags & 0x800 ? 'utf-8' : 'gb18030', { fatal: true }).decode(raw);
    } catch {
      throw new Error('压缩包内文件名编码无法识别');
    }
  };
  const entries: ZipEntryInfo[] = [];
  const ignored: string[] = [];
  const nestedZips: string[] = [];
  const order: string[] = []; // 中央目录顺序的全部文件条目名（含被忽略的系统文件），用于与解压结果配对
  let p = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || v.getUint32(p, true) !== 0x02014b50) throw new Error('压缩包中央目录损坏');
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const inflated = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true);
    if (flags & 1) throw new Error('检测到加密 ZIP：暂不支持加密压缩包，请先解密后再导入');
    if (![0, 8].includes(method)) throw new Error('压缩包使用了不支持的压缩方式');
    if (!nl || p + 46 + nl + extra + comment > end) throw new Error('压缩包文件名区域损坏');
    const name = decodeName(p + 46, nl, flags);
    p = p + 46 + nl + extra + comment;
    if (!name || name.endsWith('/')) continue; // 目录
    if (name.startsWith('/') || name.includes('\\') || /[\x00-\x1f]/.test(name) ||
        name.split('/').some(s => s === '..' || s === '.')) {
      throw new Error(`压缩包内路径不安全，已拒绝：${name.slice(0, 60)}`);
    }
    order.push(name);
    if (SYS_FILE_RE.test(name)) { ignored.push(name); continue; }
    if (inflated > ZIP_LIMITS.singleBytes) throw new Error(`「${name.slice(0, 40)}」解压后 ${formatSize(inflated)}，超过单文件上限 ${formatSize(ZIP_LIMITS.singleBytes)}`);
    total += inflated;
    if (total > ZIP_LIMITS.totalBytes) throw new Error(`解压后总大小超过 ${formatSize(ZIP_LIMITS.totalBytes)}，请分批导入`);
    const base = name.split('/').pop()!;
    if (/\.zip$/i.test(base)) nestedZips.push(name);
    entries.push({ name, size: inflated });
  }
  if (!entries.length && !ignored.length) throw new Error('压缩包内没有可导入的文件');
  return { entries, ignored, nestedZips, order };
}

// ---------- 演示数据（全部虚构） ----------

export function demoRosterEntries(): RosterEntry[] {
  const raw: [string, string][] = [
    ['张伟', '20240101'], ['张伟强', '20240102'], ['张伟', '20240103'],
    ['李娜', '20240201'], ['王小明', '20240301'], ['刘洋', ''],
    ['陈晨', '20240401'], ['杨帆', '20240501'], ['赵磊', ''],
    ['孙丽', '20240601'], ['周杰', '20240701'], ['吴敏', '20240801'],
  ];
  return raw.map(([name, code], i) => ({ line: i + 1, name, code }));
}

/** 演示文件：name / 目标大小（内容为占位文本，大小仅用于规则演示） */
export function demoFileDefs(): { name: string; size: number }[] {
  return [
    { name: '20240101_张伟_报名表.pdf', size: 45 * 1024 },
    { name: '张伟强-证件照.jpg', size: 180 * 1024 },       // 短姓名"张伟"被包含 → 待确认
    { name: '李娜学生证.png', size: 320 * 1024 },
    { name: '王小明报名表.docx', size: 28 * 1024 },
    { name: 'mmexport1718000000000.jpg', size: 210 * 1024 }, // 微信默认名 → 未分配
    { name: '20240201.pdf', size: 52 * 1024 },              // 仅编号，多材料候选 → 待确认
    { name: '张伟_证件照.jpg', size: 190 * 1024 },          // 同名两人 → 待确认
    { name: '陈晨 证件照.JPG', size: 3 * 1024 * 1024 },     // 超 2MB 上限 → 规则异常
    { name: '杨帆_报名表.txt', size: 12 * 1024 },           // 扩展名不符 → 规则异常
    { name: '赵磊_报名表.pdf', size: 40 * 1024 },
    { name: '赵磊_报名表_v2.pdf', size: 41 * 1024 },        // 多版本 → 待确认
    { name: '20240301王小明学生证明.pdf', size: 300 * 1024 },
    { name: '刘洋和孙丽_合影.jpg', size: 500 * 1024 },      // 两人名 → 待确认
    { name: '12345.jpg', size: 100 * 1024 },                // 纯数字 → 未分配
    { name: '周杰_证件照.png', size: 220 * 1024 },
    { name: '吴敏_学生证明.pdf', size: 280 * 1024 },
    { name: '20240999_陌生人_报名表.pdf', size: 44 * 1024 }, // 不在名单 → 未分配
    { name: '陈晨_报名表.pdf', size: 46 * 1024 },
  ];
}
