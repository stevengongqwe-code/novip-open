import React, {useState, useMemo} from 'react';
import {ToolPage, copyLocal} from './common';
import {
  calculateDormPower,
  type DormMember,
  type DormPowerInput,
} from './dorm-power-core';
import {playHoverTick, readStoredSoundEnabled} from '../immersive/soundEngine';
import './dorm-power.css';

const TOOL_ID = 'dorm-power';

const DEFAULT_MEMBERS: DormMember[] = [
  {id: '1', name: '室友A (寝室长)', stayDays: 30, prepaidAmount: 200},
  {id: '2', name: '室友B', stayDays: 30, prepaidAmount: 0},
  {id: '3', name: '室友C', stayDays: 20, prepaidAmount: 0},
  {id: '4', name: '室友D', stayDays: 15, prepaidAmount: 0},
];

export default function DormPower() {
  const [totalBill, setTotalBill] = useState<number>(200);
  const [billingDays, setBillingDays] = useState<number>(30);
  const [members, setMembers] = useState<DormMember[]>(DEFAULT_MEMBERS);
  const [copied, setCopied] = useState<boolean>(false);

  const input: DormPowerInput = useMemo(
    () => ({
      totalBill,
      billingDays,
      members,
    }),
    [totalBill, billingDays, members],
  );

  const result = useMemo(() => calculateDormPower(input), [input]);

  const handleUpdateMember = (id: string, field: 'name' | 'stayDays' | 'prepaidAmount', value: string | number) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          [field]: field === 'name' ? String(value) : Math.max(0, parseFloat(String(value)) || 0),
        };
      })
    );
  };

  const handleAddMember = () => {
    playHoverTick(readStoredSoundEnabled());
    const newId = String(Date.now());
    setMembers((prev) => [
      ...prev,
      {id: newId, name: `室友${prev.length + 1}`, stayDays: billingDays, prepaidAmount: 0},
    ]);
  };

  const handleRemoveMember = (id: string) => {
    if (members.length <= 2) return;
    playHoverTick(readStoredSoundEnabled());
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCopyText = async () => {
    playHoverTick(readStoredSoundEnabled());
    await copyLocal(result.dormGroupText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  return (
    <ToolPage
      id={TOOL_ID}
      title="宿舍电费分摊与阶梯均摊计算器"
      description="解决合租寝室4/6人交电费痛点：支持实际在寝天数加权、垫付自动冲抵，一键生成宿舍微信群公示账单与极简转账清单。"
    >
      <div className="dorm-power-container">
        {/* Bill Overview Card */}
        <section className="dorm-power-card" aria-label="账单基本信息">
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
            <div style={{flex: 1, minWidth: 160}}>
              <label style={{fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6}}>
                本期电费总额 (元)
              </label>
              <input
                type="number"
                min="0"
                value={totalBill}
                onChange={(e) => setTotalBill(parseFloat(e.target.value) || 0)}
                style={{width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1'}}
              />
            </div>

            <div style={{flex: 1, minWidth: 160}}>
              <label style={{fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6}}>
                账单涵盖周期天数 (天)
              </label>
              <input
                type="number"
                min="1"
                value={billingDays}
                onChange={(e) => setBillingDays(parseInt(e.target.value, 10) || 1)}
                style={{width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1'}}
              />
            </div>
          </div>
        </section>

        {/* Members Management Card */}
        <section className="dorm-power-card" aria-label="室友出勤与垫付列表">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
            <h3 style={{fontSize: 15, fontWeight: 700, margin: 0}}>寝室成员出勤与垫付明细</h3>
            <button
              type="button"
              className="button secondary"
              style={{padding: '6px 12px', fontSize: 12.5}}
              onClick={handleAddMember}
            >
              + 添加室友
            </button>
          </div>

          <div>
            {members.map((m) => (
              <div key={m.id} className="dorm-member-row">
                <input
                  type="text"
                  className="dorm-member-name dorm-input-sm"
                  value={m.name}
                  onChange={(e) => handleUpdateMember(m.id, 'name', e.target.value)}
                  placeholder="室友姓名"
                  style={{width: 120}}
                />

                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <span style={{fontSize: 12, color: '#64748b'}}>在寝天数:</span>
                  <input
                    type="number"
                    min="0"
                    max={billingDays}
                    className="dorm-input-sm"
                    value={m.stayDays}
                    onChange={(e) => handleUpdateMember(m.id, 'stayDays', e.target.value)}
                  />
                  <span style={{fontSize: 12, color: '#64748b'}}>天</span>
                </div>

                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <span style={{fontSize: 12, color: '#64748b'}}>已垫付:</span>
                  <input
                    type="number"
                    min="0"
                    className="dorm-input-sm"
                    value={m.prepaidAmount}
                    onChange={(e) => handleUpdateMember(m.id, 'prepaidAmount', e.target.value)}
                  />
                  <span style={{fontSize: 12, color: '#64748b'}}>元</span>
                </div>

                {members.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m.id)}
                    style={{marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#f43f5e', fontSize: 13}}
                    title="移除"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Settlement Results */}
        <section className="dorm-power-card" aria-label="结算与转账清单">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <h3 style={{fontSize: 15, fontWeight: 700, margin: 0}}>⚡ 结算清单与应转账账务</h3>
            <button
              type="button"
              className="button primary"
              style={{padding: '8px 16px', fontSize: 13}}
              onClick={handleCopyText}
            >
              {copied ? '已复制群公示文本 ✓' : '复制群公示文本'}
            </button>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10}}>
            {result.settlements.map((s) => (
              <div key={s.id} style={{padding: 12, borderRadius: 10, background: 'rgba(148,163,184,0.1)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 600}}>
                  <span>{s.name}</span>
                  <span style={{fontSize: 12, color: '#64748b'}}>{s.weightRatio}%</span>
                </div>
                <div style={{fontSize: 13, marginTop: 4, color: '#64748b'}}>
                  应付: <b>{s.shouldPay} 元</b>
                </div>
                <div style={{fontSize: 13, color: s.balance >= 0 ? '#059669' : '#e11d48', fontWeight: 700}}>
                  {s.balance >= 0 ? `应收 +${s.balance} 元` : `需补交 ${Math.abs(s.balance)} 元`}
                </div>
              </div>
            ))}
          </div>

          <div className="dorm-transfers-box">
            <h4 style={{fontSize: 13.5, fontWeight: 700, margin: '0 0 8px 0'}}>👉 极简转账指令（已合并最优笔数）：</h4>
            {result.transfers.length > 0 ? (
              result.transfers.map((t, idx) => (
                <div key={idx} style={{fontSize: 13.5, lineHeight: 1.6}}>
                  • <b>{t.from}</b> 转给 <b>{t.to}</b>：<span style={{color: '#059669', fontWeight: 700}}>{t.amount} 元</span>
                </div>
              ))
            ) : (
              <div style={{fontSize: 13, color: '#059669'}}>✓ 全员垫付平衡，无需互相转账！</div>
            )}
          </div>
        </section>
      </div>
    </ToolPage>
  );
}
