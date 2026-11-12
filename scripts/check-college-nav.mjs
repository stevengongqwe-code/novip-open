// NOVIP 大学生导航 · 词条校验 + 链接检查脚本
// 用法: npx tsx scripts/check-college-nav.mjs [--check-links]
//   默认只做字段校验；--check-links 追加 HTTP 探测（经环境代理）。
// 结果分级: ok(正常响应) / redirect(重定向) / restricted(需登录或访问受限) / timeout(超时) / dead(明确失效)
// 注意: 200 不代表身份/用途已核验；失败不代表用户一定打不开。身份核验以 sources 交叉核验为准。
import { NAV_ENTRIES, validateEntries } from '../src/tools/college-nav-data.ts';

const checkLinks = process.argv.includes('--check-links');

const errors = validateEntries(NAV_ENTRIES);
if (errors.length) {
  console.error('字段校验失败:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log(`字段校验通过: ${NAV_ENTRIES.length} 条目`);

const live = NAV_ENTRIES.filter((e) => e.status !== 'pending');
const pending = NAV_ENTRIES.filter((e) => e.status === 'pending');
console.log(`上线条目: ${live.length}（pending ${pending.length} 条不上线）`);
if (pending.length) pending.forEach((e) => console.log(` - pending: ${e.id} ${e.name}`));

if (!checkLinks) {
  console.log('跳过链接检查（加 --check-links 启用）');
  process.exit(0);
}

async function probe(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal });
    clearTimeout(t);
    if (res.status >= 200 && res.status < 300) return 'ok';
    if (res.status >= 300 && res.status < 400) return `redirect(${res.status})`;
    if (res.status === 401 || res.status === 403) return `restricted(${res.status})`;
    return `dead(${res.status})`;
  } catch (err) {
    clearTimeout(t);
    if (err?.name === 'AbortError') return 'timeout';
    // HEAD 可能被拒，降级 GET（仅读 headers）
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 20000);
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl2.signal });
      clearTimeout(t2);
      await res.arrayBuffer().catch(() => {});
      if (res.status >= 200 && res.status < 300) return 'ok';
      if (res.status >= 300 && res.status < 400) return `redirect(${res.status})`;
      if (res.status === 401 || res.status === 403) return `restricted(${res.status})`;
      return `dead(${res.status})`;
    } catch (err2) {
      return err2?.name === 'AbortError' ? 'timeout' : `dead(${String(err2?.message || err2).slice(0, 60)})`;
    }
  }
}

const external = live.filter((e) => /^https?:\/\//i.test(e.url));
console.log(`\n链接检查: ${external.length} 个外部 URL ...`);
const results = [];
for (const e of external) {
  const r = await probe(e.url);
  results.push({ id: e.id, name: e.name, url: e.url, result: r });
  console.log(` [${r}] ${e.name} ${e.url}`);
  await new Promise((r2) => setTimeout(r2, 800)); //  polite 间隔
}
const bad = results.filter((r) => r.result.startsWith('dead') || r.result === 'timeout');
console.log(`\n完成: ok/redirect/restricted=${results.length - bad.length}, 需人工复核=${bad.length}`);
if (bad.length) {
  console.log('需人工复核（不代表用户打不开，须结合 sources 人工判断）:');
  bad.forEach((r) => console.log(` - [${r.result}] ${r.name} ${r.url}`));
  process.exit(2);
}
