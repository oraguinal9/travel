'use client';

import { useEffect, useState } from 'react';

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14 };
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#555', flex: 1 };

export interface QuotaInfo {
  ai: { remaining: number; limit: number; used: number };
  rule: { remaining: number; limit: number; used: number };
}

export default function PlanForm({
  onSubmit,
  loading,
  defaultMode = 'ai',
  llmEnabled = null,
  quota,
  error,
}: {
  onSubmit: (r: Record<string, unknown>) => void;
  loading: boolean;
  defaultMode?: 'ai' | 'rule';
  llmEnabled?: boolean | null;
  quota?: QuotaInfo;
  error?: string | null;
}) {
  const [city, setCity] = useState('');
  const [days, setDays] = useState(4);
  const [budget, setBudget] = useState('');
  const [prefs, setPrefs] = useState('');
  const [transport, setTransport] = useState('公共交通');
  const [acc, setAcc] = useState('经济型酒店');
  // 未配置 DeepSeek 时强制规则模式（AI 模式会 401 失败）
  const [mode, setMode] = useState<'ai' | 'rule'>(llmEnabled === false ? 'rule' : defaultMode);

  // 某模式当日剩余次数（无 quota 信息时默认视为有余额）
  const aiLeft = quota ? quota.ai.remaining : Infinity;
  const ruleLeft = quota ? quota.rule.remaining : Infinity;

  // 当前模式已耗尽但另一种还有余额时，自动切到还有余额的模式
  useEffect(() => {
    if (!quota) return;
    if (mode === 'ai' && aiLeft <= 0 && ruleLeft > 0) setMode('rule');
    if (mode === 'rule' && ruleLeft <= 0 && aiLeft > 0) setMode('ai');
  }, [quota, mode, aiLeft, ruleLeft]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      city,
      travel_days: Number(days),
      total_budget: budget ? Number(budget) : undefined,
      preferences: prefs
        .split(/[，,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      transportation: transport,
      accommodation: acc,
      mode,
      start_date: '',
      end_date: '',
      cities: [],
    });
  }

  const selLeft = mode === 'ai' ? aiLeft : ruleLeft;
  const selExhausted = selLeft <= 0;

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 24 }}>
      <input placeholder="目的地，如 成都" value={city} onChange={(e) => setCity(e.target.value)} required style={inp} />
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={lbl}>
          天数
          <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(+e.target.value)} style={inp} />
        </label>
        <label style={lbl}>
          总预算(元，可选)
          <input placeholder="如 3000" value={budget} onChange={(e) => setBudget(e.target.value)} style={inp} />
        </label>
      </div>
      <input
        placeholder="偏好，逗号分隔，如 美食,历史文化,亲子"
        value={prefs}
        onChange={(e) => setPrefs(e.target.value)}
        style={inp}
      />
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={lbl}>
          交通
          <select value={transport} onChange={(e) => setTransport(e.target.value)} style={inp}>
            <option>公共交通</option>
            <option>自驾</option>
            <option>高铁</option>
          </select>
        </label>
        <label style={lbl}>
          住宿
          <select value={acc} onChange={(e) => setAcc(e.target.value)} style={inp}>
            <option>经济型酒店</option>
            <option>舒适型</option>
            <option>豪华型</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#555' }}>规划模式</span>
        <div style={{ display: 'inline-flex', border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
          <button
            type="button"
            disabled={llmEnabled === false || aiLeft <= 0}
            onClick={() => setMode('ai')}
            style={{
              padding: '7px 12px',
              border: 'none',
              fontSize: 13,
              cursor: llmEnabled === false || aiLeft <= 0 ? 'not-allowed' : 'pointer',
              background: mode === 'ai' ? '#185fa5' : '#fff',
              color: mode === 'ai' ? '#fff' : '#333',
              opacity: aiLeft <= 0 ? 0.5 : 1,
            }}
          >
            AI 智能规划{quota ? `（今日剩 ${aiLeft} 次）` : '（可选）'}
          </button>
          <button
            type="button"
            disabled={ruleLeft <= 0}
            onClick={() => setMode('rule')}
            style={{
              padding: '7px 12px',
              border: 'none',
              borderLeft: '1px solid #ccc',
              fontSize: 13,
              cursor: ruleLeft <= 0 ? 'not-allowed' : 'pointer',
              background: mode === 'rule' ? '#389e0d' : '#fff',
              color: mode === 'rule' ? '#fff' : '#333',
              opacity: ruleLeft <= 0 ? 0.5 : 1,
            }}
          >
            免 DeepSeek{quota ? `（剩 ${ruleLeft} 次）` : '（规则）'}
          </button>
        </div>
        {mode === 'rule' && (
          <span style={{ fontSize: 12, color: '#389e0d' }}>0 token · 仅高德+天气</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: -6 }}>
        默认免 DeepSeek 规则模式（0 token）。需要更灵活编排、跨城中转等再手动切「AI 智能规划（可选）」。每日有试用上限，防止滥用。
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#cf1322', background: '#fff1f0', border: '1px solid #ffccc7', padding: '8px 10px', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <button
        disabled={loading || selExhausted}
        style={{
          padding: '10px 16px',
          background: selExhausted ? '#bbb' : '#185fa5',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          cursor: selExhausted ? 'not-allowed' : 'pointer',
        }}
      >
        {selExhausted ? '今日次数已用完，明天再来' : loading ? '生成中…' : '生成行程'}
      </button>
    </form>
  );
}
