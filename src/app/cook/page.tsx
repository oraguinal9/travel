'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RECIPES, getRecipeById } from '@/lib/recipes';
import type { WeeklyPlan, Recipe } from '@/types/recipe';

const AVOID_OPTS = ['辣', '海鲜', '内脏', '蛋', '豆制品', '甜', '汤', '凉菜'];

interface Quota {
  ai: { remaining: number; limit: number; used: number };
  rule: { remaining: number; limit: number; used: number };
}

function parseSeconds(d?: string): number | null {
  if (!d) return null;
  const m = d.match(/(\d+)\s*分钟/);
  if (m) return parseInt(m[1], 10) * 60;
  const s = d.match(/(\d+)\s*秒/);
  if (s) return parseInt(s[1], 10);
  return null;
}

export default function CookPage() {
  const [people, setPeople] = useState(2);
  const [spicy, setSpicy] = useState<'要' | '不要' | '随便'>('随便');
  const [avoid, setAvoid] = useState<string[]>([]);
  const [maxMin, setMaxMin] = useState(60);
  const [newFreq, setNewFreq] = useState(0.3);
  const [days, setDays] = useState(7);
  const [dishes, setDishes] = useState(3);
  const [mode, setMode] = useState<'ai' | 'rule'>('rule');

  const [quota, setQuota] = useState<Quota | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [stageMsg, setStageMsg] = useState('');
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [usage, setUsage] = useState<{ input: number; output: number; cost: number } | null>(null);
  const [error, setError] = useState('');

  const [modal, setModal] = useState<Recipe | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/quota')
      .then((r) => r.json())
      .then((d) => setQuota(d.quota))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== 'processing' || !taskId) return;
    const iv = setInterval(async () => {
      try {
        const t = await (await fetch(`/api/cook/${taskId}`)).json();
        setProgress(t.progress || 0);
        setStageMsg(t.message || '');
        if (t.status === 'completed') {
          setPlan(t.result);
          setUsage(t.usage || null);
          setStatus('completed');
          clearInterval(iv);
          fetch('/api/quota').then((r) => r.json()).then((d) => setQuota(d.quota)).catch(() => {});
        } else if (t.status === 'failed') {
          setError(t.error || '生成失败');
          setStatus('failed');
          clearInterval(iv);
        }
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [status, taskId]);

  function toggleAvoid(t: string) {
    setAvoid((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));
  }

  async function submit() {
    setError('');
    setPlan(null);
    setUsage(null);
    const body = { people, spicy, avoid, max_minutes: maxMin, new_freq: newFreq, days, dishes, mode };
    const res = await fetch('/api/cook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const d = await res.json();
      setError(d.message || '今日次数已用完');
      return;
    }
    const d = await res.json();
    if (d.task_id) {
      setTaskId(d.task_id);
      setStatus('processing');
      setProgress(10);
    }
  }

  function openRecipe(id: string) {
    const r = getRecipeById(id);
    if (r) {
      setModal(r);
      setStepIdx(0);
      setTimerLeft(null);
    }
  }

  function startTimer() {
    const sec = modal ? parseSeconds(modal.steps[stepIdx]?.duration) : null;
    if (!sec) return;
    setTimerLeft(sec);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimerLeft((v) => {
        if (v == null) return null;
        if (v <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const rem = quota?.[mode]?.remaining ?? '—';

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 60px' }}>
      <h1 style={{ fontSize: 24, margin: '4px 0 2px' }}>家常菜谱智能体</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
        按你家口味排一周菜谱 · 自动出采购单 · 一步步教你炒（规则模式 0 token，AI 模式可个性化）
      </p>

      {/* 偏好表单 */}
      <section style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <Field label="人数">
            <input type="number" min={1} max={10} value={people} onChange={(e) => setPeople(+e.target.value)} style={input} />
          </Field>
          <Field label="辣度">
            <select value={spicy} onChange={(e) => setSpicy(e.target.value as any)} style={input}>
              <option value="随便">随便</option>
              <option value="要">要辣</option>
              <option value="不要">不要辣</option>
            </select>
          </Field>
          <Field label={`每餐最长耗时：${maxMin} 分钟`}>
            <input type="range" min={10} max={90} step={5} value={maxMin} onChange={(e) => setMaxMin(+e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label={`想试新菜比例：${Math.round(newFreq * 100)}%`}>
            <input type="range" min={0} max={1} step={0.1} value={newFreq} onChange={(e) => setNewFreq(+e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="天数">
            <select value={days} onChange={(e) => setDays(+e.target.value)} style={input}>
              {[3, 5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>{d} 天</option>
              ))}
            </select>
          </Field>
          <Field label="每餐几道菜">
            <select value={dishes} onChange={(e) => setDishes(+e.target.value)} style={input}>
              <option value={2}>2 道（一荤一素）</option>
              <option value={3}>3 道（荤素汤，推荐）</option>
              <option value={4}>4 道（丰盛）</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>忌口（点选排除）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {AVOID_OPTS.map((t) => (
              <button
                key={t}
                onClick={() => toggleAvoid(t)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 16,
                  border: '1px solid #ddd',
                  background: avoid.includes(t) ? '#e74c3c' : '#fff',
                  color: avoid.includes(t) ? '#fff' : '#333',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ModeBtn active={mode === 'rule'} onClick={() => setMode('rule')} label="免 DeepSeek 规则" sub={`剩 ${quota?.rule.remaining ?? '—'} 次`} />
          <ModeBtn active={mode === 'ai'} onClick={() => setMode('ai')} label="AI 个性化" sub={`剩 ${quota?.ai.remaining ?? '—'} 次`} />
          <button onClick={submit} disabled={status === 'processing'} style={{ ...btnPrimary, opacity: status === 'processing' ? 0.6 : 1 }}>
            {status === 'processing' ? '生成中…' : '生成一周菜谱'}
          </button>
          <span style={{ fontSize: 12, color: '#999' }}>当前模式今日剩余 {rem} 次</span>
        </div>
        {error && <div style={{ marginTop: 12, color: '#e74c3c', fontSize: 14 }}>{error}</div>}
        {status === 'processing' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#185fa5', transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>{stageMsg}</div>
          </div>
        )}
      </section>

      {/* 结果 */}
      {plan && (
        <>
          {plan.note && (
            <div style={{ ...card, background: '#f3f8ff', border: '1px solid #cfe2ff', marginTop: 20 }}>
              <b>💡 {plan.note}</b>
              {usage && (
                <span style={{ marginLeft: 10, fontSize: 12, color: '#666' }}>
                  本次消耗 {usage.input + usage.output} tokens / 约 ¥{usage.cost}
                </span>
              )}
            </div>
          )}

          <h2 style={{ margin: '24px 0 10px', fontSize: 18 }}>一周菜谱（点菜名看做法）</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
            {plan.days.map((d) => (
              <div key={d.day_index} style={{ ...card, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#185fa5' }}>{d.weekday}</div>
                <MealList title="🍱 午餐" items={d.lunch} onOpen={openRecipe} />
                <MealList title="🍲 晚餐" items={d.dinner} onOpen={openRecipe} />
              </div>
            ))}
          </div>

          <h2 style={{ margin: '28px 0 10px', fontSize: 18 }}>采购清单（按荤 / 素 / 调料分类）</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
            <ShopCol title="🥩 荤" items={plan.shopping.meat} color="#c0392b" />
            <ShopCol title="🥬 素" items={plan.shopping.veg} color="#27ae60" />
            <ShopCol title="🧂 调料" items={plan.shopping.seasoning} color="#8e44ad" />
          </div>
        </>
      )}

      {/* 分步模拟弹窗 */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '88vh', overflow: 'auto', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{modal.name}</h3>
              <button onClick={() => setModal(null)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: '#666', margin: '4px 0 10px' }}>
              {modal.cuisine} · 难度{'★'.repeat(modal.difficulty)} · {modal.total_minutes}分钟 · {modal.servings}人份
            </div>

            <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
              食材：{modal.ingredients.map((i) => `${i.name}${i.amount}`).join('、')}
            </div>

            {modal.steps.map((s, i) => (
              <div
                key={s.step}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  background: i === stepIdx ? '#fff7e6' : '#fff',
                  borderLeft: i === stepIdx ? '4px solid #f39c12' : '4px solid #eee',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  步骤 {s.step}：{s.action}
                  {s.heat && <span style={{ color: '#e67e22', marginLeft: 8, fontSize: 12 }}>【{s.heat}】</span>}
                  {s.duration && <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>⏱ {s.duration}</span>}
                </div>
                <div style={{ fontSize: 14, color: '#333', marginTop: 4 }}>{s.detail}</div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <button disabled={stepIdx === 0} onClick={() => setStepIdx((v) => Math.max(0, v - 1))} style={btnGhost}>上一步</button>
              <button
                disabled={stepIdx >= modal.steps.length - 1}
                onClick={() => {
                  setStepIdx((v) => Math.min(modal.steps.length - 1, v + 1));
                  setTimerLeft(null);
                }}
                style={btnPrimary}
              >
                下一步
              </button>
              <button onClick={startTimer} style={btnGhost}>开始计时</button>
              {timerLeft != null && (
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: timerLeft === 0 ? '#27ae60' : '#e67e22' }}>
                  {timerLeft === 0 ? '✅ 时间到' : `${String(Math.floor(timerLeft / 60)).padStart(2, '0')}:${String(timerLeft % 60).padStart(2, '0')}`}
                </span>
              )}
            </div>
            {modal.tips && <div style={{ marginTop: 12, fontSize: 13, color: '#555', background: '#f6f6f6', padding: 10, borderRadius: 8 }}>👩‍🍳 小贴士：{modal.tips}</div>}
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function ModeBtn({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: active ? '2px solid #185fa5' : '1px solid #ddd',
        background: active ? '#eaf2fb' : '#fff',
        color: active ? '#185fa5' : '#333',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {label}
      <div style={{ fontSize: 11, fontWeight: 400 }}>{sub}</div>
    </button>
  );
}

function MealList({ title, items, onOpen }: { title: string; items?: { id: string; name: string; cuisine: string; difficulty: number; total_minutes: number; tags: string[] }[]; onOpen: (id: string) => void }) {
  if (!items || !items.length) return <div style={{ fontSize: 13, color: '#bbb', margin: '4px 0' }}>{title}：—</div>;
  const tagColor = (t: string) => {
    if (t === '肉' || t === '海鲜' || t === '内脏') return '#c0392b';
    if (t === '素') return '#27ae60';
    if (t === '汤') return '#2980b9';
    return '#999';
  };
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>{title}（{items.length} 道）</div>
      {items.map((m) => (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', paddingLeft: 8 }}>
          <div>
            <button onClick={() => onOpen(m.id)} style={{ border: 'none', background: 'transparent', color: '#185fa5', cursor: 'pointer', fontSize: 14, padding: 0 }}>
              {m.name}
            </button>
            <span style={{ fontSize: 11, color: '#bbb', marginLeft: 6 }}>
              {m.tags.filter((t) => ['肉', '海鲜', '素', '汤', '辣']).map((t) => (
                <span key={t} style={{ color: tagColor(t), marginRight: 4 }}>{t}</span>
              ))}
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#999' }}>
            {'★'.repeat(m.difficulty)} · {m.total_minutes}分
          </span>
        </div>
      ))}
    </div>
  );
}

function ShopCol({ title, items, color }: { title: string; items: { name: string; amount: string }[]; color: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontWeight: 700, color, marginBottom: 8 }}>{title}（{items.length}）</div>
      {items.length ? (
        items.map((it) => (
          <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '3px 0' }}>
            <span>{it.name}</span>
            <span style={{ color: '#999' }}>{it.amount}</span>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 13, color: '#bbb' }}>无</div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #eee',
  padding: 18,
  boxShadow: '0 1px 3px rgba(0,0,0,.04)',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ddd',
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#185fa5',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const btnGhost: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: '#fff',
  color: '#333',
  cursor: 'pointer',
  fontSize: 14,
};
