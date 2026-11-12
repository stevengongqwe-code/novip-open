/**
 * 毕业论文内容自查助手（Factory Day 13，2026-11-08）。
 * 交稿前在本地自查一遍：结构齐不齐、标题编号跳没跳号、图表编号与正文
 * 引用对不对得上、自己文章里有没有重复的句子、摘要与关键词合不合要求。
 * 粘贴文本或上传 .txt/.md/.docx 就能出清单，全在浏览器本地算，不上传论文。
 * 明确不做：不查查重率、不查参考文献真伪、不替代学校盲审与知网查重。
 * 版式检查（字体/字号/行距/页边距）请用站内 DOCX格式检查，参考文献
 * 著录格式请用参考文献格式化。
 */
import { useState } from 'react';
import { copyLocal } from '../tool-common';
import { ToolPage, Table, saveLocal } from './common';
import {
  checkThesis,
  DEFAULT_THESIS_OPTIONS,
  extractDocxParagraphs,
  parseTextToParagraphs,
  reportToText,
  SAMPLE_THESIS_TEXT,
  type ThesisReport,
} from './thesis-check-core';

function parseIntField(s: string, label: string): number {
  const v = Number(s.trim());
  if (s.trim() === '' || !Number.isFinite(v) || !Number.isInteger(v)) throw new Error(`${label}须为整数`);
  return v;
}

