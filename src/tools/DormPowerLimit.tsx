import React, {useState, useMemo} from 'react';
import {ToolPage, copyLocal} from './common';
import {
  APPLIANCE_PRESETS,
  COMMON_LIMITS_W,
  VOLTAGE_V,
  checkPowerLimits,
  describeStatus,
  sampleAppliances,
  type DormAppliance,
  type PowerLimitInput,
} from './dorm-power-limit-core';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import './dorm-power-limit.css';

const TOOL_ID = 'dorm-power-limit';

function newId() {
  return `ap-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export default function DormPowerLimit() {
  const [singleLimitW, setSingleLimitW] = useState<number>(500);
  const [singleUnlimited, setSingleUnlimited] = useState<boolean>(false);
  const [totalLimitW, setTotalLimitW] = useState<number>(800);
  const [appliances, setAppliances] = useState<DormAppliance[]>(() => sampleAppliances());
  const [copied, setCopied] = useState<boolean>(false);

  const input: PowerLimitInput = useMemo(
    () => ({
      singleLimitW: singleUnlimited ? 0 : singleLimitW,
      totalLimitW,
      voltageV: VOLTAGE_V,
      appliances,
    }),
    [singleLimitW, singleUnlimited, totalLimitW, appliances],
  );

  const result = useMemo(() => checkPowerLimits(input), [input]);
  const headroomW = Math.max(0, totalLimitW - result.totalWatts);
  // 展示用真实占用率（超限时可 >100%，如 112%）；进度条宽度仍截断 100%。
  const usagePctReal = Math.round(result.usageRatio * 100);
  const usagePct = Math.min(100, usagePctReal);

  const handleAddPreset = (name: string, watts: number) => {
    playHoverTick(readStoredSoundEnabled());
    setAppliances((prev) => [...prev, {id: newId(), name, watts, quantity: 1, on: true}]);
  };

  const handleUpdate = (id: string, field: 'name' | 'watts' | 'quantity' | 'on', value: string | number | boolean) => {
    setAppliances((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        if (field === 'name') return {...a, name: String(value)};
        if (field === 'on') return {...a, on: Boolean(value)};
        if (field === 'watts') return {...a, watts: Math.max(0, Math.floor(Number(value)) || 0)};
        return {...a, quantity: Math.min(9, Math.max(1, Math.floor(Number(value)) || 1))};
      }),
    );
  };

  const handleRemove = (id: string) => {
    playHoverTick(readStoredSoundEnabled());
    setAppliances((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSample = () => {
    playHoverTick(readStoredSoundEnabled());
    setSingleLimitW(500);
    setSingleUnlimited(false);
    setTotalLimitW(800);
    setAppliances(sampleAppliances());
  };

  const handleCopy = async () => {
    playHoverTick(readStoredSoundEnabled());
    await copyLocal(result.summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  const statusClass =
    result.status === 'over' ? 'dorm-pl-status-over' : result.status === 'near' ? 'dorm-pl-status-near' : 'dorm-pl-status-safe';

  return (
    <ToolPage
      id={TOOL_ID}
      title="宿舍限电功率计算器"
      description="开学买电器、跳闸之后，先算清楚“这些电器能不能同时开”：填入本校单台限功率与宿舍总功率上限，勾选在用电器，离线校验会不会跳闸，并告诉你去掉哪一件就安全。"
    >
      <div className="dorm-pl-container">
        {/* 限值设置 */}
        <section className="dorm-pl-card" aria-label="宿舍限值设置">
          <h3 style={{fontSize: 15, fontWeight: 700, margin: '0 0 12px 0'}}>第一步：填入本校限值</h3>
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
            <div style={{flex: 1, minWidth: 200}}>
              <label style={{fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6}}>
                宿舍总功率上限（W）*
              </label>
              <input
                type="number"
                min="0"
                value={totalLimitW}
                onChange={(e) => setTotalLimitW(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={{width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1'}}
              />
              <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8}}>
                {COMMON_LIMITS_W.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className="dorm-pl-chip"
                    onClick={() => setTotalLimitW(w)}
                    aria-pressed={totalLimitW === w}
                  >
                    {w}W
                  </button>
                ))}
              </div>
            </div>
            <div style={{flex: 1, minWidth: 200}}>
              <label style={{fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6}}>
                单台电器限功率（W）
              </label>
              <input
                type="number"
                min="0"
                disabled={singleUnlimited}
                value={singleLimitW}
                onChange={(e) => setSingleLimitW(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={{width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1'}}
              />
              <label style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: '#475569'}}>
                <input
                  type="checkbox"
                  checked={singleUnlimited}
                  onChange={(e) => setSingleUnlimited(e.target.checked)}
                />
                不知道单台限值（只校验总功率）
              </label>
            </div>
          </div>
          <p style={{fontSize: 12.5, color: '#64748b', margin: '12px 0 0 0', lineHeight: 1.6}}>
            各校标准不统一（常见 200W–2000W），以本校《学生公寓管理规定》或宿舍楼公告为准；不知道就先问宿管。中国市电按 220V 换算电流。
          </p>
        </section>

        {/* 在用电器 */}
        <section className="dorm-pl-card" aria-label="在用电器">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <h3 style={{fontSize: 15, fontWeight: 700, margin: 0}}>第二步：勾选同时使用的电器</h3>
            <button type="button" className="button secondary" style={{padding: '6px 12px', fontSize: 12.5}} onClick={handleSample}>
              填入示例
            </button>
          </div>
          <div style={{marginBottom: 12}}>
            <div style={{fontSize: 12.5, fontWeight: 600, color: '#64748b', marginBottom: 6}}>发热大功率（点一下加入）</div>
            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
              {APPLIANCE_PRESETS.filter((p) => p.category === '发热大功率').map((p) => (
                <button key={p.name} type="button" className="dorm-pl-chip" onClick={() => handleAddPreset(p.name, p.watts)}>
                  + {p.name} {p.watts}W
                </button>
              ))}
            </div>
            <div style={{fontSize: 12.5, fontWeight: 600, color: '#64748b', margin: '10px 0 6px 0'}}>常用小功率（点一下加入）</div>
            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
              {APPLIANCE_PRESETS.filter((p) => p.category === '常用小功率').map((p) => (
                <button key={p.name} type="button" className="dorm-pl-chip" onClick={() => handleAddPreset(p.name, p.watts)}>
                  + {p.name} {p.watts}W
                </button>
              ))}
            </div>
          </div>
          {appliances.length === 0 ? (
            <p style={{fontSize: 13.5, color: '#64748b'}}>还没加电器：点上面的预设加入，或先点"填入示例"试一遍。</p>
          ) : (
            appliances.map((a) => (
              <div key={a.id} className="dorm-pl-row">
                <input
                  type="checkbox"
                  checked={a.on}
                  onChange={(e) => handleUpdate(a.id, 'on', e.target.checked)}
                  title="是否同时使用"
                  aria-label={`${a.name}是否同时使用`}
                />
                <input
                  type="text"
                  value={a.name}
                  onChange={(e) => handleUpdate(a.id, 'name', e.target.value)}
                  style={{width: 150, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 600, fontSize: 13}}
                  aria-label="电器名称"
                />
                <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                  <input
                    type="number"
                    min="0"
                    value={a.watts}
                    onChange={(e) => handleUpdate(a.id, 'watts', e.target.value)}
                    className="dorm-pl-input-sm"
                    aria-label="额定功率（瓦）"
                  />
                  <span style={{fontSize: 12, color: '#64748b'}}>W</span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                  <button type="button" className="dorm-pl-step" onClick={() => handleUpdate(a.id, 'quantity', a.quantity - 1)} aria-label="减少一台">−</button>
                  <span style={{fontSize: 13, minWidth: 28, textAlign: 'center'}}>{a.quantity} 台</span>
                  <button type="button" className="dorm-pl-step" onClick={() => handleUpdate(a.id, 'quantity', a.quantity + 1)} aria-label="增加一台">＋</button>
                </div>
                <span style={{fontSize: 13, fontWeight: 700, minWidth: 64, textAlign: 'right'}}>
                  {a.on ? `${a.watts * a.quantity}W` : '未使用'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  style={{marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#b51b41', fontSize: 13}}
                  title="移除"
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <p style={{fontSize: 12.5, color: '#64748b', margin: '10px 0 0 0', lineHeight: 1.6}}>
            预设功率为常见额定功率范围的中位值，请以电器铭牌为准；多档电器（如吹风机）请按实际使用的档位改功率。
          </p>
        </section>

        {/* 校验结果 */}
        <section className="dorm-pl-card" aria-label="校验结果">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <h3 style={{fontSize: 15, fontWeight: 700, margin: 0}}>校验结果</h3>
            <button type="button" className="button primary" style={{padding: '8px 16px', fontSize: 13}} onClick={handleCopy} disabled={!result.valid}>
              {copied ? '已复制清单 ✓' : '复制清单'}
            </button>
          </div>
          {!result.valid ? (
            <p style={{fontSize: 13.5, color: '#b45309'}}>请先填写宿舍总功率上限（大于 0 的瓦数）。</p>
          ) : (
            <>
              <div className={`dorm-pl-status ${statusClass}`} role="status">
                {result.status === 'over'
                  ? `⚠️ 会跳闸：总功率 ${result.totalWatts}W${result.overTotalWatts > 0 ? `，超过上限 ${result.overTotalWatts}W` : ''}${result.overSingle.length > 0 ? '，且有电器超过单台限值' : ''}`
                  : result.status === 'near'
                    ? `⚠️ 接近上限：总功率 ${result.totalWatts}W，已占上限 ${usagePctReal}%`
                    : `✓ 安全：总功率 ${result.totalWatts}W，占上限 ${usagePctReal}%`}
              </div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12}}>
                <div className="dorm-pl-stat"><div className="dorm-pl-stat-label">总功率</div><div className="dorm-pl-stat-value">{result.totalWatts}W</div></div>
                <div className="dorm-pl-stat"><div className="dorm-pl-stat-label">总电流（220V）</div><div className="dorm-pl-stat-value">{result.totalCurrentA}A</div></div>
                <div className="dorm-pl-stat"><div className="dorm-pl-stat-label">占用率</div><div className="dorm-pl-stat-value">{usagePctReal}%</div></div>
                <div className="dorm-pl-stat"><div className="dorm-pl-stat-label">距上限还剩</div><div className="dorm-pl-stat-value">{headroomW}W</div></div>
              </div>
              <div className="dorm-pl-bar" aria-label={`占用率 ${usagePct}%`}>
                <div className={`dorm-pl-bar-fill ${statusClass}`} style={{width: `${usagePct}%`}} />
              </div>
              {result.overSingle.length > 0 && (
                <div className="dorm-pl-warn">
                  <h4 style={{fontSize: 13.5, fontWeight: 700, margin: '0 0 6px 0'}}>超过单台限值的电器：</h4>
                  {result.overSingle.map((c) => (
                    <div key={c.id} style={{fontSize: 13.5, lineHeight: 1.6}}>
                      • {c.name}：单台 {c.watts}W，超过单台限值 {singleLimitW}W
                    </div>
                  ))}
                </div>
              )}
              {result.status === 'over' && (
                <div className="dorm-pl-advice">
                  <h4 style={{fontSize: 13.5, fontWeight: 700, margin: '0 0 6px 0'}}>💡 去掉一件就安全（改动最小的在前）：</h4>
                  {result.removals.length > 0 ? (
                    result.removals.map((r) => (
                      <div key={r.id} style={{fontSize: 13.5, lineHeight: 1.6}}>
                        • 关掉{r.name}（减少 {r.removedWatts}W），总功率降至 {r.afterTotalW}W
                      </div>
                    ))
                  ) : (
                    <div style={{fontSize: 13.5, lineHeight: 1.6}}>去掉一件仍超限，请分开使用或减少在用电器。</div>
                  )}
                  <div style={{fontSize: 13.5, lineHeight: 1.6, marginTop: 4}}>也可以分开使用：大功率电器不要同时开。</div>
                </div>
              )}
              {result.status === 'near' && (
                <p style={{fontSize: 13.5, color: '#92400e', margin: '12px 0 0 0'}}>
                  已接近上限，再开一件大功率电器可能跳闸，请分开使用。
                </p>
              )}
            </>
          )}
          <p style={{fontSize: 12.5, color: '#64748b', margin: '16px 0 0 0', lineHeight: 1.7, borderTop: '1px dashed #e2e8f0', paddingTop: 12}}>
            免责：本工具为估算参考，不构成用电安全承诺；功率以电器铭牌为准，预设值为常见范围；学校禁用的电器（如部分学校禁吹风机、电热水壶）即使功率不超限也须遵守校规；不鼓励使用违禁电器。宿舍线路老化、插线板额定电流等不在本工具校验范围内。
          </p>
        </section>
      </div>
    </ToolPage>
  );
}
