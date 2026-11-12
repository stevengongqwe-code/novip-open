/**
 * 随机分组与点名抽签（Factory Day 5，2026-10-31）。
 * 同一份名单、同一页完成三种公平抽取：随机点名、随机分组、随机排序。
 * 纯浏览器本地处理：名单不上传、不存 localStorage，刷新即失；
 * 结果由 crypto 随机数决定，页面无转盘动画。
 */
import { useMemo, useState } from 'react';
import { copyLocal, saveLocal } from '../tool-common';
import { ToolPage } from './common';
import {
  dateSuffix,
  groupsToCsv,
  groupsToText,
  makeGroups,
  parseNames,
  pickResultText,
  pickWithoutReplacement,
  randomOrder,
} from './random-pick-core';

const SAMPLE = '陈晨\n林晓\n王磊\n赵雨\n刘洋\n张萌\n李想\n周子涵';

type Mode = 'pick' | 'group' | 'order';

const MODE_LABELS: Record<Mode, string> = {
  pick: '随机点名',
  group: '随机分组',
  order: '随机排序',
};

export default function RandomPick() {
  const [mode, setMode] = useState<Mode>('pick');
  const [input, setInput] = useState('');
  const [pickCount, setPickCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(true);
  const [pool, setPool] = useState<string[] | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState<'byCount' | 'bySize'>('byCount');
  const [groupValue, setGroupValue] = useState(4);
  const [groups, setGroups] = useState<string[][] | null>(null);
  const [ordered, setOrdered] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const parsed = useMemo(() => parseNames(input), [input]);
  const activePool = pool ?? parsed.names;

  const resetRound = () => {
    setPool(null);
    setHistory([]);
    setStatus('已重置：全部名单回到抽取池。');
  };

  const runPick = () => {
    try {
      setError('');
      const source = noRepeat ? activePool : parsed.names;
      if (source.length < 1) throw new Error('请先在上方粘贴名单，每行一人。');
      const { picked, remaining } = pickWithoutReplacement(source, pickCount);
      const label = `${new Date().toLocaleTimeString()} 抽中：${pickResultText(picked)}`;
      setHistory((h) => [label, ...h].slice(0, 50));
      if (noRepeat) {
        setPool(remaining);
        setStatus(remaining.length === 0 ? '本轮已抽完所有人，点「重置本轮」开始新一轮。' : `已抽中 ${picked.length} 人，池子里还剩 ${remaining.length} 人。`);
      } else {
        setStatus(`已抽中：${pickResultText(picked)}（可重复模式，名单未移出池子）。`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '抽取失败，请检查名单与人数。');
    }
  };

  const runGroup = () => {
    try {
      setError('');
      const result = makeGroups(parsed.names, { mode: groupMode, value: groupValue });
      setGroups(result);
      setStatus(`已分成 ${result.length} 组，每组 ${result.map((g) => g.length).join(' / ')} 人，组间人数差至多 1 人。`);
    } catch (e) {
      setGroups(null);
      setError(e instanceof Error ? e.message : '分组失败，请检查名单与组数。');
    }
  };

  const runOrder = () => {
    try {
      setError('');
      setOrdered(randomOrder(parsed.names));
      setStatus('已生成随机顺序，可直接用作演讲、答辩或值日顺序。');
    } catch (e) {
      setOrdered(null);
      setError(e instanceof Error ? e.message : '排序失败，请检查名单。');
    }
  };

  const downloadText = (text: string, name: string, type: string) => {
    saveLocal(new Blob([text], { type }), name);
  };

  return (
    <ToolPage
      id="random-pick"
      title="随机分组与点名抽签"
      description="班委、课代表、社团负责人粘贴一份名单，就能在同一页完成公平点名、随机分组、随机排序；全部在浏览器本地算完，不上传、不登录、无次数限制。"
    >
      <div className="study-actions" role="tablist" aria-label="随机抽取功能">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            className={`study-btn${mode === m ? '' : ' alt'}`}
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(''); setStatus(''); }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <section className="study-card">
        <h2>1 粘贴名单</h2>
        <p>每行一人，也支持逗号、分号、顿号分隔。名单只在当前浏览器里处理，不上传、不保存，刷新页面即清空。</p>
        <textarea
          aria-label="名单输入"
          rows={8}
          value={input}
          onChange={(e) => { setInput(e.target.value); setPool(null); }}
          placeholder={'例如：\n陈晨\n林晓\n王磊'}
        />
        <div className="study-actions">
          <button className="study-btn alt" onClick={() => { setInput(SAMPLE); setPool(null); }}>填入示例名单</button>
          <button className="study-btn alt" onClick={() => { setInput(''); setPool(null); setHistory([]); setGroups(null); setOrdered(null); }}>清空名单</button>
        </div>
        <p>有效人数：{parsed.names.length} 人{parsed.duplicates.length > 0 ? `；注意：${parsed.duplicates.join('、')} 出现多次，会按多条计入抽取池。` : ''}</p>
        {mode === 'pick' && noRepeat && pool !== null && (
          <p>本轮剩余：{activePool.length} 人（已抽中的人已移出本轮池子）。</p>
        )}
      </section>

      {mode === 'pick' && (
        <section className="study-card">
          <h2>2 随机点名</h2>
          <label>
            一次抽几人
            <input
              type="number"
              min={1}
              value={pickCount}
              onChange={(e) => setPickCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </label>
          <label>
            <input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat(e.target.checked)} />
            不重复轮次：抽中的人移出本轮池子，轮完所有人再重置
          </label>
          <div className="study-actions">
            <button className="study-btn" onClick={runPick}>开始抽取</button>
            <button className="study-btn alt" onClick={resetRound}>重置本轮</button>
          </div>
          {history.length > 0 && (
            <>
              <h3>抽取记录（最新在前，最多保留 50 条）</h3>
              <ul>
                {history.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
              <div className="study-actions">
                <button className="study-btn alt" onClick={() => copyLocal(history.join('\n'))}>复制记录</button>
                <button className="study-btn alt" onClick={() => setHistory([])}>清空记录</button>
              </div>
            </>
          )}
        </section>
      )}

      {mode === 'group' && (
        <section className="study-card">
          <h2>2 随机分组</h2>
          <div className="study-actions" role="radiogroup" aria-label="分组方式">
            <button className={`study-btn${groupMode === 'byCount' ? '' : ' alt'}`} onClick={() => setGroupMode('byCount')}>按组数分</button>
            <button className={`study-btn${groupMode === 'bySize' ? '' : ' alt'}`} onClick={() => setGroupMode('bySize')}>按每组人数分</button>
          </div>
          <label>
            {groupMode === 'byCount' ? '分成几组' : '每组几人'}
            <input
              type="number"
              min={1}
              value={groupValue}
              onChange={(e) => setGroupValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </label>
          <div className="study-actions">
            <button className="study-btn" onClick={runGroup}>开始分组</button>
            {groups && (
              <>
                <button className="study-btn alt" onClick={() => copyLocal(groupsToText(groups))}>复制全部分组</button>
                <button className="study-btn alt" onClick={() => downloadText(groupsToCsv(groups), `novip-random-groups-${dateSuffix()}.csv`, 'text/csv;charset=utf-8')}>下载 CSV</button>
              </>
            )}
          </div>
          {groups && groups.map((g, i) => (
            <div key={i}>
              <h3>第{i + 1}组（{g.length}人）</h3>
              <p>{g.join('、')}</p>
              <button className="study-btn alt" onClick={() => copyLocal(`第${i + 1}组：${g.join('、')}`)}>复制本组</button>
            </div>
          ))}
        </section>
      )}

      {mode === 'order' && (
        <section className="study-card">
          <h2>2 随机排序</h2>
          <p>整份名单洗牌后输出带序号的顺序，适合演讲、答辩、值日排班。</p>
          <div className="study-actions">
            <button className="study-btn" onClick={runOrder}>生成随机顺序</button>
            {ordered && (
              <button className="study-btn alt" onClick={() => copyLocal(ordered.map((n, i) => `${i + 1}. ${n}`).join('\n'))}>复制顺序</button>
            )}
          </div>
          {ordered && (
            <ol>
              {ordered.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          )}
        </section>
      )}

      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      <p>公平说明：洗牌用 Fisher-Yates 算法，随机数取自浏览器 crypto 安全随机源；结果由随机数决定，本页没有转盘动画，也不对结果做任何人工干预。</p>
    </ToolPage>
  );
}
