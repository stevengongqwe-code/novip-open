/**
 * Excel 合并上限契约（EVERGREEN Builder Round 92，2026-11-07）：
 * src/sheets/core.ts 的 SHEET_LIMITS 是 /tools/sheets 全部容量守卫的唯一口径——
 * 每个字段都直接决定一条用户可见报错文案（parseCsv / readSpreadsheet / mergeSheets），
 * 且在主分支 tests/ 与全部 91 个 open PR 分支的 tests/ 中均无直接引用（词边界去重）。
 * 本文件只锁定常量字面值与各守卫的恰好边界行为，不改生产代码。
 * 全部预期值已先经 npx tsx 探针核对（见 DEVLOG Round 92），无测试侧预期修正。
 * 注：files / totalBytes 两字段仅在 src/sheets/worker.ts 的 webworker 消息守卫
 * （'最多10个文件，累计不超过20MB。'）中使用，node 测试运行器无法直接驱动
 * worker，本文件只锁定其字面值，不模拟 worker 行为。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHEET_LIMITS,
  parseCsv,
  readSpreadsheet,
  mergeSheets,
  type Grid,
  type SheetConfig,
} from '../src/sheets/core';

const csvRow = (cols: number) =>
  Array.from({ length: cols }, (_, i) => `c${i}`).join(',');
const csvLines = (rows: number, cols = 1) =>
  Array.from({ length: rows }, () => csvRow(cols)).join('\n');
const throwsMessage = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail('应抛错却未抛错');
};

const mkGrid = (rows: number, cols: number): Grid => ({
  id: 'g1',
  fileId: 'f1',
  fileName: 'a.csv',
  sheetName: 'S',
  rows: Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ value: 'x', display: 'x', numeric: false })),
  ),
  warnings: [],
});
const mkConfig = (cols: number): SheetConfig => ({
  id: 'g1',
  selected: true,
  headerRow: 1,
  columns: Array.from({ length: cols }, (_, i) => ({
    index: i,
    original: `h${i}`,
    target: `h${i}`,
    ignored: false,
  })),
});

describe('SHEET_LIMITS 字面值', () => {
  it('六个字段恰好为 files 10 / fileBytes 5MiB / totalBytes 20MiB / rows 50000 / cols 100 / cells 500000', () => {
    assert.deepEqual(SHEET_LIMITS, {
      files: 10,
      fileBytes: 5 * 1024 * 1024,
      totalBytes: 20 * 1024 * 1024,
      rows: 50000,
      cols: 100,
      cells: 500000,
    });
    assert.deepEqual(Object.keys(SHEET_LIMITS).sort(), [
      'cells',
      'cols',
      'fileBytes',
      'files',
      'rows',
      'totalBytes',
    ]);
    assert.equal(SHEET_LIMITS.fileBytes, 5242880);
    assert.equal(SHEET_LIMITS.totalBytes, 20971520);
  });
});

describe('parseCsv 列数守卫（SHEET_LIMITS.cols）', () => {
  it('恰好 100 列通过', () => {
    const rows = parseCsv(csvRow(SHEET_LIMITS.cols));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].length, SHEET_LIMITS.cols);
  });

  it('101 列抛错，文案由 cols 拼出', () => {
    assert.equal(
      throwsMessage(() => parseCsv(csvRow(SHEET_LIMITS.cols + 1))),
      `最多${SHEET_LIMITS.cols}列。`,
    );
  });
});

describe('parseCsv 行数守卫（SHEET_LIMITS.rows）', () => {
  it('恰好 50000 条数据行（50001 行含表头）通过', () => {
    assert.equal(parseCsv(csvLines(SHEET_LIMITS.rows + 1)).length, SHEET_LIMITS.rows + 1);
  });

  it('50001 条数据行抛错，文案由 rows 拼出', () => {
    assert.equal(
      throwsMessage(() => parseCsv(csvLines(SHEET_LIMITS.rows + 2))),
      `最多${SHEET_LIMITS.rows}条数据行和1行表头。`,
    );
  });
});

describe('parseCsv 单元格总量守卫（SHEET_LIMITS.cells）', () => {
  it('恰好 500000 单元格（50000 行 × 10 列）通过', () => {
    const rows = parseCsv(csvLines(50000, 10));
    assert.equal(rows.length, 50000);
    assert.equal(rows.reduce((n, r) => n + r.length, 0), SHEET_LIMITS.cells);
  });

  it('500010 单元格（50001 行 × 10 列）抛错', () => {
    assert.equal(
      throwsMessage(() => parseCsv(csvLines(50001, 10))),
      '累计最多50万单元格。',
    );
  });
});

describe('readSpreadsheet 单文件字节守卫（SHEET_LIMITS.fileBytes）', () => {
  it('恰好 5MiB 不触发大小守卫（走到格式校验，证明边界是 > 而非 >=）', () => {
    assert.equal(
      throwsMessage(() =>
        readSpreadsheet(new Uint8Array(SHEET_LIMITS.fileBytes), 'a.xlsx', 'f1'),
      ),
      '只支持真实XLSX及UTF-8 CSV；不支持XLS、XLSM、加密文件。',
    );
  });

  it('5MiB + 1 字节抛错，文案由 fileBytes 的 MB 口径拼出', () => {
    assert.equal(
      throwsMessage(() =>
        readSpreadsheet(new Uint8Array(SHEET_LIMITS.fileBytes + 1), 'a.xlsx', 'f1'),
      ),
      `单文件不超过${SHEET_LIMITS.fileBytes / 1024 / 1024}MB。`,
    );
  });

  it('CSV 路径同样受 cells 守卫：50001 行 × 11 列抛错', () => {
    const bytes = new TextEncoder().encode(csvLines(50001, 11));
    assert.equal(
      throwsMessage(() => readSpreadsheet(bytes, 'a.csv', 'f1')),
      '累计最多50万单元格。',
    );
  });

  it('小 CSV 正常读出，带原始文本读取警告', () => {
    const grids = readSpreadsheet(new TextEncoder().encode('a,b\n1,2'), 'a.csv', 'f1');
    assert.equal(grids.length, 1);
    assert.equal(grids[0].sheetName, 'CSV');
    assert.equal(grids[0].rows.length, 2);
    assert.ok(grids[0].warnings[0].includes('原始文本读取'));
  });
});

describe('mergeSheets 映射列数与数据行守卫', () => {
  it('恰好 100 列映射通过', () => {
    const result = mergeSheets([mkGrid(2, SHEET_LIMITS.cols)], [mkConfig(SHEET_LIMITS.cols)], {
      provenance: false,
      protectIdentifiers: false,
    });
    assert.equal(result.headers.length, SHEET_LIMITS.cols);
  });

  it('101 列映射抛错', () => {
    assert.equal(
      throwsMessage(() =>
        mergeSheets([mkGrid(2, SHEET_LIMITS.cols + 1)], [mkConfig(SHEET_LIMITS.cols + 1)], {
          provenance: false,
          protectIdentifiers: false,
        }),
      ),
      '映射后超过100列，请减少字段。',
    );
  });

  it('恰好 50000 条数据行通过，输出 50000 行', () => {
    const result = mergeSheets([mkGrid(SHEET_LIMITS.rows + 1, 1)], [mkConfig(1)], {
      provenance: false,
      protectIdentifiers: false,
    });
    assert.equal(result.rows.length, SHEET_LIMITS.rows);
  });

  it('50001 条数据行抛错，文案由 rows 拼出', () => {
    assert.equal(
      throwsMessage(() =>
        mergeSheets([mkGrid(SHEET_LIMITS.rows + 2, 1)], [mkConfig(1)], {
          provenance: false,
          protectIdentifiers: false,
        }),
      ),
      `所选来源的数据行累计超过${SHEET_LIMITS.rows}行，请拆分。`,
    );
  });
});

describe('files / totalBytes 字面值（仅 worker 侧守卫使用）', () => {
  it('files=10、totalBytes=20MiB，与 worker.ts 文案“最多10个文件，累计不超过20MB”口径一致', () => {
    assert.equal(SHEET_LIMITS.files, 10);
    assert.equal(SHEET_LIMITS.totalBytes, 20 * 1024 * 1024);
  });
});
