import { useEffect, useMemo, useRef, useState } from 'react';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { ToolPage, useJob, saveLocal } from './common';
import { copyLocal } from '../tool-common';
import { readSpreadsheet, type Grid } from '../sheets/core';
import {
  parseRosterText, buildRoster, defaultRequirements, normalizeExtList,
  matchFiles, summarize, planExport, buildChecklistRows, buildManifestCsv,
  buildReminder, inspectZip, sanitizeFileName, formatSize,
  demoRosterEntries, demoFileDefs, rosterTemplateRows, splitName, newUid,
  PERSON_STATE_LABEL,
  type Person, type Requirement, type InFile, type Override, type PersonState, type FileMatch,
} from './material-collector-core';

const FILE_LIMITS = { files: 300, single: 30 * 1024 * 1024, total: 300 * 1024 * 1024 };
type Step = 'roster' | 'reqs' | 'review' | 'export';
const STEPS: { id: Step; label: string }[] = [
  { id: 'roster', label: '1 导入名单' },
  { id: 'reqs', label: '2 设置要求' },
  { id: 'review', label: '3 整理核对' },
  { id: 'export', label: '4 导出' },
];
const FILTERS: { id: 'all' | PersonState; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'complete', label: '齐全' },
  { id: 'missing', label: '缺材料' },
  { id: 'error', label: '规则异常' },
  { id: 'pending', label: '待确认' },
];

function toInFile(id: string, name: string, size: number, sourcePath?: string): InFile {
  const { base, ext } = splitName(name);
  return { id, name, base, ext: ext.toLowerCase(), size, sourcePath };
}

