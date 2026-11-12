// 材料收集助手 · 单元测试（node:test）
// 覆盖：名单解析/匹配歧义/状态计算/导出规划/ZIP 校验
// 运行：npm test（node --import tsx --test tests/*.test.ts）
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import {
  parseRosterText, buildRoster, defaultRequirements, normalizeExtList,
  normText, isUnrecognizableName, matchFiles, summarize,
  planExport, buildChecklistRows, buildManifestCsv, buildReminder,
  inspectZip, sanitizeFileName, csvCell, demoRosterEntries, demoFileDefs,
  splitName,
  type Person, type Requirement, type InFile,
} from '../src/tools/material-collector-core';

function mkFile(name: string, size = 1024, sourcePath?: string): InFile {
  const { base, ext } = splitName(name);
  return { id: `f_${name}`, name, base, ext: ext.toLowerCase(), size, sourcePath };
}
function mkPerson(name: string, code = ''): Person { return { id: `p_${name}_${code}`, name, code }; }
const REQS = (): Requirement[] => defaultRequirements();

describe('名单解析', () => {
  it('粘贴：空行跳过、"姓名 编号"拆分', () => {
    const { entries, skippedEmpty } = parseRosterText('张三 20240101\n\n李四\n  \n王五 20240103\n');
    assert.equal(skippedEmpty, 3); // 含末尾换行产生的空行
    assert.deepEqual(entries.map(e => [e.name, e.code]), [['张三', '20240101'], ['李四', ''], ['王五', '20240103']]);
  });
  it('英文名带空格："John Smith 20240101" 姓名不截断', () => {
    const { entries } = parseRosterText('John Smith 20240101');
    assert.equal(entries[0].name, 'John Smith');
    assert.equal(entries[0].code, '20240101');
  });
  it('重复姓名与同名不同编号只警告不合并', () => {
    const { entries } = parseRosterText('张伟 20240101\n张伟 20240101\n张伟 20240103\n');
    const b = buildRoster(entries);
    assert.equal(b.persons.length, 3, '三条记录全部保留');
    assert.ok(b.warnings.some(w => w.includes('出现 2 次')), '重复提示: ' + b.warnings.join('|'));
    assert.ok(b.warnings.some(w => w.includes('同名')), '同名提示: ' + b.warnings.join('|'));
    const ids = new Set(b.persons.map(p => p.id));
    assert.equal(ids.size, 3, '内部 id 唯一');
  });
  it('空名单报错且不崩溃', () => {
    const b = buildRoster(parseRosterText('\n  \n').entries);
    assert.equal(b.persons.length, 0);
    assert.ok(b.errors.length > 0);
  });
  it('扩展名列表规范化', () => {
    assert.deepEqual(normalizeExtList('JPG, .png，jpeg  pdf'), ['jpg', 'png', 'jpeg', 'pdf']);
  });
});

describe('文件名识别', () => {
  it('微信默认名/纯数字/过短 → 无法识别', () => {
    assert.ok(isUnrecognizableName('mmexport1718000000000'));
    assert.ok(isUnrecognizableName('IMG_20261022_083000'));
    assert.ok(isUnrecognizableName('12345'));
    assert.ok(isUnrecognizableName('a'));
    assert.ok(!isUnrecognizableName('张伟_报名表'));
  });
  it('normalize 去空白与大小写', () => {
    assert.equal(normText('  张 伟 '), '张伟');
  });
});

