import { useDeferredValue, useMemo, useState } from 'react';
import { copyLocal } from '../tool-common';
import { ToolPage, textDownload } from './common';
import {
  MAX_BYTES,
  MAX_CHARS,
  applyTextTransform,
  checkTextInput,
  countCharacters,
  createDefaultTransformOptions,
  formatBytes,
  textStats,
  type CaseMode,
  type SortDirection,
  type TextTransformOptions,
  type WidthMode,
} from './text-toolkit-core';
import './text-toolkit.css';

type LineBooleanKey =
  | 'trimText'
  | 'trimLines'
  | 'removeLineNumbers'
  | 'removeBlankLines'
  | 'collapseBlankLines'
  | 'dedupeLines'
  | 'reverseLines'
  | 'addLineNumbers';

const LINE_CHECKS: readonly { key: LineBooleanKey; label: string }[] = [
  { key: 'trimText', label: '去除首尾空白' },
  { key: 'trimLines', label: '删除行首行尾空白' },
  { key: 'removeLineNumbers', label: '去除行号' },
  { key: 'removeBlankLines', label: '删除空行' },
  { key: 'collapseBlankLines', label: '合并连续空行' },
  { key: 'dedupeLines', label: '去重行（保留首次）' },
  { key: 'reverseLines', label: '反转行序' },
  { key: 'addLineNumbers', label: '添加行号' },
];

const SORT_OPTIONS: readonly { value: SortDirection; label: string }[] = [
  { value: 'none', label: '不排序' },
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' },
];

const CASE_OPTIONS: readonly { value: CaseMode; label: string }[] = [
  { value: 'none', label: '保持原样' },
  { value: 'upper', label: '全部大写' },
  { value: 'lower', label: '全部小写' },
  { value: 'title', label: '首字母大写' },
];

const WIDTH_OPTIONS: readonly { value: WidthMode; label: string }[] = [
  { value: 'none', label: '保持原宽' },
  { value: 'half', label: '全角→半角' },
  { value: 'full', label: '半角→全角' },
];

const EXAMPLE_TEXT = ['苹果', '香蕉', '苹果', '', '  蓝莓  ', '3. 樱桃', '1、樱桃', 'B', 'A'].join('\n');

