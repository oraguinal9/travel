'use client';

import { useState } from 'react';

type Tier = 't1' | 't15' | 't2' | 't3';
type Grade = 'economy' | 'standard' | 'premium' | 'luxury';
type StyleKey = 'modern' | 'nordic' | 'chinese' | 'american' | 'japanese';

interface LineItem {
  category: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  subtotal: number;
}
interface RenovResult {
  mode: 'ai' | 'rule';
  area: number;
  tier: Tier;
  grade: Grade;
  style: StyleKey;
  items: LineItem[];
  total: number;
  perSqm: number;
  byCategory: { category: string; subtotal: number; pct: number }[];
  tips: string[];
  note: string;
}

const TIERS: { k: Tier; label: string }[] = [
  { k: 't1', label: '一线城市' },
  { k: 't15', label: '新一线' },
  { k: 't2', label: '二线城市' },
  { k: 't3', label: '三线及以下' },
];
const GRADES: { k: Grade; label: string }[] = [
  { k: 'economy', label: '简装（经济）' },
  { k: 'standard', label: '中档' },
  { k: 'premium', label: '高档' },
  { k: 'luxury', label: '豪华' },
];
const STYLES: { k: StyleKey; label: string }[] = [
  { k: 'modern', label: '现代简约' },
  { k: 'nordic', label: '北欧' },
  { k: 'chinese', label: '新中式' },
  { k: 'american', label: '美式' },
  { k: 'japanese', label: '日式' },
];

const BLUE = '#185fa5';
const BAR_COLORS = ['#185fa5', '#2f9e6f', '#d98a2b', '#9b59b6', '#e06868', '#3aa6c4', '#c9a227', '#7d8a99', '#b5654a'];