describe('自动匹配', () => {
  const persons = [mkPerson('张伟', '20240101'), mkPerson('李娜', '20240201')];
  const reqs = REQS();
  it('编号+姓名一致 → 直接分配并给出依据', () => {
    const [m] = matchFiles([mkFile('20240101_张伟_报名表.pdf', 45000)], persons, reqs);
    assert.equal(m.state, 'ok');
    assert.equal(m.personId, persons[0].id);
    assert.equal(m.reqId, reqs[0].id);
    assert.ok(m.evidence.some(e => e.includes('20240101')), m.evidence.join('|'));
  });
  it('短姓名被长姓名包含 → 待确认不误配', () => {
    const ps = [mkPerson('张伟', '20240101'), mkPerson('张伟强', '20240102')];
    const [m] = matchFiles([mkFile('张伟强-证件照.jpg', 180000)], ps, reqs);
    assert.equal(m.state, 'pending', '必须待确认，不能分给张伟');
    assert.equal(m.candidates.length, 2);
    assert.ok(m.pendingReason.includes('包含') || m.pendingReason.includes('2 人'));
  });
  it('同名两人 → 待确认', () => {
    const ps = [mkPerson('张伟', '20240101'), mkPerson('张伟', '20240103')];
    const [m] = matchFiles([mkFile('张伟_证件照.jpg', 180000)], ps, reqs);
    assert.equal(m.state, 'pending');
    assert.equal(m.candidates.length, 2);
  });
  it('文件名含两个不同人名 → 待确认', () => {
    const ps = [mkPerson('刘洋'), mkPerson('孙丽', '20240601')];
    const [m] = matchFiles([mkFile('刘洋和孙丽_合影.jpg', 500000)], ps, reqs);
    assert.equal(m.state, 'pending');
    assert.equal(m.candidates.length, 2);
  });
  it('编号与姓名指向不同人 → 待确认', () => {
    const [m] = matchFiles([mkFile('20240101_李娜_报名表.pdf', 45000)], persons, reqs);
    assert.equal(m.state, 'pending');
    assert.ok(m.pendingReason.includes('不同人员'));
  });
  it('微信默认名/纯数字 → 未分配', () => {
    const ms = matchFiles([mkFile('mmexport1718000000000.jpg', 200000), mkFile('12345.jpg', 100000)], persons, reqs);
    assert.ok(ms.every(m => m.state === 'unassigned'));
  });
  it('同一扩展名对应多个材料 → 关键词可区分则分配，否则待确认', () => {
    const [byKw] = matchFiles([mkFile('李娜学生证.png', 300000)], persons, reqs);
    assert.equal(byKw.state, 'ok');
    assert.equal(byKw.reqId, reqs[2].id, '关键词"学生证"指向学生证明');
    const [amb] = matchFiles([mkFile('20240201.pdf', 50000)], persons, reqs);
    assert.equal(amb.state, 'pending');
    assert.ok(amb.pendingReason.includes('材料类型待确认'));
    assert.equal(amb.personId, persons[1].id, '人员已确定，只待确认材料类型');
  });
  it('同一人同一材料多版本 → 冲突待确认', () => {
    const ms = matchFiles([mkFile('李娜_报名表.pdf', 40000), mkFile('李娜_报名表_v2.pdf', 41000)], persons, reqs);
    assert.ok(ms.every(m => m.state === 'pending'));
    assert.ok(ms[0].pendingReason.includes('2 个版本'));
  });
  it('扩展名不符 / 超大小 → 规则异常并说明原因', () => {
    const [m1] = matchFiles([mkFile('李娜_报名表.txt', 12000)], persons, reqs);
    assert.equal(m1.state, 'ok');
    assert.ok(m1.issues.some(i => i.includes('.txt')), m1.issues.join('|'));
    const [m2] = matchFiles([mkFile('李娜_证件照.jpg', 3 * 1024 * 1024)], persons, reqs);
    assert.ok(m2.issues.some(i => i.includes('超过')), m2.issues.join('|'));
  });
  it('人工覆盖：指定人员/材料、忽略', () => {
    const f = mkFile('mmexport999.jpg', 100000);
    const [m1] = matchFiles([f], persons, reqs, { [f.id]: { personId: persons[1].id, reqId: reqs[1].id } });
    assert.equal(m1.state, 'ok');
    assert.equal(m1.personId, persons[1].id);
    assert.ok(m1.manual);
    const [m2] = matchFiles([f], persons, reqs, { [f.id]: { ignored: true } });
    assert.equal(m2.state, 'ignored');
  });
  it('空文件列表不崩溃', () => {
    assert.deepEqual(matchFiles([], persons, reqs), []);
  });
});