export default function ThesisCheck() {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  const [targetMin, setTargetMin] = useState(String(DEFAULT_THESIS_OPTIONS.targetWordsMin));
  const [targetMax, setTargetMax] = useState(String(DEFAULT_THESIS_OPTIONS.targetWordsMax));
  const [abstractMin, setAbstractMin] = useState(String(DEFAULT_THESIS_OPTIONS.abstractWordsMin));
  const [abstractMax, setAbstractMax] = useState(String(DEFAULT_THESIS_OPTIONS.abstractWordsMax));
  const [keywordsMin, setKeywordsMin] = useState(String(DEFAULT_THESIS_OPTIONS.keywordsMin));
  const [keywordsMax, setKeywordsMax] = useState(String(DEFAULT_THESIS_OPTIONS.keywordsMax));
  const [report, setReport] = useState<ThesisReport>();
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const runCheck = async () => {
    setError('');
    setStatus('');
    try {
      const options = {
        targetWordsMin: parseIntField(targetMin, '目标字数下限'),
        targetWordsMax: parseIntField(targetMax, '目标字数上限'),
        abstractWordsMin: parseIntField(abstractMin, '摘要字数下限'),
        abstractWordsMax: parseIntField(abstractMax, '摘要字数上限'),
        keywordsMin: parseIntField(keywordsMin, '关键词个数下限'),
        keywordsMax: parseIntField(keywordsMax, '关键词个数上限'),
      };
      let paragraphs;
      let used = '';
      if (file) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.docx')) {
          if (file.size > 20 * 1024 * 1024) throw new Error('DOCX 超过 20MB，请拆分文档。');
          paragraphs = extractDocxParagraphs(new Uint8Array(await file.arrayBuffer()));
        } else if (name.endsWith('.txt') || name.endsWith('.md')) {
          if (file.size > 2 * 1024 * 1024) throw new Error('文本文件超过 2MB，请拆分。');
          paragraphs = parseTextToParagraphs(await file.text());
        } else {
          throw new Error('仅支持 .txt / .md / .docx 文件。');
        }
        used = `文件「${file.name}」`;
      } else {
        paragraphs = parseTextToParagraphs(text);
        used = '粘贴的文本';
      }
      setReport(checkThesis(paragraphs, options));
      setSource(used);
      setStatus(`已按${used}完成自查。`);
    } catch (e) {
      setReport(undefined);
      setError(e instanceof Error ? e.message : '检查失败。');
    }
  };

  const loadSample = () => {
    setText(SAMPLE_THESIS_TEXT);
    setFile(undefined);
    setReport(undefined);
    setError('');
    setStatus('已填入示例论文（含 8 处典型问题），点「开始检查」可先试一遍。');
  };

  const clearAll = () => {
    setText('');
    setFile(undefined);
    setReport(undefined);
    setError('');
    setStatus('');
  };

  const copyReport = async () => {
    if (!report) {
      setError('请先在第 1 节检查论文，再复制报告。');
      return;
    }
    try {
      await copyLocal(reportToText(report));
      setError('');
      setStatus('自查报告已复制。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败。');
    }
  };

  const downloadReport = () => {
    if (!report) {
      setError('请先在第 1 节检查论文，再下载报告。');
      return;
    }
    try {
      saveLocal(
        new Blob([`\ufeff${reportToText(report)}`], { type: 'text/plain;charset=utf-8' }),
        'novip-thesis-check.txt',
      );
      setError('');
      setStatus('已开始下载自查报告 TXT。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    }
  };

  const errors = report?.findings.filter((f) => f.severity === '错误') ?? [];
  const warns = report?.findings.filter((f) => f.severity === '提醒') ?? [];

  return (
    <ToolPage
      id="thesis-check"
      title="毕业论文内容自查助手"
      description="论文交稿前，先在本地自查一遍：结构齐不齐、标题编号跳没跳号、图表编号与正文引用对不对得上、自己文章里有没有重复的句子、摘要与关键词合不合要求。粘贴文本或上传 .txt/.md/.docx 就能出清单，全在浏览器本地算，不上传论文。"
    >
      <section className="study-card">
        <h2>1 论文内容</h2>
        <p>
          粘贴论文全文，或上传 .txt / .md（≤2MB）/ .docx（≤20MB）。粘贴文本请保留「第 X 章」「1.1」等标题编号与「图 1-1」「表 2-3」题注；.docx
          会按 Word 标题样式识别层级。论文内容只在你的浏览器内存里处理，不上传、不保存，刷新即清空。
        </p>
        <label>
          粘贴论文全文
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setReport(undefined);
            }}
            placeholder="把论文全文粘贴到这里（建议从 Word 复制，保留标题编号与图表题注）"
            rows={10}
          />
        </label>
        <label>
          或上传文件（.txt / .md / .docx，有文件时以文件为准）
          <input
            type="file"
            accept=".txt,.md,.docx"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setReport(undefined);
              e.target.value = '';
            }}
          />
        </label>
        <p>{file ? `已选择：${file.name}` : '尚未选择文件（只粘贴文本也可以检查）。'}</p>
        <div className="study-fields">
          <label>
            目标字数下限
            <input value={targetMin} onChange={(e) => setTargetMin(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            目标字数上限
            <input value={targetMax} onChange={(e) => setTargetMax(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            摘要字数下限
            <input value={abstractMin} onChange={(e) => setAbstractMin(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            摘要字数上限
            <input value={abstractMax} onChange={(e) => setAbstractMax(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            关键词个数下限
            <input value={keywordsMin} onChange={(e) => setKeywordsMin(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            关键词个数上限
            <input value={keywordsMax} onChange={(e) => setKeywordsMax(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        <p>默认值：正文 8000–15000 字、摘要 300–500 字、关键词 3–8 个（本科常见要求；请按你们学校模板调整）。</p>
        <div className="study-actions">
          <button className="study-btn" onClick={() => void runCheck()}>
            开始检查
          </button>
          <button className="study-btn alt" onClick={loadSample}>
            填入示例
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
            2 自查报告（{source}）：{report.findings.length} 项问题（错误 {errors.length} 项、提醒 {warns.length} 项）
          </h2>
          <p>
            全文 {report.stats.totalWords} 字（汉字 {report.stats.chineseChars}、英文单词 {report.stats.englishWords}），
            {report.stats.paragraphs} 段、{report.stats.sentences} 句；图 {report.stats.figures} 个、表 {report.stats.tables} 个、
            参考文献 {report.stats.references} 条
            {report.stats.abstractWords !== null ? `；摘要 ${report.stats.abstractWords} 字、关键词 ${report.stats.keywordCount ?? 0} 个` : ''}。
          </p>
          <h3>结构清单</h3>
          <ul>
            {report.structure.map((s) => (
              <li key={s.key}>
                {s.found ? '✓' : '✗'} {s.label}
                {s.location ? `（${s.location}）` : '（未找到）'}
              </li>
            ))}
          </ul>
          {report.findings.length > 0 ? (
            <>
              <h3>问题清单</h3>
              <Table
                rows={[
                  ['级别', '位置', '问题', '建议'],
                  ...report.findings.map((f) => [f.severity, f.location, f.message, f.suggestion]),
                ]}
              />
            </>
          ) : (
            <p>未发现问题：结构齐全、编号连续、引用一致、无内部重复。</p>
          )}
          {report.passed.length > 0 && (
            <>
              <h3>通过项</h3>
              <ul>
                {report.passed.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          <div className="study-actions">
            <button className="study-btn" onClick={() => void copyReport()}>
              复制报告
            </button>
            <button className="study-btn alt" onClick={downloadReport}>
              下载报告 TXT
            </button>
          </div>
        </section>
      )}

      <section className="study-card">
        <h2>3 诚实说明</h2>
        <p>
          本工具只做规则自查：不查查重率（查重率取决于知网/维普等商业比对库，本地算不出真实查重率；这里只检你自己文章内部重复的句子）、不查参考文献真伪、不替代学校盲审与知网查重。
        </p>
        <p>
          版式检查（字体、字号、行距、页边距）请用站内 <a href="/tools/docx-check">DOCX格式检查</a>；参考文献著录格式请用站内{' '}
          <a href="/tools/references">参考文献格式化</a>。标题编号、图表编号与参考文献序号请以你们学校模板为准。
        </p>
      </section>
    </ToolPage>
  );
}
