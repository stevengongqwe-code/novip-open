import {useMemo,useRef,useState} from 'react';
import {zipSync,strToU8} from 'fflate';
import {ToolPage,useJob,saveLocal} from './common';
import {defaultRule,planNames,sortIndices,formatSize,zipEntryName,patternHasNumberToken,type RenameRule,type SortKey} from './file-organizer-core';

const MAX_FILES = 60;
const MAX_TOTAL = 300 * 1024 * 1024;
const MAX_SINGLE = 150 * 1024 * 1024;

interface Row { id: number; file: File }
const TOKEN_HELP = '可用占位符：{name} 原文件名（不含扩展名）、{n} {nn} {nnn} {nnnn} 序号（自动补零）';

export default function FileOrganizer() {
  const job = useJob();
  const [rows, setRows] = useState<Row[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [rule, setRule] = useState<RenameRule>(defaultRule);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [withMap, setWithMap] = useState(false);
  const [message, setMessage] = useState('');
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const files = useMemo(() => rows.map(r => ({ name: r.file.name, size: r.file.size })), [rows]);
  const planned = useMemo(() => {
    if (!rows.length) return [];
    return planNames(files, rule, order).map((p, i) => {
      const rowId = rows[order[i]]?.id;
      const custom = rowId !== undefined ? overrides[rowId] : undefined;
      if (custom !== undefined && custom.trim()) {
        const clean = custom.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
        return { ...p, newName: clean, warnings: [...p.warnings, '已手动指定文件名'] };
      }
      return p;
    });
  }, [files, rule, order, rows, overrides]);

  const totalSize = files.reduce((n, f) => n + f.size, 0);
  const emptyCount = files.filter(f => f.size === 0).length;
  const warnCount = planned.filter(p => p.warnings.length).length;

  function addFiles(list: File[]) {
    if (job.busy) return;
    const incoming = list.filter(f => {
      if (f.size > MAX_SINGLE) { setMessage(`「${f.name}」超过${formatSize(MAX_SINGLE)}，已跳过。`); return false; }
      return true;
    });
    if (rows.length + incoming.length > MAX_FILES) { setMessage(`最多${MAX_FILES}个文件，超出的已跳过。`); }
    const room = MAX_FILES - rows.length;
    const accepted = incoming.slice(0, Math.max(0, room));
    const newTotal = totalSize + accepted.reduce((n, f) => n + f.size, 0);
    if (newTotal > MAX_TOTAL) { setMessage(`总计超过${formatSize(MAX_TOTAL)}，请分批处理。`); return; }
    if (!accepted.length) return;
    const startIdx = rows.length;
    const newRows = accepted.map(file => ({ id: ++seq.current, file }));
    setRows(old => [...old, ...newRows]);
    setOrder(old => [...old, ...newRows.map((_, i) => startIdx + i)]);
    setMessage(accepted.length < incoming.length ? `已加入${accepted.length}个，其余超出限制。` : '');
  }

  function removeRow(id: number) {
    if (job.busy) return;
    setRows(old => {
      const idx = old.findIndex(r => r.id === id);
      if (idx < 0) return old;
      const next = old.filter(r => r.id !== id);
      setOrder(o => o.filter(i => i !== idx).map(i => (i > idx ? i - 1 : i)));
      return next;
    });
    setOverrides(old => { const n = { ...old }; delete n[id]; return n; });
  }

  function move(id: number, dir: -1 | 1) {
    if (job.busy) return;
    setOrder(old => {
      const ri = rows.findIndex(r => r.id === id);
      const pos = old.indexOf(ri);
      const np = pos + dir;
      if (pos < 0 || np < 0 || np >= old.length) return old;
      const a = [...old]; [a[pos], a[np]] = [a[np], a[pos]];
      return a;
    });
  }

  function applySort(key: SortKey, direction: boolean) {
    setSortKey(key); setAsc(direction);
    setOrder(sortIndices(files, key, direction));
  }

  function resetAll() {
    if (job.busy) return;
    job.reset();
    setRows([]); setOrder([]); setOverrides({}); setEditing(null);
    setRule(defaultRule()); setMessage(''); setWithMap(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function startEdit(id: number, current: string) {
    setEditing(id); setEditValue(current);
  }
  function confirmEdit(id: number) {
    const v = editValue.trim();
    setOverrides(old => {
      const n = { ...old };
      if (v) n[id] = v; else delete n[id];
      return n;
    });
    setEditing(null);
  }

  async function exportZip() {
    if (!rows.length || job.busy) return;
    setMessage('');
    await job.run(async (check) => {
      const entries: Record<string, Uint8Array> = {};
      for (let i = 0; i < planned.length; i++) {
        check();
        const rowIdx = order[i];
        const row = rows[rowIdx];
        const p = planned[i];
        job.setStatus(`正在打包 ${i + 1}/${planned.length}：${p.newName}`);
        const buf = await row.file.arrayBuffer();
        check();
        entries[zipEntryName(p.newName)] = new Uint8Array(buf);
        // 让出主线程，保持取消按钮可点
        await new Promise(r => setTimeout(r, 0));
      }
      check();
      if (withMap) {
        const map = planned.map((p, i) => `${String(i + 1).padStart(3, '0')}｜${p.original} → ${p.newName}`).join('\n');
        entries['命名对照表.txt'] = strToU8('原文件名 → 新文件名\n' + map + '\n');
      }
      job.setStatus('正在生成 ZIP…');
      const zipped = zipSync(entries, { level: 0 }); // level 0 = 仅存储，原文件字节逐位保留
      check();
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      saveLocal(new Blob([zipped.slice().buffer], { type: 'application/zip' }), `文件整理_${stamp}.zip`);
      return planned.length;
    }, (n) => setMessage(`已导出 ${n} 个文件，请解压核对文件名与内容。`));
  }

  function downloadMap() {
    if (!planned.length) return;
    const map = planned.map((p, i) => `${String(i + 1).padStart(3, '0')}｜${p.original} → ${p.newName}`).join('\n');
    saveLocal(new Blob(['原文件名 → 新文件名\n' + map + '\n'], { type: 'text/plain;charset=utf-8' }), '命名对照表.txt');
  }

  const set = <K extends keyof RenameRule>(k: K, v: RenameRule[K]) => setRule(old => ({ ...old, [k]: v }));
  const effectivePattern = rule.pattern.trim() || '文件_{nnn}';

  return (
    <ToolPage id="file-organizer" job={job} title="批量文件整理器"
      description="多文件批量重命名：智能编号、前后缀、查找替换；实时预览改名前后，重名自动避让，一键导出 ZIP。文件只在本机处理，不上传。">
      {/* 1. 上传 */}
      <section className="study-card">
        <h2>1 · 选择文件</h2>
        <div className="tool-drop"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }}>
          拖入文件到这里，或点击选择（PDF / Word / Excel / PPT / 图片 / 压缩包等均可）
          <input ref={inputRef} type="file" multiple disabled={job.busy}
            onChange={e => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>
        <p role="status" className="study-message">
          已选 {rows.length} 个 · 共 {formatSize(totalSize)}
          {emptyCount > 0 && ` · ${emptyCount} 个空文件`}
          {warnCount > 0 && ` · ${warnCount} 个有提示`}
        </p>
        {message && <p role="status" className="study-message">{message}</p>}
        <p className="study-note">上限 {MAX_FILES} 个、总计 {formatSize(MAX_TOTAL)}、单个 {formatSize(MAX_SINGLE)}。只读文件名做规划，点导出时才读取内容。</p>
      </section>

      {/* 2. 命名规则 */}
      <section className="study-card">
        <h2>2 · 命名规则</h2>
        <div className="study-actions" role="tablist" aria-label="重命名方式">
          {([['pattern', '智能编号'], ['affix', '加前后缀'], ['replace', '查找替换']] as const).map(([m, label]) => (
            <button key={m} role="tab" aria-selected={rule.mode === m}
              className={`study-btn${rule.mode === m ? '' : ' alt'}`}
              disabled={job.busy} onClick={() => set('mode', m)}>{label}</button>
          ))}
        </div>
        <div className="study-fields">
          {rule.mode === 'pattern' && (<>
            <label>命名模板<input maxLength={80} value={rule.pattern} disabled={job.busy}
              onChange={e => set('pattern', e.target.value)} placeholder="如：实验报告_{nnn}" /></label>
            <label>起始编号<input type="number" min={0} max={9999} value={rule.start} disabled={job.busy}
              onChange={e => set('start', Math.max(0, +e.target.value || 0))} /></label>
            <p className="study-note">{TOKEN_HELP}。{!patternHasNumberToken(effectivePattern) && '当前模板无编号占位符，将自动追加 _001 式编号。'}扩展名自动保留。</p>
          </>)}
          {rule.mode === 'affix' && (<>
            <label>统一前缀<input maxLength={40} value={rule.prefix} disabled={job.busy}
              onChange={e => set('prefix', e.target.value)} placeholder="如：2026-" /></label>
            <label>统一后缀<input maxLength={40} value={rule.suffix} disabled={job.busy}
              onChange={e => set('suffix', e.target.value)} placeholder="如：-终稿" /></label>
            <p className="study-note">在原文件名（不含扩展名）前后添加，前缀 + 原名 + 后缀 + 扩展名。</p>
          </>)}
          {rule.mode === 'replace' && (<>
            <label>查找<input maxLength={60} value={rule.find} disabled={job.busy}
              onChange={e => set('find', e.target.value)} placeholder="要替换掉的文字" /></label>
            <label>替换为<input maxLength={60} value={rule.replaceWith} disabled={job.busy}
              onChange={e => set('replaceWith', e.target.value)} placeholder="新文字，可留空删除" /></label>
            <p className="study-note">替换原文件名中所有匹配的文字，不区分大小写之外的精确匹配。</p>
          </>)}
        </div>
      </section>

      {/* 3. 排序与预览 */}
      <section className="study-card">
        <h2>3 · 排序与预览</h2>
        <div className="study-fields">
          <label>排序方式<select value={sortKey} disabled={job.busy || !rows.length}
            onChange={e => applySort(e.target.value as SortKey, asc)}>
            <option value="name">按文件名</option><option value="size">按文件大小</option><option value="type">按文件类型</option>
          </select></label>
          <label>方向<select value={asc ? 'asc' : 'desc'} disabled={job.busy || !rows.length}
            onChange={e => applySort(sortKey, e.target.value === 'asc')}>
            <option value="asc">升序</option><option value="desc">降序</option>
          </select></label>
        </div>
        <p className="study-note">编号顺序 = 当前列表顺序；也可用每行的 ↑ ↓ 手动调整。</p>
        {!!planned.length && (
          <div className="study-table-wrap" tabIndex={0}>
            <table>
              <tbody>
                <tr><th>序号</th><th>原文件名</th><th>新文件名</th><th>大小</th><th>提示</th><th>操作</th></tr>
                {planned.map((p, i) => {
                  const rowId = rows[order[i]]?.id;
                  const changed = p.original !== p.newName;
                  return (
                    <tr key={rowId}>
                      <td>{i + 1}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.original}</td>
                      <td><strong style={changed ? { color: 'var(--novip-accent, #1a73e8)' } : undefined}>{p.newName}</strong></td>
                      <td>{formatSize(p.size)}</td>
                      <td>{p.size === 0 ? '空文件' : ''}{p.warnings.filter(w => !w.startsWith('已手动')).join('；')}</td>
                      <td>
                        <div className="study-actions">
                          {editing === rowId ? (<>
                            <input aria-label="单独改名" maxLength={120} value={editValue} disabled={job.busy}
                              onChange={e => setEditValue(e.target.value)} style={{ maxWidth: 140 }} />
                            <button className="study-btn alt" disabled={job.busy} onClick={() => confirmEdit(rowId!)}>确定</button>
                            <button className="study-btn alt" disabled={job.busy} onClick={() => setEditing(null)}>取消</button>
                          </>) : (
                            <button className="study-btn alt" disabled={job.busy} onClick={() => startEdit(rowId!, p.newName)}>改名</button>
                          )}
                          <button className="study-btn alt" disabled={job.busy || i === 0} aria-label="上移" onClick={() => move(rowId!, -1)}>↑</button>
                          <button className="study-btn alt" disabled={job.busy || i === planned.length - 1} aria-label="下移" onClick={() => move(rowId!, 1)}>↓</button>
                          <button className="study-btn alt" disabled={job.busy} onClick={() => removeRow(rowId!)}>移除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. 导出 */}
      <section className="study-card">
        <h2>4 · 导出</h2>
        <label className="study-check"><input type="checkbox" checked={withMap} disabled={job.busy}
          onChange={e => setWithMap(e.target.checked)} />ZIP 内附带「命名对照表.txt」（原名 → 新名，方便提交材料时备查）</label>
        <div className="study-actions">
          <button className="study-btn" disabled={job.busy || !rows.length} onClick={() => void exportZip()}>
            {job.busy ? '打包中…' : `导出 ZIP（${planned.length} 个文件）`}
          </button>
          <button className="study-btn alt" disabled={!job.busy} onClick={() => job.reset()}>取消</button>
          <button className="study-btn alt" disabled={job.busy || !rows.length} onClick={downloadMap}>只下载对照表</button>
          <button className="study-btn alt" disabled={job.busy || !rows.length} onClick={resetAll}>清空重来</button>
        </div>
        <p className="study-note">ZIP 采用「仅存储」模式打包，文件内容逐字节不变；重名已自动加 _2、_3 避让，解压后可直接打开。</p>
      </section>
    </ToolPage>
  );
}