describe('状态核对', () => {
  const persons = [mkPerson('张伟', '20240101'), mkPerson('李娜', '20240201'), mkPerson('王五')];
  const reqs = REQS();
  const files = [
    mkFile('20240101_张伟_报名表.pdf', 45000),
    mkFile('张伟_证件照.jpg', 180000),
    mkFile('20240201_李娜_报名表.pdf', 45000),
    mkFile('李娜_证件照.jpg', 3 * 1024 * 1024), // 超限 → 规则异常
    mkFile('mmexport1.jpg', 100000),            // 未分配
  ];
  it('齐全/缺材料/规则异常/待确认统计正确，选交不导致缺交', () => {
    const matches = matchFiles(files, persons, reqs);
    const s = summarize(persons, reqs, files, matches);
    assert.equal(s.total, 3);
    assert.equal(s.complete, 1, '张伟齐全（选交学生证明缺失不影响）');
    assert.equal(s.error, 1, '李娜证件照超限 → 规则异常');
    assert.equal(s.missing, 1, '王五缺必交');
    assert.equal(s.unassignedFiles, 1);
    const li = s.reports.find(r => r.person.name === '李娜')!;
    assert.equal(li.state, 'error');
    const wang = s.reports.find(r => r.person.name === '王五')!;
    assert.deepEqual(wang.missing, ['报名表', '证件照']);
  });
  it('待确认文件不计入齐全', () => {
    const ps = [mkPerson('张伟', '20240101'), mkPerson('张伟强', '20240102')];
    const fs = [mkFile('张伟强-证件照.jpg', 180000)];
    const s = summarize(ps, reqs, fs, matchFiles(fs, ps, reqs));
    assert.equal(s.pending, 2, '两人都因待确认文件处于待确认状态');
    assert.equal(s.complete, 0);
    assert.equal(s.pendingFiles, 1);
  });
});

describe('导出规划', () => {
  const persons = [mkPerson('张伟', '20240101'), mkPerson('张伟', '20240103'), mkPerson('李娜', '20240201')];
  const reqs = REQS();
  const files = [
    mkFile('20240101_张伟_报名表.pdf', 45000),
    mkFile('20240103_张伟_证件照.jpg', 180000),
    mkFile('mmexport1.jpg', 100000),
    mkFile('李娜/报名表?.pdf', 45000), // 非法字符
  ];
  it('同名人员文件夹可区分；未分配不丢失；非法字符清理', () => {
    const matches = matchFiles(files, persons, reqs);
    const { entries, warnings } = planExport(persons, reqs, files, matches);
    assert.equal(entries.length, 4);
    const paths = entries.map(e => e.exportPath);
    assert.ok(paths.some(p => p.includes('张伟_20240101')), paths.join('|'));
    assert.ok(paths.some(p => p.includes('张伟_20240103')), paths.join('|'));
    assert.ok(paths.some(p => p.startsWith('_未分配/')), paths.join('|'));
    assert.ok(paths.every(p => !/[?*]/.test(p)), '非法字符已清理');
    void warnings;
  });
  it('导出重名加后缀不覆盖', () => {
    const ps = [mkPerson('李娜', '20240201')];
    const fs = [mkFile('李娜_报名表.pdf', 45000), mkFile('李娜_报名表.pdf', 45000)];
    fs[1].id = 'f_dup';
    const { entries } = planExport(ps, reqs, fs, matchFiles(fs, ps, reqs));
    const paths = entries.map(e => e.exportPath.toLowerCase());
    assert.equal(new Set(paths).size, 2, '两个导出路径不同');
    assert.ok(entries.some(e => /_2\.pdf$/i.test(e.exportPath)), entries.map(e => e.exportPath).join('|'));
  });
  it('核对表行数=人数+表头，状态与汇总一致', () => {
    const ps = [mkPerson('张伟', '20240101'), mkPerson('王五')];
    const fs = [mkFile('20240101_张伟_报名表.pdf', 45000), mkFile('张伟_证件照.jpg', 180000)];
    const s = summarize(ps, reqs, fs, matchFiles(fs, ps, reqs));
    const rows = buildChecklistRows(s.reports, reqs);
    assert.equal(rows.length, 3);
    assert.equal(rows[1][2], '齐全');
    assert.equal(rows[2][2], '缺材料');
    assert.ok(rows[1][0] === '张伟' && rows[2][0] === '王五');
  });
  it('清单 CSV 防公式注入', () => {
    const csv = buildManifestCsv([{
      fileId: '1', originalName: '=cmd|calc', sourcePath: '', exportPath: 'a/=cmd|calc',
      personLabel: '', reqLabel: '', state: '未分配', note: '',
    }]);
    assert.ok(csv.includes('"\'=cmd|calc"'), csv);
  });
  it('缺交提醒文案只含文字', () => {
    const ps = [mkPerson('张伟', '20240101'), mkPerson('李娜', '20240201')];
    const fs = [mkFile('20240101_张伟_报名表.pdf', 45000)];
    const s = summarize(ps, reqs, fs, matchFiles(fs, ps, reqs));
    const text = buildReminder(s.reports);
    assert.ok(text.includes('张伟') && text.includes('证件照'), text);
    assert.ok(!text.includes('http'), '不含链接');
    const allOk = summarize(ps, reqs, [
      mkFile('20240101_张伟_报名表.pdf', 45000), mkFile('张伟_证件照.jpg', 180000),
      mkFile('20240201_李娜_报名表.pdf', 45000), mkFile('李娜_证件照.jpg', 180000),
    ], matchFiles([
      mkFile('20240101_张伟_报名表.pdf', 45000), mkFile('张伟_证件照.jpg', 180000),
      mkFile('20240201_李娜_报名表.pdf', 45000), mkFile('李娜_证件照.jpg', 180000),
    ], ps, reqs));
    assert.ok(buildReminder(allOk.reports).includes('全部收齐'));
  });
  it('sanitize 处理保留字/超长/空名', () => {
    assert.equal(sanitizeFileName('con').name, 'con_');
    assert.ok(sanitizeFileName('a'.repeat(200)).name.length <= 120);
    assert.equal(sanitizeFileName('').name, '未命名文件');
  });
});

