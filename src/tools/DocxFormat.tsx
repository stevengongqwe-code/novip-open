/**
 * DOCX 一键排版（Factory Day 14，2026-11-09）。
 * 上传写好的 .docx，选一套排版预设，一键把全篇标题、正文、行距、
 * 缩进、页边距改成规范格式，下载可直接交稿的新 .docx + 修改清单。
 * 全程浏览器本地，不上传、不调用 AI、不改文字内容。
 * 明确不做：不生成目录、不查内容结构、不查查重率；表格内段落与
 * 图表题注不动；通用预设非任何学校官方模板。
 */
import { useState } from 'react';
import { copyLocal } from '../tool-common';
import { ToolPage, Table, saveLocal } from './common';
import {
  FORMAT_PRESETS,
  buildSampleDocx,
  formatDocx,
  type FormatReport,
} from './docx-format-core';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function reportToText(report: FormatReport, fileName: string): string {
  const lines = [
    `NOVIP DOCX 一键排版报告（${report.presetName}）`,
    `文件：${fileName}`,
    `共 ${report.totalParagraphs} 段：1 级标题 ${report.headings[1]} 段、2 级标题 ${report.headings[2]} 段、3 级标题 ${report.headings[3]} 段、正文 ${report.bodyFormatted} 段。`,
    `跳过：表格内 ${report.skipped.table} 段、图表题注 ${report.skipped.caption} 段、文本框 ${report.skipped.textbox} 段、空段 ${report.skipped.empty} 段。`,
    report.marginsBefore
      ? `页边距：${report.marginsBefore.top}/${report.marginsBefore.bottom}/${report.marginsBefore.left}/${report.marginsBefore.right}cm → ${report.marginsAfter!.top}/${report.marginsAfter!.bottom}/${report.marginsAfter!.left}/${report.marginsAfter!.right}cm（上/下/左/右）。`
      : '页边距：文档无节设置，未写入。',
    ...report.warnings.map((w) => `注意：${w}`),
    '修改明细：',
    ...report.changes.map((c) => `段落${c.index}（${c.level === 0 ? '正文' : `${c.level}级标题`}）${c.excerpt}：${c.changes.join('；')}`),
    report.changesTruncated ? '（修改明细仅列出前 200 段）' : '',
    '说明：通用预设非任何学校官方模板，请以学院通知为准并抽查；目录请在 Word 中按 F9 刷新；本工具不改文字内容。',
  ];
  return lines.join('\n');
}

