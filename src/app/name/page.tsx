'use client';

import { useState } from 'react';

type Category = 'baby' | 'brand' | 'pet';
interface NameItem {
  name: string;
  pinyin?: string;
  meaning: string;
  tags?: string[];
}
interface NameResult {
  category: Category;
  mode: 'ai' | 'rule';
  names: NameItem[];
  note: string;
}

const CATS: { key: Category; label: string; desc: string }[] = [
  { key: 'baby', label: '宝宝起名', desc: '姓 + 寓意字，附拼音与寓意' },
  { key: 'brand', label: '品牌起名', desc: '2-3 字好记品牌名 + 定位' },
  { key: 'pet', label: '宠物起名', desc: '软萌好叫的宠物名' },
];

const BABY_STYLES = ['古风', '现代', '诗意', '文艺', '阳光', '可爱'];
const BABY_THEMES = ['平安', '智慧', '阳光', '自然', '文雅', '美德', '柔美', '喜悦', '志向', '美好'];

const BLUE = '#185fa5';

export default function NamePage() {
  const [cat, setCat] = useState<Category>('baby');
  const [mode, setMode] = useState<'ai' | 'rule'>('rule');
  const [gender, setGender] = useState<'男' | '女' | '不限'>('不限');
  const [style, setStyle] = useState('');
  const [surname, setSurname] = useState('');
  const [keywords, setKeywords] = useState('');
  const [industry, setIndustry] = useState('');
  const [petType, setPetType] = useState('');
  const [freeText, setFreeText] = useState('');
  const [count, setCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NameResult | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cat,
          mode,
          count,
          gender: cat === 'baby' ? gender : undefined,
          style: cat === 'baby' ? style : undefined,
          surname: cat === 'baby' ? surname : undefined,
          keywords:
            cat === 'baby' && keywords.trim()
              ? keywords.split(/[,，\s]+/).filter(Boolean)
              : undefined,
          industry: cat === 'brand' ? industry : undefined,
          petType: cat === 'pet' ? petType : undefined,
          free_text: freeText || undefined,
        }),
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

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, color: BLUE, margin: '0 0 4px' }}>AI 起名助手</h1>
      <p style={{ color: '#666', margin: '0 0 20px' }}>
        宝宝 / 品牌 / 宠物，一键生成带寓意的好名字。规则模式免 AI（0 token），AI 模式更懂你的偏好。
      </p>

      {/* 分类 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {CATS.map((c) => {
          const active = cat === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                border: active ? `2px solid ${BLUE}` : '1px solid #ddd',
                background: active ? '#eef5fc' : '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 150,
              }}
            >
              <div style={{ fontWeight: 700, color: active ? BLUE : '#333' }}>{c.label}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{c.desc}</div>
            </button>
          );
        })}
      </div>

      {/* 表单 */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          padding: 18,
          marginBottom: 18,
        }}
      >
        {/* 宝宝条件 */}
        {cat === 'baby' && (
          <>
            <Field label="姓氏（可选）">
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="如：李"
                style={inputStyle}
              />
            </Field>
            <Field label="性别">
              <Seg
                options={['不限', '男', '女']}
                value={gender}
                onChange={(v) => setGender(v as any)}
              />
            </Field>
            <Field label="风格">
              <Chips options={BABY_STYLES} value={style} onChange={setStyle} />
            </Field>
            <Field label="寓意关键词（可选，逗号分隔）">
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="如：平安, 智慧"
                style={inputStyle}
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                也可直接用主题词：{BABY_THEMES.join('、')}
              </div>
            </Field>
          </>
        )}

        {/* 品牌条件 */}
        {cat === 'brand' && (
          <Field label="行业 / 品类（可选）">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="如：科技、咖啡、文创工作室"
              style={inputStyle}
            />
          </Field>
        )}

        {/* 宠物条件 */}
        {cat === 'pet' && (
          <Field label="宠物类型（可选）">
            <input
              value={petType}
              onChange={(e) => setPetType(e.target.value)}
              placeholder="如：猫、狗、仓鼠"
              style={inputStyle}
            />
          </Field>
        )}

        {/* 通用：附加要求 */}
        <Field label="附加要求（可选）">
          <input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="如：希望大气一点 / 不要生僻字"
            style={inputStyle}
          />
        </Field>

        {/* 数量 */}
        <Field label={`生成数量：${count}`}>
          <input
            type="range"
            min={3}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{ width: 220 }}
          />
        </Field>

        {/* 模式 */}
        <Field label="生成模式">
          <Seg options={['rule', 'ai']} labels={{ rule: '规则（0 token）', ai: 'AI（更个性化）' }} value={mode} onChange={(v) => setMode(v as any)} />
        </Field>

        <button
          onClick={submit}
          disabled={loading}
          style={{
            marginTop: 8,
            padding: '12px 28px',
            borderRadius: 10,
            border: 'none',
            background: BLUE,
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '生成中…' : '生成名字'}
        </button>
        {quota && (
          <span style={{ marginLeft: 14, fontSize: 13, color: '#888' }}>
            今日剩余：AI {quota.ai.remaining}/{quota.ai.limit} · 规则 {quota.rule.remaining}/{quota.rule.limit}
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: '#c0392b', background: '#fdecea', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div style={{ marginBottom: 12, color: '#555', fontSize: 14 }}>
            {result.note}
            {usage && (
              <span style={{ marginLeft: 10, color: '#999' }}>
                （本次消耗 {usage.totalTokens} tokens · 约 ¥{usage.costYuan}）
              </span>
            )}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {result.names.map((n, i) => (
              <div
                key={i}
                style={{
                  background: '#fff',
                  border: '1px solid #eee',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: BLUE }}>{n.name}</span>
                  {n.pinyin && <span style={{ fontSize: 13, color: '#999' }}>{n.pinyin}</span>}
                </div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 8, lineHeight: 1.6 }}>{n.meaning}</div>
                {n.tags && n.tags.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {n.tags.map((t, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 11,
                          color: BLUE,
                          background: '#eef5fc',
                          borderRadius: 6,
                          padding: '2px 8px',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: '#444', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  fontSize: 14,
  fontFamily: 'inherit',
};

function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(active ? '' : o)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: active ? `1px solid ${BLUE}` : '1px solid #ddd',
              background: active ? BLUE : '#fff',
              color: active ? '#fff' : '#555',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Seg({
  options,
  labels,
  value,
  onChange,
}: {
  options: string[];
  labels?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              border: active ? `1px solid ${BLUE}` : '1px solid #ddd',
              background: active ? BLUE : '#fff',
              color: active ? '#fff' : '#555',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {labels && labels[o] ? labels[o] : o}
          </button>
        );
      })}
    </div>
  );
}
