import {useEffect, useMemo, useState} from 'react';
import {tools} from '../tools/registry';
import {clearLocalUsage, readLocalUsage, type LocalUsage} from './local';

// 站点概况：只用「现在就能核实」的数据，避免整页都是“暂无数据”。
// 1) 来自仓库注册表的工具清单（构建时确定）；2) 来自 /deploy-info.json 的真实部署信息；
// 3) 来自本浏览器 localStorage 的本机使用次数。全站流量由同页的公开统计接口展示。
interface DeployInfo {
  commit?: string;
  runId?: string;
  deployedAt?: string;
}

const beijing = (value?: string) => {
  if (!value) return '未提供';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '未提供';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
};

export default function SiteFacts({apiOk, loading}: {apiOk: boolean; loading: boolean}) {
  const [deploy, setDeploy] = useState<DeployInfo | null>(null);
  const [deployError, setDeployError] = useState('');
  const [usage, setUsage] = useState<LocalUsage | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/deploy-info.json', {cache: 'no-store', credentials: 'omit'})
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: DeployInfo) => { if (active && data && typeof data === 'object') setDeploy(data); })
      .catch(() => { if (active) setDeployError('构建信息暂不可读取'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setUsage(readLocalUsage());
  }, [apiOk]);

  const facts = useMemo(() => {
    const groups = [...new Set(tools.map((tool) => tool.group))];
    const standalone = tools.filter((tool) => tool.path.startsWith('/tools/') || tool.path === '/nav');
    return {total: tools.length, groups: groups.length, standalone: standalone.length, groupsList: groups};
  }, []);

  const topTools = useMemo(() => {
    if (!usage) return [];
    return Object.entries(usage.tools)
      .map(([id, count]) => ({tool: tools.find((item) => item.id === id), count}))
      .filter((item) => !!item.tool)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [usage]);

  const localTotal = usage ? Object.values(usage.tools).reduce((sum, count) => sum + count, 0) : 0;

  return <>
    {!apiOk && !loading && <div className="analytics-error analytics-block" role="status">
      全站访问统计的服务端接口尚未接通，因此 PV / UV 卡片按真实状态显示「未接入」，不会编造数字。下面先展示可以立刻核实的站点概况和本机使用记录。
    </div>}

    <section className="analytics-card analytics-block" aria-label="站点概况">
      <div className="analytics-section-heading"><h2>站点概况（构建时确定，可核实）</h2><span className="analytics-pill">非流量统计</span></div>
      <div className="analytics-facts">
        <div className="analytics-card"><div className="label">已上线工具</div><strong>{facts.total}</strong><small>含独立页面与首页工具</small></div>
        <div className="analytics-card"><div className="label">工具分类</div><strong>{facts.groups}</strong><small>{facts.groupsList.join(' / ')}</small></div>
        <div className="analytics-card"><div className="label">可被搜索引擎收录的独立页</div><strong>{facts.standalone}</strong><small>含首页导航 /nav</small></div>
      </div>
      <p className="analytics-status">
        当前部署：{deploy ? `commit ${deploy.commit?.slice(0, 7) ?? '未知'} · 发布于 ${beijing(deploy.deployedAt)}（北京时间）` : deployError || '正在读取部署信息…'}
        {deploy?.runId ? ` · 构建 #${deploy.runId}` : ''}
      </p>
    </section>

    <section className="analytics-card analytics-block" aria-label="本机使用记录">
      <div className="analytics-section-heading"><h2>本机使用记录（只存在这台设备）</h2><span className="analytics-pill">不上传</span></div>
      {usage ? <>
        <div className="analytics-facts">
          <div className="analytics-card"><div className="label">本机累计页面浏览</div><strong>{usage.pageviews.toLocaleString('zh-CN')}</strong><small>当前浏览器 localStorage</small></div>
          <div className="analytics-card"><div className="label">本机工具使用次数</div><strong>{localTotal.toLocaleString('zh-CN')}</strong><small>点开工具即计数</small></div>
          <div className="analytics-card"><div className="label">首次记录时间</div><strong style={{fontSize:18}}>{beijing(usage.since)}</strong><small>北京时间</small></div>
        </div>
        {topTools.length > 0 ? <div className="analytics-table-wrap"><table className="analytics-table">
          <thead><tr><th>本机常用工具</th><th>次数</th></tr></thead>
          <tbody>{topTools.map(({tool, count}) => <tr key={tool!.id}><td><a href={tool!.path}>{tool!.name} ↗</a></td><td>{count}</td></tr>)}</tbody>
        </table></div> : <p className="analytics-muted">这台设备还没有打开过具体工具。打开任意工具后，这里会出现本机次数。</p>}
        <button className="analytics-btn" type="button" onClick={() => { clearLocalUsage(); setUsage(readLocalUsage()); setCleared(true); }}>
          {cleared ? '已清除本机记录' : '清除本机记录'}
        </button>
      </> : <p className="analytics-muted">正在读取本机记录…</p>}
      <p className="analytics-status">本机记录只保存在当前浏览器，不随统计接口上传，也不用于识别个人；换设备、无痕窗口或清除站点数据后归零。</p>
    </section>
  </>;
}
