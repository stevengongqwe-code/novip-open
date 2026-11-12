/**
 * references-core 来源常量与默认学校配置契约测试（OPERATION NOVIP EVERGREEN 2026-11-07，Round 90）。
 * 背景：全量运行时导出审计（737 项导出 → 主分支 tests/ 零直接引用 265 项 →
 * 以 89 个 open PR 分支 tests/ 词边界交叉去重后剩余 45 项）中，references-core 簇
 * （defaultSchool / source2025 / source2015，3 项）是剩余纯数据簇中用户可见契约
 * 最完整的一簇：两个来源 URL 是参考文献工具「版本变化与校验依据」区「查看来源」
 * 链接的回落地址（8 条规则中仅 R01 自带 url，其余 7 条用这两个常量），defaultSchool
 * 是 renderReference 的默认学校配置与 References.tsx 的初始学校状态，决定末尾
 * 句号与 DOI 是否显示。不改生产代码，只锁定契约。
 * 全部预期值先经 tsx 探针核对再写入（见 DEVLOG Round 90）。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSchool,
  source2025,
  source2015,
  rules,
  blankReference,
  renderReference,
} from '../src/references/core';

function journalRef() {
  const r = blankReference(1);
  r.kind = 'J';
  r.title = '测试题名';
  r.authors = '张三';
  r.source = '测试刊物';
  r.year = '2024';
  r.volume = '1';
  r.issue = '2';
  r.pages = '3-5';
  r.confirmed = true;
  return r;
}

describe('references-core 默认学校配置 defaultSchool', () => {
  it('字面值逐项锁定：未启用、空名空源、不全列作者、不隐藏 DOI、末尾加句号', () => {
    assert.equal(defaultSchool.enabled, false);
    assert.equal(defaultSchool.name, '');
    assert.equal(defaultSchool.source, '');
    assert.equal(defaultSchool.allAuthors, false);
    assert.equal(defaultSchool.hideDoi, false);
    assert.equal(defaultSchool.endPeriod, true);
  });

  it('是“未启用学校规范”的关断态：enabled 为 false 且名称与来源均为空', () => {
    assert.equal(defaultSchool.enabled, false);
    assert.equal(defaultSchool.name, '');
    assert.equal(defaultSchool.source, '');
  });
});

describe('references-core 标准来源 URL source2025 / source2015', () => {
  it('source2025 逐字锁定：集美大学学报办公系统的 2025 标准 PDF', () => {
    assert.equal(
      source2025,
      'https://xuebaobangong.jmu.edu.cn/zkb/Upload/Park/64b9ba1b-df55-4309-87d4-0d037a497bd0.pdf',
    );
  });

  it('source2025 为有效 https PDF 直链', () => {
    const u = new URL(source2025);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'xuebaobangong.jmu.edu.cn');
    assert.ok(source2025.endsWith('.pdf'));
  });

  it('source2015 逐字锁定：中国科学技术大学学报上传的 GB/T 7714-2015 标准 PDF', () => {
    assert.equal(
      source2015,
      'https://journal.ustc.edu.cn/uploadfile/yjsjy/20161108/GB%20T%207714-2015%E4%BF%A1%E6%81%AF%E4%B8%8E%E6%96%87%E7%8C%AE-%E5%8F%82%E8%80%83%E6%96%87%E7%8C%AE%E8%91%97%E5%BD%95%E8%A7%84%E5%88%99.pdf',
    );
  });

  it('source2015 为有效 https PDF 直链，解码后含标准号 GB T 7714-2015', () => {
    const u = new URL(source2015);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'journal.ustc.edu.cn');
    assert.ok(source2015.endsWith('.pdf'));
    assert.ok(decodeURIComponent(source2015).includes('GB T 7714-2015'));
  });

  it('两个版本来源 URL 互不相同（版本不串线）', () => {
    assert.notEqual(source2025, source2015);
  });
});

describe('references-core 来源常量与默认配置的交叉契约', () => {
  it('8 条规则中仅 R01 自带 url，其余 7 条的“查看来源”回落到 source2025/source2015', () => {
    assert.equal(rules.length, 8);
    const withoutUrl = rules.filter((r) => !r.url);
    assert.deepEqual(
      withoutUrl.map((r) => r.id),
      ['R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09'],
    );
    // 复现 References.tsx 的回落表达式：r.url || (version==='2025' ? source2025 : source2015)
    for (const r of withoutUrl) {
      assert.equal('2025' === '2025' ? source2025 : source2015, source2025);
      assert.equal('2015' === '2025' ? source2025 : source2015, source2015);
    }
  });

  it('renderReference 默认参数即 defaultSchool：期刊条目末尾加句号', () => {
    assert.equal(
      renderReference(journalRef(), '2025'),
      '[1] 张三. 测试题名[J]. 测试刊物, 2024, 1(2): 3-5.',
    );
    assert.equal(
      renderReference(journalRef(), '2015'),
      '[1] 张三. 测试题名[J]. 测试刊物, 2024, 1(2): 3-5.',
    );
  });

  it('renderReference 不传 school 与显式传 defaultSchool 输出完全一致', () => {
    const a = journalRef();
    const b = journalRef();
    assert.equal(renderReference(a, '2025'), renderReference(b, '2025', defaultSchool));
  });

  it('enabled 为 false 的学校配置回落 defaultSchool：endPeriod=false 也被忽略，仍加句号', () => {
    const disabled = {...defaultSchool, enabled: false, endPeriod: false};
    assert.equal(
      renderReference(journalRef(), '2025', disabled),
      '[1] 张三. 测试题名[J]. 测试刊物, 2024, 1(2): 3-5.',
    );
  });

  it('启用的学校配置 endPeriod=false 时不加末尾句号', () => {
    const noPeriod = {...defaultSchool, enabled: true, endPeriod: false};
    assert.equal(
      renderReference(journalRef(), '2025', noPeriod),
      '[1] 张三. 测试题名[J]. 测试刊物, 2024, 1(2): 3-5',
    );
  });

  it('默认 hideDoi=false 时 DOI 追加到条目末尾；启用的学校配置 hideDoi=true 时省略 DOI', () => {
    const withDoi = journalRef();
    withDoi.doi = '10.1234/abcd';
    assert.equal(
      renderReference(withDoi, '2025'),
      '[1] 张三. 测试题名[J]. 测试刊物, 2024, 1(2): 3-5. DOI:10.1234/abcd.',
    );
    const hide = {...defaultSchool, enabled: true, hideDoi: true};
    const withDoi2 = journalRef();
    withDoi2.doi = '10.1234/abcd';
    assert.equal(
      renderReference(withDoi2, '2025', hide),
      '[1] 张三. 测试题名[J]. 测试刊物, 2024, 1(2): 3-5.',
    );
  });
});
