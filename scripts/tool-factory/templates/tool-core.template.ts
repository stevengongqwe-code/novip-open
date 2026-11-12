/**
 * NOVIP Tool Factory — Standard Pure Core Template
 * Replace __TOOL_ID__, __TOOL_TITLE__, and core logic functions.
 * Constraints:
 * - Zero external network calls (no fetch / XMLHttpRequest)
 * - Deterministic pure functions for unit testing under Node `node --test`
 */

export interface ToolInputItem {
  id: string;
  name: string;
  content: string;
}

export interface ToolProcessOptions {
  trimWhitespace: boolean;
  deduplicate: boolean;
}

export interface ToolProcessResult {
  output: string;
  inputCount: number;
  outputCount: number;
  summary: string;
}

export const DEFAULT_PROCESS_OPTIONS: ToolProcessOptions = {
  trimWhitespace: true,
  deduplicate: true,
};

export function processToolInput(
  rawInput: string,
  options: ToolProcessOptions = DEFAULT_PROCESS_OPTIONS,
): ToolProcessResult {
  const lines = rawInput.replace(/\r\n/g, '\n').split('\n');
  const cleaned = options.trimWhitespace ? lines.map((line) => line.trim()).filter(Boolean) : lines;
  const finalLines = options.deduplicate ? Array.from(new Set(cleaned)) : cleaned;

  return {
    output: finalLines.join('\n'),
    inputCount: lines.filter(Boolean).length,
    outputCount: finalLines.length,
    summary: `已处理 ${lines.filter(Boolean).length} 项输入，输出 ${finalLines.length} 项结果。`,
  };
}