export default function MaterialCollector() {
  const job = useJob();
  const [step, setStep] = useState<Step>('roster');
  const [persons, setPersons] = useState<Person[]>([]);
  const [rosterNotes, setRosterNotes] = useState<string[]>([]);
  const [reqs, setReqs] = useState<Requirement[]>(defaultRequirements());
  const [files, setFiles] = useState<InFile[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [zipNotes, setZipNotes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  // 名单上传中间态
  const [paste, setPaste] = useState('');
  const [rosterTab, setRosterTab] = useState<'paste' | 'file'>('paste');
  const [grids, setGrids] = useState<Grid[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [nameCol, setNameCol] = useState(0);
  const [codeCol, setCodeCol] = useState(-1);
  // 核对
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | PersonState>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignFile, setAssignFile] = useState<string | null>(null);
  const [assignPerson, setAssignPerson] = useState('');
  const [assignReq, setAssignReq] = useState('');
  // 导出
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [reminder, setReminder] = useState('');
  const [copied, setCopied] = useState('');

  const blobs = useRef(new Map<string, Blob>());
  const fileInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const rosterInput = useRef<HTMLInputElement>(null);

  const matches: FileMatch[] = useMemo(
    () => matchFiles(files, persons, reqs, overrides),
    [files, persons, reqs, overrides],
  );
  const summary = useMemo(
    () => summarize(persons, reqs, files, matches),
    [persons, reqs, files, matches],
  );
  const matchById = useMemo(() => new Map(matches.map(m => [m.fileId, m])), [matches]);

  useEffect(() => {
    if (!persons.length) return;
    const warn = () => '名单与文件只在内存中，刷新或关闭页面会清空，请先导出。';
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    void warn;
    return () => window.removeEventListener('beforeunload', h);
  }, [persons.length]);

  function note(msg: string) { setMessage(msg); }

  // ---------- 名单 ----------

  function confirmRoster(personsNew: Person[], notes: string[]) {
    setPersons(personsNew);
    setRosterNotes(notes);
    setOverrides({});
    note(`已导入 ${personsNew.length} 人。`);
  }

  function parsePaste() {
    const { entries, notes } = parseRosterText(paste);
    const built = buildRoster(entries);
    if (built.errors.length && !built.persons.length) { note(built.errors.join('；')); return; }
    confirmRoster(built.persons, [...notes, ...built.warnings, ...built.errors]);
    setStep('reqs');
  }

  async function loadRosterFile(f: File) {
    await job.run(async () => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const gs = readSpreadsheet(bytes, f.name, newUid('g'));
      if (!gs.length) throw new Error('未读取到工作表');
      setGrids(gs); setSheetIdx(0); setNameCol(0); setCodeCol(-1);
      return null;
    }, () => { note(`已读取 ${f.name}，请选择工作表与列。`); });
  }

  function confirmRosterGrid() {
    const g = grids?.[sheetIdx];
    if (!g) return;
    const entries = g.rows.slice(1)
      .map((row, i) => ({
        line: i + 2,
        name: (row[nameCol]?.display ?? '').trim(),
        code: codeCol >= 0 ? (row[codeCol]?.display ?? '').trim() : '',
      }))
      .filter(e => e.name || e.code);
    const built = buildRoster(entries);
    if (built.errors.length && !built.persons.length) { note(built.errors.join('；')); return; }
    const sheetWarn = g.warnings.length ? [`工作表提示：${g.warnings.join('；')}`] : [];
    confirmRoster(built.persons, [...sheetWarn, ...built.warnings, ...built.errors]);
    setStep('reqs');
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rosterTemplateRows());
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, '名单');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveLocal(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '名单模板.xlsx');
  }

  function loadDemo() {
    const built = buildRoster(demoRosterEntries());
    const demoReqs = defaultRequirements();
    const newFiles: InFile[] = [];
    const newBlobs = new Map<string, Blob>();
    for (const d of demoFileDefs()) {
      const id = newUid('f');
      newFiles.push(toInFile(id, d.name, d.size));
      newBlobs.set(id, new Blob(['x'.repeat(Math.min(d.size, 3 * 1024 * 1024))], { type: 'application/octet-stream' }));
    }
    for (const [id, b] of newBlobs) blobs.current.set(id, b);
    setReqs(demoReqs);
    setPersons(built.persons);
    setRosterNotes(['已加载虚构演示数据（12 人，18 个文件，均为虚构）', ...built.warnings]);
    setFiles(newFiles);
    setOverrides({});
    setZipNotes([]);
    setStep('review');
    note('演示数据已加载：可直接体验匹配、人工修正与导出。');
  }

  function resetAll() {
    if (job.busy) return;
    if (persons.length && !window.confirm('确定开始新任务？当前名单、文件与核对结果将全部清空（已导出的文件不受影响）。')) return;
    job.reset();
    setPersons([]); setRosterNotes([]); setReqs(defaultRequirements());
    setFiles([]); setOverrides({}); setZipNotes([]); setMessage('');
    setPaste(''); setGrids(null); setSearch(''); setFilter('all');
    setExpanded(null); setReminder(''); setProgress(null); setStep('roster');
    blobs.current.clear();
  }

  // ---------- 文件导入 ----------

  function addBlobs(list: { name: string; size: number; blob: Blob; sourcePath?: string }[]) {
    const existing = new Set(files.map(f => `${f.name}|||${f.size}`));
    const accepted: InFile[] = [];
    let dup = 0;
    for (const item of list) {
      const key = `${item.name}|||${item.size}`;
      if (existing.has(key)) { dup += 1; continue; }
      if (item.size > FILE_LIMITS.single) { note(`「${item.name}」超过单文件上限 ${formatSize(FILE_LIMITS.single)}，已跳过。`); continue; }
      existing.add(key);
      const id = newUid('f');
      blobs.current.set(id, item.blob);
      accepted.push(toInFile(id, item.name, item.size, item.sourcePath));
    }
    if (files.length + accepted.length > FILE_LIMITS.files) {
      const room = Math.max(0, FILE_LIMITS.files - files.length);
      note(`最多 ${FILE_LIMITS.files} 个文件，超出的已跳过。${dup ? `另有 ${dup} 个重复文件已跳过。` : ''}`);
      setFiles(old => [...old, ...accepted.slice(0, room)]);
      return;
    }
    const total = files.reduce((n, f) => n + f.size, 0) + accepted.reduce((n, f) => n + f.size, 0);
    if (total > FILE_LIMITS.total) { note(`总计超过 ${formatSize(FILE_LIMITS.total)}，请分批处理。`); return; }
    setFiles(old => [...old, ...accepted]);
    const parts: string[] = [];
    if (accepted.length) parts.push(`已加入 ${accepted.length} 个文件`);
    if (dup) parts.push(`${dup} 个重复文件已跳过（同名同大小）`);
    if (parts.length) note(parts.join('，') + '。');
  }

  async function importZip(f: File) {
    await job.run(async () => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = inspectZip(bytes); // 先审目录：加密/危险路径/超限在此报错
      const notes: string[] = [];
      if (info.ignored.length) notes.push(`已忽略 ${info.ignored.length} 个系统辅助文件（__MACOSX/.DS_Store 等）`);
      if (info.nestedZips.length) notes.push(`发现 ${info.nestedZips.length} 个嵌套压缩包，未递归展开，已作为普通文件导入`);
      const raw = unzipSync(bytes);
      const keyList = Object.keys(raw).filter(k => !k.endsWith('/'));
      const orderIdx = new Map(info.order.map((n, i) => [n, i]));
      const items: { name: string; size: number; blob: Blob; sourcePath?: string }[] = [];
      for (const e of info.entries) {
        // UTF-8 包：fflate 解出的键名与校验时一致，直接按名配对；
        // GBK 等非 UTF-8 包：fflate 键名可能乱码，按中央目录顺序配对。
        let key = keyList.includes(e.name) ? e.name : undefined;
        if (!key) {
          const idx = orderIdx.get(e.name);
          key = idx !== undefined ? keyList[idx] : undefined;
        }
        const u8 = key ? raw[key] : undefined;
        if (!u8) { notes.push(`「${e.name}」解压后未找到对应数据，已跳过`); continue; }
        const base = e.name.split('/').pop()!;
        items.push({ name: base, size: u8.length, blob: new Blob([u8.buffer as ArrayBuffer], { type: 'application/octet-stream' }), sourcePath: `${f.name}/${e.name}` });
      }
      if (!items.length) throw new Error('压缩包内没有可导入的文件');
      return { items, notes };
    }, ({ items, notes }) => {
      addBlobs(items);
      setZipNotes(notes);
    });
  }

  function removeFile(id: string) {
    if (job.busy) return;
    blobs.current.delete(id);
    setFiles(old => old.filter(f => f.id !== id));
    setOverrides(old => { const n = { ...old }; delete n[id]; return n; });
  }

  // ---------- 人工修正 ----------

  function openAssign(fileId: string) {
    const m = matchById.get(fileId);
    setAssignFile(fileId);
    setAssignPerson(m?.personId ?? '');
    setAssignReq(m?.reqId ?? '');
  }
  function confirmAssign() {
    if (!assignFile) return;
    if (!assignPerson) { note('请先选择人员。'); return; }
    setOverrides(old => ({ ...old, [assignFile]: { personId: assignPerson, reqId: assignReq || null } }));
    setAssignFile(null);
    note('已人工指定，状态已重新计算。');
  }
  function clearAssign(fileId: string) {
    setOverrides(old => { const n = { ...old }; delete n[fileId]; return n; });
    note('已取消人工指定，恢复自动匹配。');
  }
  function ignoreFile(fileId: string) {
    setOverrides(old => ({ ...old, [fileId]: { ignored: true } }));
    setAssignFile(null);
    note('已标记为忽略，不计入统计与导出。');
  }

  // ---------- 导出 ----------

  async function exportChecklist() {
    if (!persons.length) { note('请先导入名单。'); return; }
    await job.run(async () => {
      const rows = buildChecklistRows(summary.reports, reqs);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, ...reqs.map(() => ({ wch: 14 })), { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, '核对表');
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }, blob => saveLocal(blob, '材料核对表.xlsx'));
  }

  async function exportZip() {
    if (!files.length) { note('请先导入文件。'); return; }
    await job.run(async check => {
      const { entries, warnings } = planExport(persons, reqs, files, matches);
      const withData = entries.filter(e => e.exportPath);
      setProgress({ done: 0, total: withData.length });
      const zipEntries: Record<string, Uint8Array> = {};
      for (let i = 0; i < withData.length; i++) {
        check();
        const e = withData[i];
        const blob = blobs.current.get(e.fileId);
        if (!blob) throw new Error(`「${e.originalName}」在本机找不到文件数据，请重新导入`);
        const buf = new Uint8Array(await blob.arrayBuffer());
        zipEntries[e.exportPath] = buf;
        if (i % 5 === 4) { setProgress({ done: i + 1, total: withData.length }); await new Promise(r => setTimeout(r, 0)); }
      }
      check();
      const manifest = buildManifestCsv(entries);
      zipEntries['整理清单.csv'] = strToU8(manifest);
      zipEntries['说明.txt'] = strToU8(
        `材料收集助手 · 整理结果\n导出时间：${new Date().toLocaleString('zh-CN')}\n` +
        `人员 ${summary.total} 人（齐全 ${summary.complete} / 缺材料 ${summary.missing} / 规则异常 ${summary.error} / 待确认 ${summary.pending}）\n` +
        `文件 ${withData.length} 个已整理；${summary.unassignedFiles} 个未分配、${summary.pendingFiles} 个待确认，分别见 _未分配 / _待确认 文件夹。\n` +
        `「齐全」仅表示文件数量与所设规则满足要求，不代表文件正文正确，也不代表报名审核通过。\n` +
        (warnings.length ? `重名处理：\n${warnings.join('\n')}\n` : '')
      );
      setProgress({ done: withData.length, total: withData.length });
      const out = zipSync(zipEntries, { level: 6 });
      return { out, count: withData.length };
    }, ({ out, count }) => {
      saveLocal(new Blob([out.buffer as ArrayBuffer], { type: 'application/zip' }), '整理后的材料.zip');
      setProgress(null);
      note(`已导出 ${count} 个文件。微信内如无法下载，请点右上角「…」→「在浏览器打开」后再试。`);
    });
  }

  function makeReminder() {
    const text = buildReminder(summary.reports);
    setReminder(text);
    setCopied('');
  }
  async function copyReminder() {
    try { await copyLocal(reminder); setCopied('已复制，可粘贴到微信群或私聊。'); }
    catch (e) { setCopied(e instanceof Error ? e.message : '复制失败，请手动选中复制。'); }
  }

  // ---------- 渲染 ----------

  const filtered = summary.reports.filter(r => {
    if (filter !== 'all' && r.state !== filter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return r.person.name.toLowerCase().includes(q) || r.person.code.toLowerCase().includes(q);
  });
  const pendingFiles = matches.filter(m => m.state === 'pending');
  const unassignedFiles = matches.filter(m => m.state === 'unassigned');
  const fileOf = (id: string) => files.find(f => f.id === id);
  const personName = (id: string) => persons.find(p => p.id === id)?.name ?? '未知';

  function fileActions(m: FileMatch) {
    const f = fileOf(m.fileId);
    if (!f) return null;
    return (
      <div className="study-subactions" style={{ marginTop: 6 }}>
        <button className="study-btn alt" onClick={() => openAssign(m.fileId)}>指定人员/材料</button>
        {m.manual && !overrides[m.fileId]?.ignored && <button className="study-btn alt" onClick={() => clearAssign(m.fileId)}>取消指定</button>}
        {!overrides[m.fileId]?.ignored && <button className="study-btn alt" onClick={() => ignoreFile(m.fileId)}>标记忽略</button>}
        <button className="study-btn alt" onClick={() => removeFile(m.fileId)}>删除文件</button>
      </div>
    );
  }

  function renderRoster() {
    return (
      <section className="study-card">
        <h2><span className="study-step">01</span>导入人员名单</h2>
        <div className="study-subactions" style={{ marginBottom: 8 }}>
          <button className={`study-btn${rosterTab === 'paste' ? '' : ' alt'}`} onClick={() => setRosterTab('paste')}>粘贴名单</button>
          <button className={`study-btn${rosterTab === 'file' ? '' : ' alt'}`} onClick={() => setRosterTab('file')}>上传表格</button>
          <button className="study-btn alt" onClick={downloadTemplate}>下载名单模板</button>
          <button className="study-btn alt" onClick={loadDemo}>加载虚构示例</button>
        </div>
        {rosterTab === 'paste' ? (
          <>
            <textarea aria-label="粘贴名单" rows={8} value={paste} onChange={e => setPaste(e.target.value)}
              placeholder={'一行一个人，如：\n张三 20240101\n李四 20240102\n王五\n（姓名后可加空格+学号；空行自动跳过）'} style={{ width: '100%' }} />
            <div className="study-actions">
              <button className="study-btn" disabled={job.busy || !paste.trim()} onClick={parsePaste}>解析并导入</button>
            </div>
          </>
        ) : (
          <>
            <button className="study-btn" disabled={job.busy} onClick={() => rosterInput.current?.click()}>选择 XLSX / CSV</button>
            <input ref={rosterInput} type="file" accept=".xlsx,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void loadRosterFile(f); e.target.value = ''; }} />
            <p className="study-note">支持 XLSX（可多工作表）与 UTF-8 CSV；单文件 5MB。只读取单元格文本，不执行公式。</p>
            {grids && (
              <div className="study-fields">
                <label>工作表<select value={sheetIdx} onChange={e => { setSheetIdx(+e.target.value); setNameCol(0); setCodeCol(-1); }}>
                  {grids.map((g, i) => <option key={g.id} value={i}>{g.sheetName}（{g.rows.length} 行）</option>)}
                </select></label>
                <label>姓名列<select value={nameCol} onChange={e => setNameCol(+e.target.value)}>
                  {grids[sheetIdx].rows[0]?.map((c, i) => <option key={i} value={i}>第 {i + 1} 列：{c.display || '（空）'}</option>)}
                </select></label>
                <label>编号列（可选）<select value={codeCol} onChange={e => setCodeCol(+e.target.value)}>
                  <option value={-1}>无编号列</option>
                  {grids[sheetIdx].rows[0]?.map((c, i) => <option key={i} value={i}>第 {i + 1} 列：{c.display || '（空）'}</option>)}
                </select></label>
                <div className="study-actions">
                  <button className="study-btn" disabled={job.busy} onClick={confirmRosterGrid}>确认导入</button>
                </div>
                <p className="study-note">预览前 5 行（不含表头）：{grids[sheetIdx].rows.slice(1, 6).map(r => r[nameCol]?.display).filter(Boolean).join('、') || '（空）'}</p>
              </div>
            )}
          </>
        )}
        {persons.length > 0 && (
          <><p className="study-success">已导入 {persons.length} 人：{persons.slice(0, 12).map(p => p.name).join('、')}{persons.length > 12 ? '…' : ''}</p>
          <div className="study-actions"><button className="study-btn" onClick={() => setStep('reqs')}>下一步：设置材料要求 →</button></div></>
        )}
        {rosterNotes.map((n, i) => <p key={i} className="study-warning">{n}</p>)}
      </section>
    );
  }

  function renderReqs() {
    return (
      <section className="study-card">
        <h2><span className="study-step">02</span>设置材料要求</h2>
        <p className="study-note">按你的实际收集需求填写；不要照搬未经核实的学校或赛事规定。</p>
        {reqs.map(r => (
          <div key={r.id} className="study-card" style={{ margin: '8px 0', padding: 12 }}>
            <div className="study-fields">
              <label>材料名称<input value={r.name} onChange={e => setReqs(old => old.map(x => x.id === r.id ? { ...x, name: e.target.value } : x))} /></label>
              <label>必交/选交<select value={r.required ? '1' : '0'} onChange={e => setReqs(old => old.map(x => x.id === r.id ? { ...x, required: e.target.value === '1' } : x))}>
                <option value="1">必交</option><option value="0">选交</option>
              </select></label>
              <label>允许扩展名（逗号分隔）<input value={r.extensions.join(',')} onChange={e => setReqs(old => old.map(x => x.id === r.id ? { ...x, extensions: normalizeExtList(e.target.value) } : x))} placeholder="如 docx,pdf" /></label>
              <label>单文件上限（MB）<input type="number" min={0.1} step={0.1} value={+(r.maxBytes / 1024 / 1024).toFixed(1)} onChange={e => setReqs(old => old.map(x => x.id === r.id ? { ...x, maxBytes: Math.max(1, Math.round(+e.target.value * 1024 * 1024)) } : x))} /></label>
              <label>每人份数<input type="number" min={1} value={r.count} onChange={e => setReqs(old => old.map(x => x.id === r.id ? { ...x, count: Math.max(1, +e.target.value || 1) } : x))} /></label>
              <label>文件名关键词（逗号分隔，可选）<input value={r.keywords.join(',')} onChange={e => setReqs(old => old.map(x => x.id === r.id ? { ...x, keywords: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) } : x))} placeholder="如 报名表,申请表" /></label>
            </div>
            <div className="study-subactions">
              <button className="study-btn alt" onClick={() => setReqs(old => old.filter(x => x.id !== r.id))}>删除该材料</button>
            </div>
          </div>
        ))}
        <div className="study-actions">
          <button className="study-btn alt" onClick={() => setReqs(old => [...old, { id: newUid('r'), name: '', required: true, extensions: [], maxBytes: 5 * 1024 * 1024, count: 1, keywords: [] }])}>+ 添加材料类型</button>
          <button className="study-btn alt" onClick={() => { setReqs(defaultRequirements()); note('已恢复默认三种材料。'); }}>恢复默认</button>
        </div>
        <div className="study-actions">
          <button className="study-btn" disabled={!persons.length} onClick={() => setStep('review')}>下一步：导入文件并核对 →</button>
        </div>
        {!persons.length && <p className="study-warning">请先完成第 1 步导入名单。</p>}
      </section>
    );
  }

  function renderReview() {
    const t = summary;
    const metric = (label: string, n: number, tone?: string) => (
      <div className="sheet-metric" key={label}><strong className={tone}>{n}</strong><span>{label}</span></div>
    );
    return (
      <>
        <section className="study-card">
          <h2><span className="study-step">03</span>导入收到的文件</h2>
          <div className="study-actions">
            <button className="study-btn" disabled={job.busy} onClick={() => fileInput.current?.click()}>选择多个文件</button>
            <button className="study-btn alt" disabled={job.busy} onClick={() => zipInput.current?.click()}>导入 ZIP 包</button>
            <input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files?.length) addBlobs(Array.from(e.target.files).map(f => ({ name: f.name, size: f.size, blob: f }))); e.target.value = ''; }} />
            <input ref={zipInput} type="file" accept=".zip" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importZip(f); e.target.value = ''; }} />
          </div>
          <p className="study-note">支持手机文件选择与桌面多选；ZIP 一次导入整批（先安全校验再解压，加密包会明确报错；嵌套 ZIP 不递归展开）。已导入 {files.length} 个文件，可随时补充。</p>
          {zipNotes.map((n, i) => <p key={i} className="study-note">{n}</p>)}
        </section>

        <section className="study-card">
          <h2><span className="study-step">04</span>核对面板</h2>
          {!reqs.length && <p className="study-warning">尚未设置任何材料要求：请回第 2 步添加，否则无法判定缺交。</p>}
          <div className="sheet-metrics">
            {metric('总人数', t.total)}
            {metric('材料齐全', t.complete)}
            {metric('缺材料', t.missing)}
            {metric('规则异常', t.error)}
            {metric('待确认文件', t.pendingFiles)}
            {metric('未分配文件', t.unassignedFiles)}
          </div>
          <p className="study-note">「齐全」仅表示文件数量与所设规则满足要求，不代表文件正文正确，也不代表报名审核通过。选交材料缺失不会导致「缺材料」。</p>
          <div className="study-fields">
            <label>搜索人员<input value={search} onChange={e => setSearch(e.target.value)} placeholder="姓名或编号" /></label>
          </div>
          <div className="study-subactions" style={{ marginBottom: 8 }}>
            {FILTERS.map(f => (
              <button key={f.id} className={`study-btn${filter === f.id ? '' : ' alt'}`} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          {filtered.length === 0 && <p className="study-note">没有符合条件的人员。</p>}
          {filtered.map(r => (
            <div key={r.person.id} className="study-card" style={{ margin: '8px 0', padding: 12 }}>
              <button className="study-link" style={{ fontSize: 16 }} onClick={() => setExpanded(expanded === r.person.id ? null : r.person.id)}>
                {r.person.name}{r.person.code ? `（${r.person.code}）` : ''} · <b>{PERSON_STATE_LABEL[r.state]}</b> {expanded === r.person.id ? '▾' : '▸'}
              </button>
              <p className="study-note">{r.slots.map(s => `${s.req.name} ${s.have}/${s.need}`).join(' ｜ ')}</p>
              {expanded === r.person.id && (
                <div>
                  {!!r.missing.length && <p className="study-warning">缺少：{r.missing.join('、')}</p>}
                  {!!r.errors.length && r.errors.map((e, i) => <p key={i} className="study-warning">{e}</p>)}
                  {!!r.pendingNotes.length && r.pendingNotes.map((e, i) => <p key={i} className="study-warning">{e}</p>)}
                  {r.files.map(({ file, match }) => (
                    <div key={file.id} style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
                      <div><b>{file.name}</b> <span className="study-note">{formatSize(file.size)}</span></div>
                      {!!match.evidence.length && <p className="study-note">依据：{match.evidence.join('；')}</p>}
                      {!!match.issues.length && match.issues.map((e, i) => <p key={i} className="study-warning">{e}</p>)}
                      {match.state === 'pending' && <p className="study-warning">待确认：{match.pendingReason}</p>}
                      {match.manual && <p className="study-note">（人工指定）</p>}
                      {file.sourcePath && <p className="study-note">来源：{file.sourcePath}</p>}
                      {fileActions(match)}
                    </div>
                  ))}
                  {!r.files.length && <p className="study-note">暂无匹配到该人员的文件。</p>}
                </div>
              )}
            </div>
          ))}
        </section>

        {!!pendingFiles.length && (
          <section className="study-card">
            <h2>待确认文件（{pendingFiles.length}）</h2>
            <p className="study-note">以下文件存在歧义，未自动分配。请逐个人工确认，不要跳过。</p>
            {pendingFiles.map(m => {
              const f = fileOf(m.fileId)!;
              return (
                <div key={m.fileId} style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
                  <div><b>{f.name}</b> <span className="study-note">{formatSize(f.size)}</span></div>
                  <p className="study-warning">{m.pendingReason}</p>
                  {!!m.evidence.length && <p className="study-note">依据：{m.evidence.join('；')}</p>}
                  <div className="study-subactions" style={{ marginTop: 6 }}>
                    {m.candidates.map(c => (
                      <button key={c.personId} className="study-btn alt" onClick={() => { setOverrides(old => ({ ...old, [m.fileId]: { personId: c.personId, reqId: m.reqId ?? undefined } })); note(`已将「${f.name}」分给 ${personName(c.personId)}。`); }}>
                        分给 {personName(c.personId)}
                      </button>
                    ))}
                    <button className="study-btn alt" onClick={() => openAssign(m.fileId)}>详细指定</button>
                    <button className="study-btn alt" onClick={() => ignoreFile(m.fileId)}>忽略</button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {!!unassignedFiles.length && (
          <section className="study-card">
            <h2>未分配文件（{unassignedFiles.length}）</h2>
            <p className="study-note">文件名中未识别到名单中的姓名或编号，请人工指定或删除。</p>
            {unassignedFiles.map(m => {
              const f = fileOf(m.fileId)!;
              return (
                <div key={m.fileId} style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
                  <div><b>{f.name}</b> <span className="study-note">{formatSize(f.size)}</span></div>
                  <p className="study-note">{m.pendingReason}</p>
                  {fileActions(m)}
                </div>
              );
            })}
          </section>
        )}

        <div className="study-actions">
          <button className="study-btn" disabled={!persons.length} onClick={() => setStep('export')}>下一步：导出结果 →</button>
        </div>
      </>
    );
  }

  function renderExport() {
    const t = summary;
    return (
      <section className="study-card">
        <h2><span className="study-step">05</span>导出结果</h2>
        <p className="study-note">人员 {t.total} 人：齐全 {t.complete} / 缺材料 {t.missing} / 规则异常 {t.error} / 待确认 {t.pending}；文件 {files.length} 个（待确认 {t.pendingFiles} / 未分配 {t.unassignedFiles} / 已忽略 {t.ignoredFiles}）。</p>
        {(t.pendingFiles > 0 || t.unassignedFiles > 0) && (
          <p className="study-warning">仍有 {t.pendingFiles + t.unassignedFiles} 个文件未处理：导出时将放入 _待确认 / _未分配 文件夹，不会丢失；建议先回第 3 步处理。</p>
        )}
        <div className="study-actions">
          <button className="study-btn" disabled={job.busy || !persons.length} onClick={() => void exportChecklist()}>导出核对表 XLSX</button>
          <button className="study-btn" disabled={job.busy || !files.length} onClick={() => void exportZip()}>导出整理后的 ZIP</button>
        </div>
        {progress && <p role="status" className="study-message">正在打包 {progress.done}/{progress.total} 个文件…</p>}
        <p className="study-note">整理结构：人员文件夹 / 材料名称_姓名.扩展名；同名人员用「姓名_编号」区分；附带整理清单 CSV（原始名称、导出路径、人员、材料类型、状态）。微信内如无法下载，请点右上角「…」→「在浏览器打开」后再试。</p>
        <h3>缺交提醒文案</h3>
        <div className="study-actions">
          <button className="study-btn alt" onClick={makeReminder}>生成提醒文案</button>
          {reminder && <button className="study-btn alt" onClick={() => void copyReminder()}>复制文案</button>}
        </div>
        {reminder && <><textarea readOnly rows={4} value={reminder} style={{ width: '100%' }} aria-label="缺交提醒文案" />{copied && <p role="status" className="study-message">{copied}</p>}<p className="study-note">只生成文字，不会自动发送到微信群或邮箱，请自行转发。</p></>}
        <div className="study-actions" style={{ marginTop: 12 }}>
          <button className="study-btn alt" onClick={resetAll}>开始新任务（清空当前）</button>
        </div>
      </section>
    );
  }

  const canReview = persons.length > 0;
  return (
    <ToolPage id="material-collector" title="材料收集助手" description="导入名单与收到的文件，自动匹配核对谁交齐了，人工修正歧义，一键导出核对表与整理好的 ZIP。全部在本机处理，无需登录。">
      <div className="study-subactions" style={{ marginBottom: 12 }} role="tablist" aria-label="步骤">
        {STEPS.map(s => (
          <button key={s.id} role="tab" aria-selected={step === s.id} className={`study-btn${step === s.id ? '' : ' alt'}`}
            disabled={(s.id === 'review' || s.id === 'export') && !canReview}
            onClick={() => setStep(s.id)}>{s.label}</button>
        ))}
        <button className="study-btn alt" onClick={resetAll} style={{ marginLeft: 'auto' }}>新任务</button>
      </div>
      {message && <p role="status" className="study-message">{message}</p>}
      {step === 'roster' && renderRoster()}
      {step === 'reqs' && renderReqs()}
      {step === 'review' && (canReview ? renderReview() : <p className="study-warning">请先完成第 1 步导入名单。</p>)}
      {step === 'export' && (canReview ? renderExport() : <p className="study-warning">请先完成第 1 步导入名单。</p>)}

      {assignFile && (() => {
        const f = fileOf(assignFile);
        const m = matchById.get(assignFile);
        if (!f) return null;
        return (
          <div className="modal-backdrop" onClick={() => setAssignFile(null)}>
            <section role="dialog" aria-modal="true" aria-label="人工指定" className="modal" onClick={e => e.stopPropagation()}>
              <h2>人工指定</h2>
              <p><b>{f.name}</b> <span className="study-note">{formatSize(f.size)}</span></p>
              {m && m.state === 'pending' && <p className="study-warning">{m.pendingReason}</p>}
              <div className="study-fields">
                <label>人员<select value={assignPerson} onChange={e => setAssignPerson(e.target.value)}>
                  <option value="">请选择</option>
                  {persons.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? `（${p.code}）` : ''}</option>)}
                </select></label>
                <label>材料类型（留空则自动判断）<select value={assignReq} onChange={e => setAssignReq(e.target.value)}>
                  <option value="">自动判断</option>
                  {reqs.map(r => <option key={r.id} value={r.id}>{r.name}{r.required ? '（必交）' : '（选交）'}</option>)}
                </select></label>
              </div>
              <div className="study-actions">
                <button className="study-btn" onClick={confirmAssign}>确认分配</button>
                <button className="study-btn alt" onClick={() => ignoreFile(assignFile)}>标记忽略</button>
                {m?.manual && <button className="study-btn alt" onClick={() => { clearAssign(assignFile); setAssignFile(null); }}>取消指定</button>}
                <button className="study-btn alt" onClick={() => setAssignFile(null)}>关闭</button>
              </div>
            </section>
          </div>
        );
      })()}
    </ToolPage>
  );
}