export default function TextToolkit() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<TextTransformOptions>(createDefaultTransformOptions);
  const [status, setStatus] = useState('');
  const [actionError, setActionError] = useState('');
  // 超大文本做整理/排序可能耗时，用延迟值让输入框保持顺滑；结果区会提示正在更新。
  const deferredText = useDeferredValue(text);
  const previewPending = deferredText !== text;

  const stats = useMemo(() => textStats(text), [text]);
  const inputCheck = useMemo(() => checkTextInput(text), [text]);
  const preview = useMemo(() => {
    if (deferredText === '') return '';
    if (!checkTextInput(deferredText).ok) return '';
    return applyTextTransform(deferredText, options);
  }, [deferredText, options]);

  const limitError = !inputCheck.ok && inputCheck.reason !== 'empty' ? inputCheck.message : '';

  function changeText(value: string) {
    setText(value);
    setStatus('');
    setActionError('');
  }

  function clearMessages() {
    setStatus('');
    setActionError('');
  }

  function updateOption<K extends keyof TextTransformOptions,>(key: K, value: TextTransformOptions[K]) {
    setOptions((old) => ({ ...old, [key]: value }));
    clearMessages();
  }

  function toggleLineOption(key: LineBooleanKey) {
    setOptions((old) => ({ ...old, [key]: !old[key] }));
    clearMessages();
  }

  function resetAll() {
    setText('');
    setOptions(createDefaultTransformOptions());
    clearMessages();
  }

  function ensurePreview(): boolean {
    if (!inputCheck.ok) {
      setActionError(inputCheck.message);
      return false;
    }
    if (preview === '') {
      setActionError('结果为空，没有可复制或下载的内容。请调整文本或操作。');
      return false;
    }
    return true;
  }

  async function copyResult() {
    clearMessages();
    if (!ensurePreview()) return;
    try {
      await copyLocal(preview);
      setStatus('已复制结果到剪贴板。');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '复制失败，请手动选中结果复制。');
    }
  }

  function downloadResult() {
    clearMessages();
    if (!ensurePreview()) return;
    try {
      textDownload(preview, '文本工具箱结果.txt');
      setStatus('已生成 TXT 文件，请打开核对换行与编码。');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '下载失败，请重试。');
    }
  }

  return (
    <ToolPage
      id="text"
      title="文本工具箱"
      description="粘贴或输入文本，实时统计字数、行数和阅读时间；可叠加去空白、去空行、去重、排序、行号、前后缀、查找替换，以及大小写与全半角转换。全部在浏览器本地完成，不上传服务器。"
    >
      <section className="study-card">
        <h2>1 · 输入与实时统计</h2>
        <label>
          待处理文本
          <textarea
            aria-label="待处理文本"
            rows={8}
            value={text}
            spellCheck={false}
            placeholder="在此输入或粘贴文本（上限 50 万字符或 2MB）"
            onChange={(event) => changeText(event.target.value)}
          />
        </label>
        {limitError && (
          <div role="alert" className="study-error">
            {limitError}
          </div>
        )}
        <dl className="text-toolkit-stats">
          <div>
            <dt>字符数（含空格）</dt>
            <dd data-stat="chars">{stats.chars}</dd>
          </div>
          <div>
            <dt>字符数（不含空格）</dt>
            <dd data-stat="charsNoSpaces">{stats.charsNoSpaces}</dd>
          </div>
          <div>
            <dt>中文汉字</dt>
            <dd data-stat="chinese">{stats.chineseChars}</dd>
          </div>
          <div>
            <dt>英文单词</dt>
            <dd data-stat="englishWords">{stats.englishWords}</dd>
          </div>
          <div>
            <dt>行数</dt>
            <dd data-stat="lines">{stats.lines}</dd>
          </div>
          <div>
            <dt>段落数</dt>
            <dd data-stat="paragraphs">{stats.paragraphs}</dd>
          </div>
          <div>
            <dt>UTF-8 字节</dt>
            <dd data-stat="bytes">{stats.utf8Bytes}</dd>
          </div>
          <div>
            <dt>预计阅读（分钟）</dt>
            <dd data-stat="readingMinutes">{stats.readingMinutes}</dd>
          </div>
        </dl>
        <p className="study-note">
          输入上限 {MAX_CHARS} 字符（按码点）或 {formatBytes(MAX_BYTES)}（UTF-8）；当前 {stats.chars} 字符 /{' '}
          {formatBytes(stats.utf8Bytes)}。emoji 按 1 个字符计，CRLF 按 1 个换行计；统计只用于核对，不判断内容质量。
        </p>
        <div className="study-subactions">
          <button type="button" className="study-link" onClick={() => changeText(EXAMPLE_TEXT)}>
            填入示例文本
          </button>
        </div>
      </section>

      <section className="study-card">
        <h2>2 · 文本整理（可叠加）</h2>
        <fieldset className="text-toolkit-group">
          <legend>行整理</legend>
          <div className="text-toolkit-checks">
            {LINE_CHECKS.map((item) => (
              <label key={item.key} className="text-toolkit-check">
                <input
                  type="checkbox"
                  checked={options[item.key]}
                  onChange={() => toggleLineOption(item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="text-toolkit-row">
          <span className="text-toolkit-label">行排序</span>
          <div className="text-toolkit-seg" role="group" aria-label="行排序">
            {SORT_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={options.sortDirection === item.value}
                onClick={() => updateOption('sortDirection', item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="study-fields">
          <label>
            每行前缀
            <input
              value={options.prefix}
              spellCheck={false}
              placeholder="如：- "
              onChange={(event) => updateOption('prefix', event.target.value)}
            />
          </label>
          <label>
            每行后缀
            <input
              value={options.suffix}
              spellCheck={false}
              placeholder="如：；"
              onChange={(event) => updateOption('suffix', event.target.value)}
            />
          </label>
          <label>
            查找内容（字面量）
            <input
              value={options.find}
              spellCheck={false}
              placeholder="不填则不做替换"
              onChange={(event) => updateOption('find', event.target.value)}
            />
          </label>
          <label>
            替换为
            <input
              value={options.replaceWith}
              spellCheck={false}
              placeholder="留空表示删除"
              onChange={(event) => updateOption('replaceWith', event.target.value)}
            />
          </label>
        </div>
        <label className="text-toolkit-check">
          <input
            type="checkbox"
            checked={options.replaceAll}
            onChange={() => updateOption('replaceAll', !options.replaceAll)}
          />
          <span>全部替换（关闭时只替换第一处）</span>
        </label>
        <p className="study-note">
          处理顺序：去除整段首尾空白 → 行整理（行首尾空白、去行号、空行、去重、排序、反转、前后缀、行号）→
          全半角 → 大小写 → 中文标点 → 查找替换。同时勾选「删除空行」与「合并连续空行」时，删除空行优先。
          文本特别长且勾选排序/去重时，预览可能需要数秒（输入框仍可继续编辑），可先减少操作。
        </p>
      </section>

      <section className="study-card">
        <h2>3 · 大小写、全半角与标点</h2>
        <div className="text-toolkit-row">
          <span className="text-toolkit-label">英文大小写</span>
          <div className="text-toolkit-seg" role="group" aria-label="英文大小写">
            {CASE_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={options.caseMode === item.value}
                onClick={() => updateOption('caseMode', item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-toolkit-row">
          <span className="text-toolkit-label">全角 / 半角</span>
          <div className="text-toolkit-seg" role="group" aria-label="全角半角">
            {WIDTH_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={options.widthMode === item.value}
                onClick={() => updateOption('widthMode', item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <label className="text-toolkit-check">
          <input
            type="checkbox"
            checked={options.chinesePunctuation}
            onChange={() => updateOption('chinesePunctuation', !options.chinesePunctuation)}
          />
          <span>中文标点→英文标点（常见一批）</span>
        </label>
        <p className="study-note">
          中文标点只转换常见的一批（，。；：！？、（）【】「」『』《》…—），不处理全部 Unicode 标点；全角/半角只处理
          ASCII 可见字符与空格，中文汉字不受影响。
        </p>
      </section>

      <section className="study-card">
        <h2>4 · 结果与导出</h2>
        <p className="study-count">
          结果 {countCharacters(preview)} 字符{preview === '' ? ' · 暂无结果' : ' · 已按勾选操作生成'}
        </p>
        <label>
          处理结果
          <textarea
            aria-label="处理结果"
            rows={10}
            readOnly
            spellCheck={false}
            value={preview}
            placeholder="处理结果会显示在这里"
          />
        </label>
        {previewPending && (
          <p role="status" className="study-message">
            正在更新预览…
          </p>
        )}
        {!previewPending && text !== '' && inputCheck.ok && preview === '' && (
          <p role="status" className="study-message">
            结果为空白：当前操作组合把文本清空了，可减少勾选或检查查找替换。
          </p>
        )}
        <div className="study-actions">
          <button type="button" className="study-btn" disabled={previewPending} onClick={() => void copyResult()}>
            复制结果
          </button>
          <button type="button" className="study-btn alt" disabled={previewPending} onClick={downloadResult}>
            下载 TXT
          </button>
          <button type="button" className="study-btn alt" onClick={resetAll}>
            清空
          </button>
        </div>
        {status && (
          <p role="status" className="study-message">
            {status}
          </p>
        )}
        {actionError && (
          <div role="alert" className="study-error">
            {actionError}
          </div>
        )}
      </section>

      <details>
        <summary>处理顺序与统计口径说明</summary>
        <p>
          字符数按 Unicode 码点计（emoji 记 1，CRLF 记 1 个换行）；UTF-8 字节数按原始文本计；阅读时间按中文 300
          字/分钟、英文 220 词/分钟估算，非中英文内容按 400 字符/分钟兜底。
        </p>
        <p>
          行排序使用 localeCompare('zh') 的拼音顺序并保证稳定；去重按整行完全一致比较、保留首次出现；行处理会忽略末尾换行产生的空行，结果统一使用
          LF 换行。去除行号只处理行首常见编号（1. / 1、/ 1) /（1）/ 1 内容），不处理「第 3 章」等写法。
        </p>
        <p>
          全部处理在本机浏览器内存中完成，不联网、不上传、不写入本地存储；刷新页面即清空，复制或下载前请自行核对结果。
        </p>
      </details>
    </ToolPage>
  );
}