export default function RenovationPage() {
  const [area, setArea] = useState(90);
  const [tier, setTier] = useState<Tier>('t2');
  const [grade, setGrade] = useState<Grade>('standard');
  const [style, setStyle] = useState<StyleKey>('modern');
  const [bedrooms, setBedrooms] = useState(3);
  const [livingRooms, setLivingRooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(2);
  const [mode, setMode] = useState<'ai' | 'rule'>('rule');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RenovResult | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/renovation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, tier, grade, style, bedrooms, livingRooms, bathrooms, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || '请求失败');
        return;
      }
      setResult(data.result);
      setUsage(data.usage);
      setQuota(data.quota);
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }

  function download(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    if (!result) return;
    const head = '类别,项目,数量,单位,单价(元),小计(元)\n';
    const rows = result.items
      .map((i) => `${i.category},${i.name},${i.qty},${i.unit},${i.price},${i.subtotal}`)
      .join('\n');
    const total = `\n总预算,${result.total},,元/㎡,${result.perSqm},`;
    download(`装修预算清单_${result.area}㎡.csv`, '﻿' + head + rows + total, 'text/csv;charset=utf-8');
  }

  function exportMD() {
    if (!result) return;
    let md = `# 装修预算清单（${result.area}㎡）\n\n`;
    md += `- 城市档次：${TIERS.find((t) => t.k === result.tier)?.label}\n`;
    md += `- 装修档次：${GRADES.find((g) => g.k === result.grade)?.label}\n`;
    md += `- 风格：${STYLES.find((s) => s.k === result.style)?.label}\n`;
    md += `- 户型：${result.area}㎡ / ${bedrooms}室${livingRooms}厅${bathrooms}卫\n`;
    md += `- **总预算：约 ${result.total.toLocaleString()} 元（${result.perSqm} 元/㎡）**\n\n`;
    md += `## 分项明细\n\n| 类别 | 项目 | 数量 | 单位 | 单价(元) | 小计(元) |\n|---|---|---|---|---|---|\n`;
    result.items.forEach((i) => {
      md += `| ${i.category} | ${i.name} | ${i.qty} | ${i.unit} | ${i.price} | ${i.subtotal} |\n`;
    });
    md += `\n## 板块占比\n\n`;
    result.byCategory.forEach((c) => {
      md += `- ${c.category}：${c.subtotal.toLocaleString()} 元（${c.pct}%）\n`;
    });
    md += `\n## 省钱与避坑建议\n\n`;
    result.tips.forEach((t) => (md += `- ${t}\n`));
    download(`装修预算清单_${result.area}㎡.md`, md, 'text/markdown;charset=utf-8');
  }

  const maxCat = result ? Math.max(...result.byCategory.map((c) => c.subtotal)) : 1;

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '28px 18px 60px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: BLUE, marginBottom: 4 }}>装修预算清单生成器</h1>
      <p style={{ color: '#666', marginBottom: 22 }}>
        填房屋信息，一键生成分项材料清单 + 预算表，可导出 CSV / Markdown。规则免费，AI 给深度避坑建议。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, background: '#f7f9fc', border: '1px solid #e3e9f2', borderRadius: 14, padding: 18 }}>
        <Field label="建筑面积（㎡）">
          <input type="number" min={20} max={1000} value={area} onChange={(e) => setArea(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="室">
          <input type="number" min={1} max={6} value={bedrooms} onChange={(e) => setBedrooms(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="厅">
          <input type="number" min={1} max={3} value={livingRooms} onChange={(e) => setLivingRooms(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="卫">
          <input type="number" min={1} max={4} value={bathrooms} onChange={(e) => setBathrooms(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="城市档次">
          <Select value={tier} onChange={(v) => setTier(v as Tier)} options={TIERS} />
        </Field>
        <Field label="装修档次">
          <Select value={grade} onChange={(v) => setGrade(v as Grade)} options={GRADES} />
        </Field>
        <Field label="风格" full>
          <Select value={style} onChange={(v) => setStyle(v as StyleKey)} options={STYLES} />
        </Field>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid #d7e0ec', borderRadius: 10, overflow: 'hidden' }}>
          <ModeBtn active={mode === 'rule'} onClick={() => setMode('rule')}>规则模式（免费）</ModeBtn>
          <ModeBtn active={mode === 'ai'} onClick={() => setMode('ai')}>AI 深度建议</ModeBtn>
        </div>
        <button onClick={submit} disabled={loading} style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 26px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? '生成中…' : '生成预算清单'}
        </button>
        {quota && (
          <span style={{ fontSize: 13, color: '#888' }}>
            {mode === 'ai' ? `AI 剩余 ${quota.ai}` : `规则剩余 ${quota.rule}`} 次/天
          </span>
        )}
      </div>

      {error && <p style={{ color: '#c0392b', marginTop: 14 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <Card label="总预算（约）" value={`¥${result.total.toLocaleString()}`} big />
            <Card label="单价" value={`${result.perSqm} 元/㎡`} />
            <Card label="面积 / 户型" value={`${result.area}㎡`} sub={`${bedrooms}室${livingRooms}厅${bathrooms}卫`} />
            <Card label="模式" value={result.mode === 'ai' ? 'AI 建议' : '规则'} />
          </div>

          {usage && (
            <p style={{ fontSize: 13, color: '#888', marginTop: 10 }}>
              本次消耗 {usage.totalTokens} tokens / 约 ¥{usage.costYuan}
              {usage.peak ? '（峰时价）' : '（谷时价）'}
            </p>
          )}

          <h2 style={{ fontSize: 18, margin: '26px 0 12px', color: BLUE }}>板块占比</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {result.byCategory.map((c, i) => (
              <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <span style={{ color: '#444' }}>{c.category}</span>
                <div style={{ background: '#eef2f7', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${(c.subtotal / maxCat) * 100}%`, height: '100%', background: BAR_COLORS[i % BAR_COLORS.length] }} />
                </div>
                <span style={{ textAlign: 'right', color: '#666' }}>{c.pct}%</span>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 18, margin: '26px 0 12px', color: BLUE }}>分项明细</h2>
          <div style={{ overflowX: 'auto', border: '1px solid #e3e9f2', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f3f6fb', color: '#456' }}>
                  <th style={th}>类别</th>
                  <th style={th}>项目</th>
                  <th style={{ ...th, textAlign: 'right' }}>数量</th>
                  <th style={th}>单位</th>
                  <th style={{ ...th, textAlign: 'right' }}>单价(元)</th>
                  <th style={{ ...th, textAlign: 'right' }}>小计(元)</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid #eef2f7' }}>
                    <td style={td}>{it.category}</td>
                    <td style={td}>{it.name}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{it.qty}</td>
                    <td style={td}>{it.unit}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{it.price}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{it.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #d7e0ec', background: '#fafcff' }}>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={4}>合计</td>
                  <td style={{ ...td, textAlign: 'right' }} />
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: BLUE }}>{result.total.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={exportCSV} style={outlineBtn}>导出 CSV</button>
            <button onClick={exportMD} style={outlineBtn}>导出 Markdown</button>
            <button onClick={() => window.print()} style={outlineBtn}>打印 / 存 PDF</button>
          </div>

          <h2 style={{ fontSize: 18, margin: '26px 0 12px', color: BLUE }}>省钱与避坑建议</h2>
          <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.tips.map((t, i) => (
              <li key={i} style={{ background: '#f7f9fc', border: '1px solid #e3e9f2', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#345' }}>
                {t}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 12, color: '#9aa', marginTop: 12 }}>{result.note}</p>
        </div>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  border: '1px solid #d7e0ec',
  borderRadius: 9,
  fontSize: 15,
  background: '#fff',
  color: '#222',
};
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', color: '#333' };
const outlineBtn: React.CSSProperties = {
  background: '#fff',
  color: BLUE,
  border: '1px solid ' + BLUE,
  borderRadius: 9,
  padding: '9px 16px',
  fontWeight: 600,
  cursor: 'pointer',
};

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#567' }}>
      {label}
      {children}
    </label>
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { k: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {options.map((o) => (
        <option key={o.k} value={o.k}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: '8px 16px', border: 'none', background: active ? BLUE : 'transparent', color: active ? '#fff' : '#456', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
      {children}
    </button>
  );
}
function Card({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div style={{ background: '#f7f9fc', border: '1px solid #e3e9f2', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: '#889' }}>{label}</div>
      <div style={{ fontSize: big ? 24 : 18, fontWeight: 700, color: BLUE, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9aa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