export default function DocxFormat() {
  const [file, setFile] = useState<File>();
  const [presetId, setPresetId] = useState('thesis');
  const [bodyFont, setBodyFont] = useState('');
  const [bodySize, setBodySize] = useState('');
  const [line, setLine] = useState('');
  const [margin, setMargin] = useState('');
  const [detectNumbered, setDetectNumbered] = useState(true);
  const [report, setReport] = useState<FormatReport>();
  const [outBytes, setOutBytes] = useState<Uint8Array>();
  const [outName, setOutName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const preset = FORMAT_PRESETS.find((p) => p.id === presetId) ?? FORMAT_PRESETS[0];

  const runFormat = async () => {
    setError('');
    setStatus('');
    try {
      if (!file) throw new Error('先选择 DOCX。');
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过20MB。');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const size = bodySize.trim() === '' ? undefined : Number(bodySize);
      const lineV = line.trim() === '' ? undefined : Number(line);
      const marginV = margin.trim() === '' ? undefined : Number(margin);
      if (bodySize.trim() !== '' && (!Number.isFinite(size!) || size! <= 0)) throw new Error('正文字号须为数字。');
      if (line.trim() !== '' && (!Number.isFinite(lineV!) || lineV! <= 0)) throw new Error('行距倍数须为数字。');
      if (margin.trim() !== '' && (!Number.isFinite(marginV!) || marginV! <= 0)) throw new Error('页边距须为数字。');
      const { bytes: out, report: rep } = formatDocx(bytes, {
        presetId,
        bodyFont: bodyFont.trim() === '' ? undefined : bodyFont.trim(),
        bodySizePt: size,
        line: lineV,
        marginMm: marginV,
        detectNumberedHeadings: detectNumbered,
      });
      const name = file.name.replace(/\.docx$/i, '') + '-排版后.docx';
      setReport(rep);
      setOutBytes(out);
      setOutName(name);
      setStatus(`已按「${rep.presetName}」排版：${rep.headings[1] + rep.headings[2] + rep.headings[3]} 个标题、${rep.bodyFormatted} 段正文已改，跳过 ${rep.skipped.table + rep.skipped.caption + rep.skipped.textbox} 段（表格/题注/文本框）。`);
    } catch (e) {
      setReport(undefined);
      setOutBytes(undefined);
      setError(e instanceof Error ? e.message : '排版失败。');
    }
  };

  const downloadSample = () => {
    try {
      const bytes = buildSampleDocx();
      saveLocal(new Blob([bytes.slice().buffer], { type: DOCX_MIME }), 'novip-docx-format-示例.docx');
      setError('');
      setStatus('示例文档已下载：含样式标题、编号标题、杂乱正文、表格与题注各一段，可直接上传试排版。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '示例下载失败。');
    }
  };

  const downloadOut = () => {
    if (!outBytes) return;
    try {
      saveLocal(new Blob([outBytes.slice().buffer], { type: DOCX_MIME }), outName);
      setError('');
      setStatus(`已开始下载 ${outName}。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const copyReport = async () => {
    if (!report || !file) return;
    try {
      await copyLocal(reportToText(report, file.name));
      setError('');
      setStatus('修改清单已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const clearAll = () => {
    setFile(undefined);
    setReport(undefined);
    setOutBytes(undefined);
    setOutName('');
    setError('');
    setStatus('');
  };

  return (
    <ToolPage
      id="docx-format"
      title="DOCX 一键排版"
      description="上传写好的 .docx，选一套排版预设，一键把全篇标题、正文、行距、缩进、页边距改成规范格式，下载可直接交稿的新 .docx；全程浏览器本地处理，不上传、不登录、无水印。"
    >
      <section className="study-card">
        <h2>1 上传文档与选择预设</h2>
        <p>
          上传 .docx（≤20MB）。标题按 Word 标题样式识别层级；没设样式的标题可用编号识别（「第 X 章」「1」「1.1」「1.1.1」开头）。
          文档只在你的浏览器内存里处理，不上传、不保存，刷新即清空。
        </p>
        <label>
          待排版 DOCX
          <input
            type="file"
            accept=".docx"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setReport(undefined);
              setOutBytes(undefined);
              e.target.value = '';
            }}
          />
        </label>
        <p>{file ? `已选择：${file.name}` : '尚未选择文件。'}</p>
        <label>
          排版预设
          <select
            value={presetId}
            onChange={(e) => {
              setPresetId(e.target.value);
              setReport(undefined);
              setOutBytes(undefined);
            }}
          >
            {FORMAT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p>{preset.description}</p>
        <div className="study-fields">
          <label>
            正文字体（留空用预设）
            <input value={bodyFont} onChange={(e) => setBodyFont(e.target.value)} placeholder={preset.bodyFont} />
          </label>
          <label>
            正文字号 pt（留空用预设）
            <input value={bodySize} onChange={(e) => setBodySize(e.target.value)} inputMode="decimal" placeholder={String(preset.bodySizePt)} />
          </label>
          <label>
            行距倍数（留空用预设）
            <input value={line} onChange={(e) => setLine(e.target.value)} inputMode="decimal" placeholder={String(preset.bodyLine)} />
          </label>
          <label>
            页边距 mm 四边统一（留空用预设）
            <input value={margin} onChange={(e) => setMargin(e.target.value)} inputMode="decimal" placeholder="25.4 / 31.7" />
          </label>
        </div>
        <label className="study-check">
          <input type="checkbox" checked={detectNumbered} onChange={(e) => setDetectNumbered(e.target.checked)} />
          按编号识别未设样式的标题（「第 X 章」「1」「1.1」开头、40 字以内）
        </label>
        <div className="study-actions">
          <button className="study-btn" onClick={() => void runFormat()}>
            开始排版
          </button>
          <button className="study-btn alt" onClick={downloadSample}>
            下载示例文档
          </button>
          <button className="study-btn alt" onClick={clearAll}>
            清空
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
      </section>

      {report && (
        <section className="study-card">
          <h2>
            2 排版报告（{report.presetName}）：{report.headings[1] + report.headings[2] + report.headings[3]} 个标题、
            {report.bodyFormatted} 段正文已改
          </h2>
          <p>
            共 {report.totalParagraphs} 段：1 级标题 {report.headings[1]} 段、2 级标题 {report.headings[2]} 段、3 级标题{' '}
            {report.headings[3]} 段、正文 {report.bodyFormatted} 段；跳过表格内 {report.skipped.table} 段、图表题注{' '}
            {report.skipped.caption} 段、文本框 {report.skipped.textbox} 段、空段 {report.skipped.empty} 段。
          </p>
          <p>
            页边距：
            {report.marginsBefore
              ? `改前 ${report.marginsBefore.top}/${report.marginsBefore.bottom}/${report.marginsBefore.left}/${report.marginsBefore.right}cm → 改后 ${report.marginsAfter!.top}/${report.marginsAfter!.bottom}/${report.marginsAfter!.left}/${report.marginsAfter!.right}cm（上/下/左/右）`
              : '文档无节设置，未写入'}
            。
          </p>
          {report.warnings.map((w) => (
            <p key={w}>注意：{w}</p>
          ))}
          {report.changes.length > 0 && (
            <>
              <h3>修改明细{report.changesTruncated ? '（仅前 200 段）' : ''}</h3>
              <Table
                rows={[
                  ['位置', '内容', '修改'],
                  ...report.changes.map((c) => [
                    `段落${c.index}（${c.level === 0 ? '正文' : `${c.level}级标题`}）`,
                    c.excerpt,
                    c.changes.join('；'),
                  ]),
                ]}
              />
            </>
          )}
          <div className="study-actions">
            <button className="study-btn" onClick={downloadOut}>
              下载排版后文档
            </button>
            <button className="study-btn alt" onClick={() => void copyReport()}>
              复制修改清单
            </button>
          </div>
        </section>
      )}

      <section className="study-card">
        <h2>3 诚实说明</h2>
        <p>
          通用预设不是任何学校的官方模板：各校对标题字号、行距、页边距的要求各不相同，请以你们学院最新通知为准，下载后抽查几段再交稿。
        </p>
        <p>
          本工具只改版式，不改文字内容；不生成目录（请在 Word 中打开排版后文档按 F9 刷新目录）；表格内段落、图表题注、页眉页脚、脚注与批注不动。
          内容结构自查（标题编号跳号、图表引用、内部重复）请用站内{' '}
          <a href="/tools/thesis-check">毕业论文内容自查助手</a>；版式检查请用站内{' '}
          <a href="/tools/docx-check">DOCX格式检查</a>。
        </p>
      </section>
    </ToolPage>
  );
}
