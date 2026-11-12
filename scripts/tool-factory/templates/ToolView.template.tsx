import React, { useMemo, useState } from 'react';
import { ToolPage, saveLocal } from './common';
import {
  DEFAULT_PROCESS_OPTIONS,
  processToolInput,
  type ToolProcessOptions,
} from './tool-core.template';

export function ToolViewTemplate() {
  const [rawInput, setRawInput] = useState('');
  const [options, setOptions] = useState<ToolProcessOptions>(DEFAULT_PROCESS_OPTIONS);
  const [feedback, setFeedback] = useState<string | null>(null);

  const result = useMemo(() => processToolInput(rawInput, options), [rawInput, options]);

  const handleLoadSample = () => {
    setRawInput('示例条目 A\n示例条目 B\n示例条目 A\n示例条目 C');
    setFeedback('已加载校园示例数据');
  };

  const handleExport = () => {
    if (!result.output.trim()) return;
    saveLocal('novip-tool-output.txt', result.output, 'text/plain;charset=utf-8');
    setFeedback('已导出结果文件');
  };

  return (
    <ToolPage
      id="__TOOL_ID__"
      title="__TOOL_TITLE__"
      blurb="纯浏览器本地处理，零上传、无水印、支持一键加载示例与导出。"
    >
      <div className="panel">
        <div className="btn-row">
          <button type="button" className="secondary" onClick={handleLoadSample}>
            加载示例数据
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!result.output.trim()}
          >
            导出处理结果
          </button>
        </div>
        {feedback && <p className="muted" role="status">{feedback}</p>}
      </div>
      <div className="grid-2">
        <div className="panel">
          <label htmlFor="tool-template-input">输入内容</label>
          <textarea
            id="tool-template-input"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="在此粘贴或输入需要处理的内容..."
          />
          <label>
            <input
              type="checkbox"
              checked={options.deduplicate}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, deduplicate: e.target.checked }))
              }
            />
            自动去重重复行
          </label>
        </div>
        <div className="panel">
          <label htmlFor="tool-template-output">输出结果 ({result.summary})</label>
          <textarea id="tool-template-output" readOnly value={result.output} />
        </div>
      </div>
    </ToolPage>
  );
}