describe('ZIP 安全校验', () => {
  it('正常 ZIP：中文名、嵌套 ZIP 标记、系统文件忽略', () => {
    const bytes = zipSync({
      '张伟/报名表.pdf': new Uint8Array([1, 2, 3]),
      '证件照_李娜.jpg': new Uint8Array([4, 5]),
      'nested.zip': new Uint8Array([0x50, 0x4b, 3, 4]),
      '__MACOSX/._x': new Uint8Array([9]),
      '.DS_Store': new Uint8Array([9]),
    });
    const r = inspectZip(bytes);
    assert.equal(r.entries.length, 3);
    assert.ok(r.entries.some(e => e.name === '张伟/报名表.pdf'));
    assert.deepEqual(r.nestedZips, ['nested.zip']);
    assert.equal(r.ignored.length, 2);
  });
  it('损坏/非 ZIP 明确报错', () => {
    assert.throws(() => inspectZip(new Uint8Array(100)), /中央目录缺失|不是有效/);
    assert.throws(() => inspectZip(new Uint8Array([1, 2, 3])), /太小/);
  });
  it('危险路径拒绝', () => {
    const bytes = zipSync({ '../evil.txt': new Uint8Array([1]) });
    assert.throws(() => inspectZip(bytes), /不安全/);
  });
  it('加密 ZIP 明确报错（不表现为成功）', () => {
    const raw = zipSync({ 'a.txt': new Uint8Array([1, 2, 3]) });
    const out = raw.slice();
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    let flipped = false;
    for (let i = 0; i < out.length - 46; i++) {
      if (v.getUint32(i, true) === 0x02014b50) { v.setUint16(i + 8, v.getUint16(i + 8, true) | 1, true); flipped = true; break; }
    }
    assert.ok(flipped, '测试前置：应能找到中央目录头');
    assert.throws(() => inspectZip(out), /加密/);
  });
});

describe('演示数据自检', () => {
  const reqs = REQS();
  it('演示名单+文件能走通完整闭环', () => {
    const built = buildRoster(demoRosterEntries());
    assert.equal(built.persons.length, 12);
    assert.ok(built.warnings.some(w => w.includes('同名')), '演示含同名');
    const files = demoFileDefs().map((d, i) => ({ ...mkFile(d.name, d.size), id: `demo_${i}` }));
    const matches = matchFiles(files, built.persons, reqs);
    const s = summarize(built.persons, reqs, files, matches);
    assert.ok(s.pendingFiles >= 4, `演示应有多个待确认，实际 ${s.pendingFiles}`);
    assert.ok(s.unassignedFiles >= 2, `演示应有未分配，实际 ${s.unassignedFiles}`);
    assert.ok(s.error >= 1, '演示应有规则异常');
    const { entries } = planExport(built.persons, reqs, files, matches);
    assert.equal(entries.length, files.length, '无文件丢失');
    const rows = buildChecklistRows(s.reports, reqs);
    assert.equal(rows.length, 13);
  });
});
