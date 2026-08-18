'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// —— 艾宾浩斯记忆曲线复习间隔（天）——
const INTERVALS = [1, 2, 4, 7, 15, 30];

const SUBJECTS = ['语文', '英语', '道法', '历史', '生物', '地理', '其他'];

const EXAMPLES: Record<string, string> = {
  语文: '《岳阳楼记》全文\n《醉翁亭记》第一段\n《酬乐天扬州初逢席上见赠》\n《水调歌头·明月几时有》\n《记承天寺夜游》\n《三峡》全文\n《答谢中书书》\n《使至塞上》\n《渡荆门送别》\n《野望》',
  英语: 'Unit1 单词 20 个\nUnit1 重点句型 5 句\nUnit2 单词 20 个\nUnit2 语法笔记\nUnit3 单词 20 个\nUnit3 对话 2 段',
  道法: '宪法宣誓誓词\n公民基本权利 8 条\n公民基本义务 6 条\n诚实守信的意义\n违法与犯罪的区别',
  历史: '鸦片战争时间线与条约\n洋务运动内容 4 条\n戊戌变法主要人物与事件\n辛亥革命历史意义\n新文化运动口号与内容',
  生物: '细胞结构各部位功能\n光合作用与呼吸作用对比\n食物链与食物网\n生态系统的组成\n显微镜使用方法',
  地理: '中国 34 个省级行政区\n长江概况（发源地/入海口/长度）\n黄河概况与治理\n季风气候特点\n五带划分与界线',
  其他: '古诗 10 首\n成语 20 个\n公式 5 条',
};

interface Plan {
  subject: string;
  items: string[];
  perDay: number;
  startDate: string; // YYYY-MM-DD
  createdAt: string;
}

interface Task {
  id: string; // 新内容用索引字符串；复习用 `r${idx}`
  label: string;
  kind: 'new' | 'review';
  round?: number;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return fmtDate(dt);
}

function diffDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000);
}

function getToday(): string {
  return fmtDate(new Date());
}

// 计算某一天的任务：新背 + 复习
function getTasks(plan: Plan, date: string): Task[] {
  const offset = diffDays(plan.startDate, date);
  if (offset < 0) return [];
  const tasks: Task[] = [];
  const startIdx = offset * plan.perDay;
  const newItems = plan.items.slice(startIdx, startIdx + plan.perDay);
  newItems.forEach((label, i) => tasks.push({ id: String(startIdx + i), label, kind: 'new' }));
  // 复习：之前背过的内容，凡 interval 命中当天（idx 必须 < items.length，避免幽灵任务）
  for (let idx = 0; idx < startIdx && idx < plan.items.length; idx++) {
    const learnOffset = Math.floor(idx / plan.perDay); // 该内容背诵日 offset
    INTERVALS.forEach((iv, ri) => {
      if (learnOffset + iv === offset) {
        tasks.push({ id: `r${idx}`, label: plan.items[idx], kind: 'review', round: ri + 1 });
      }
    });
  }
  return tasks;
}

const STORAGE_KEY = 'memorize_plan_v1';

export default function MemorizePage(): ReactNode {
  const [subject, setSubject] = useState('语文');
  const [text, setText] = useState('');
  const [perDay, setPerDay] = useState(3);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [doneMap, setDoneMap] = useState<Record<string, string[]>>({});
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // 载入 localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.plan) {
          setPlan(saved.plan);
          setDoneMap(saved.doneMap || {});
          setActive(true);
          setSubject(saved.plan.subject || '语文');
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const today = useMemo(() => getToday(), []);

  const generate = useCallback(() => {
    const items = text
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!items.length) {
      setError('请先粘贴要背的内容（每行一条）。');
      return;
    }
    if (items.length > 200) {
      setError('内容太多，一次请控制在 200 条以内（可分批生成）。');
      return;
    }
    setError('');
    setPlan({ subject, items, perDay, startDate: today, createdAt: new Date().toISOString() });
    setActive(false);
    setDoneMap({});
  }, [text, subject, perDay, today]);

  const start = useCallback(() => {
    if (!plan) return;
    setActive(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan, doneMap: {} }));
    } catch {
      /* ignore */
    }
  }, [plan]);

  const toggle = useCallback(
    (date: string, id: string) => {
      setDoneMap((prev) => {
        const cur = prev[date] || [];
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        const nm = { ...prev, [date]: next };
        if (plan) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan, doneMap: nm }));
          } catch {
            /* ignore */
          }
        }
        return nm;
      });
    },
    [plan],
  );

  const reset = useCallback(() => {
    if (!window.confirm('确定重置计划吗？打卡记录会一并清除。')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPlan(null);
    setDoneMap({});
    setActive(false);
    setText('');
  }, []);

  // 今日任务
  const todayTasks = plan && active ? getTasks(plan, today) : [];
  const doneIds = active ? doneMap[today] || [] : [];
  const doneCount = todayTasks.filter((t) => doneIds.includes(t.id)).length;
  const todayPct = todayTasks.length ? Math.round((doneCount / todayTasks.length) * 100) : 0;

  // 连续打卡天数（从今天往前，完成率 100% 才算）
  const streak = useMemo(() => {
    if (!plan || !active) return 0;
    let s = 0;
    for (let i = 0; ; i++) {
      const d = addDays(plan.startDate, Math.max(0, diffDays(plan.startDate, today) - i));
      const tasks = getTasks(plan, d);
      const done = doneMap[d] || [];
      if (tasks.length === 0) break;
      if (tasks.every((t) => done.includes(t.id))) s += 1;
      else break;
    }
    return s;
  }, [plan, active, today, doneMap]);

  // 累计完成数
  const totalDone = useMemo(() => {
    if (!plan) return 0;
    return Object.values(doneMap).reduce((a, arr) => a + arr.length, 0);
  }, [plan, doneMap]);

  // 明日预览
  const tomorrow = plan && active ? addDays(today, 1) : '';
  const tomorrowTasks = plan && active ? getTasks(plan, tomorrow) : [];

  const exportMd = useCallback(() => {
    if (!plan) return;
    const lines: string[] = [];
    lines.push(`# 背诵计划（${plan.subject} · 艾宾浩斯间隔复习）`);
    lines.push(`- 开始日期：${plan.startDate} · 每天新背 ${plan.perDay} 条 · 共 ${plan.items.length} 条`);
    lines.push(`- 复习间隔：第 ${INTERVALS.join('/')} 天 · 生成于 ${plan.createdAt.slice(0, 10)}`);
    lines.push('');
    lines.push('## 背诵清单');
    plan.items.forEach((it, i) => lines.push(`${i + 1}. ${it}`));
    lines.push('');
    lines.push('## 打卡日历');
    const totalDays = Math.ceil(plan.items.length / plan.perDay);
    for (let d = 0; d < totalDays; d++) {
      const date = addDays(plan.startDate, d);
      const tasks = getTasks(plan, date);
      const done = doneMap[date] || [];
      lines.push(`### ${date}（第${d + 1}天）${done.length}/${tasks.length} ✓`);
      tasks.forEach((t) => {
        const mark = done.includes(t.id) ? '✓' : '○';
        lines.push(`- ${mark} [${t.kind === 'new' ? '新背' : `复习${t.round}`}] ${t.label}`);
      });
      lines.push('');
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [plan, doneMap]);

  const totalDays = plan ? Math.ceil(plan.items.length / plan.perDay) : 0;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 20px 56px' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <a href="/learn" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          ← 学习助手
        </a>
        <span style={{ color: '#9ca3af' }}>/</span>
        <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 15 }}>背诵计划助手</span>
        {active && plan && (
          <button
            onClick={reset}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: '#dc2626',
              background: 'transparent',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            重置计划
          </button>
        )}
      </div>

      <h1 style={{ fontSize: 22, margin: '0 0 6px', color: '#1f2a44' }}>背诵计划助手 🧠</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, marginTop: 0, lineHeight: 1.7 }}>
        把要背的内容粘贴进来，按<b>艾宾浩斯记忆曲线</b>自动排期（新内容每天定量，已背内容在第{' '}
        {INTERVALS.join('/')} 天自动安排复习），生成打卡日历。全程在浏览器本地保存，数据不上传、零费用。
      </p>

      {/* 输入区 */}
      {!active ? (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 16,
            background: '#fff',
            boxShadow: '0 1px 6px rgba(0,0,0,.04)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 14 }}>科目</span>
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setText(EXAMPLES[e.target.value] || '');
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 13.5,
                background: '#fafbfc',
                color: '#1f2a44',
              }}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12.5, color: '#9ca3af' }}>每天新背</span>
            <input
              type="number"
              min={1}
              max={5}
              value={perDay}
              onChange={(e) => setPerDay(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
              style={{
                width: 56,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 13.5,
                background: '#fafbfc',
                color: '#1f2a44',
              }}
            />
            <span style={{ fontSize: 12.5, color: '#9ca3af' }}>条</span>
            <button
              onClick={() => setText(EXAMPLES[subject] || '')}
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                color: '#2563eb',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              填入示例
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'每行一条要背的内容，例如：\n《岳阳楼记》全文\nUnit3 单词 20 个\n宪法宣誓誓词'}
            style={{
              width: '100%',
              minHeight: 160,
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 12,
              fontSize: 13.5,
              lineHeight: 1.7,
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
              color: '#1f2a44',
              background: '#fafbfc',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button
              onClick={generate}
              style={{
                padding: '8px 22px',
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
                background: '#2563eb',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              生成背诵计划
            </button>
            {error && <span style={{ fontSize: 13, color: '#dc2626' }}>⚠ {error}</span>}
          </div>
          {plan && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                background: '#f8fafc',
                borderRadius: 10,
                fontSize: 13.5,
                color: '#1f2a44',
                lineHeight: 1.8,
              }}
            >
              <b>计划预览：</b>共 {plan.items.length} 条 · 每天新背 {plan.perDay} 条 · 预计{' '}
              {totalDays} 天排完（从 {plan.startDate} 开始）· 每天任务=新背 {plan.perDay} 条 + 按曲线自动插入的复习。
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={start}
                  style={{
                    padding: '7px 18px',
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: '#fff',
                    background: '#059669',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
                  🚀 开始学习（存入本地）
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 打卡区 */
        plan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 概览 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              <Stat label="今日进度" value={`${doneCount}/${todayTasks.length}`} sub={`${todayPct}%`} />
              <Stat label="连续打卡" value={`${streak} 天`} sub={streak > 0 ? '坚持住！' : '今天开始'} />
              <Stat label="累计完成" value={`${totalDone} 项`} sub={`共 ${plan.items.length} 条`} />
              <Stat label="计划周期" value={`${totalDays} 天`} sub={`${plan.startDate} 起`} />
            </div>

            {/* 今日任务 */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 16,
                background: '#fff',
                boxShadow: '0 1px 6px rgba(0,0,0,.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 15 }}>今日任务 · {today}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#9ca3af' }}>
                  {plan.subject} · 第 {Math.min(diffDays(plan.startDate, today) + 1, totalDays)} / {totalDays} 天
                </span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
                <div
                  style={{ width: `${todayPct}%`, height: '100%', background: '#059669', borderRadius: 4, transition: 'width .3s' }}
                />
              </div>
              {todayTasks.length === 0 && (
                <div style={{ fontSize: 13.5, color: '#94a3b8', padding: '10px 0' }}>
                  🎉 今天的任务已经排完了！如果还有内容没背完，去重置计划或新增内容。
                </div>
              )}
              {todayTasks.map((t) => {
                const isDone = doneIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(today, t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 10,
                      border: `1px solid ${isDone ? '#a7f3d0' : '#e2e8f0'}`,
                      background: isDone ? '#ecfdf5' : '#fafbfc',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        border: `2px solid ${isDone ? '#059669' : '#cbd5e1'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        color: isDone ? '#fff' : 'transparent',
                        background: isDone ? '#059669' : 'transparent',
                        flex: 'none',
                      }}
                    >
                      ✓
                    </span>
                    <span
                      style={{
                        flex: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        color: t.kind === 'new' ? '#2563eb' : '#8b5cf6',
                        background: t.kind === 'new' ? '#eff6ff' : '#f5f3ff',
                      }}
                    >
                      {t.kind === 'new' ? '新背' : `复习${t.round}`}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        color: isDone ? '#6b7280' : '#1f2a44',
                        textDecoration: isDone ? 'line-through' : 'none',
                        lineHeight: 1.5,
                      }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 明日预告 */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 16,
                background: '#fff',
                boxShadow: '0 1px 6px rgba(0,0,0,.04)',
              }}
            >
              <div style={{ fontWeight: 700, color: '#1f2a44', fontSize: 14.5, marginBottom: 10 }}>
                明日预告 · {tomorrow}
              </div>
              {tomorrowTasks.length === 0 && (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>明天暂无任务（内容已全部排完）。</div>
              )}
              {tomorrowTasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13.5, color: '#475569' }}>
                  <span
                    style={{
                      flex: 'none',
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      color: t.kind === 'new' ? '#2563eb' : '#8b5cf6',
                      background: t.kind === 'new' ? '#eff6ff' : '#f5f3ff',
                    }}
                  >
                    {t.kind === 'new' ? '新背' : `复习${t.round}`}
                  </span>
                  {t.label}
                </div>
              ))}
            </div>

            {/* 操作 */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={exportMd}
                style={{
                  padding: '8px 18px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: copied ? '#059669' : '#2563eb',
                  background: copied ? '#ecfdf5' : '#eff6ff',
                  border: `1px solid ${copied ? '#a7f3d0' : '#bfdbfe'}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓ 已复制' : '导出 Markdown 计划'}
              </button>
              <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
                数据保存在本浏览器（localStorage），换设备/清缓存会丢失，建议定期导出。
              </span>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '12px 14px',
        background: '#fff',
        boxShadow: '0 1px 6px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ fontSize: 12, color: '#9ca3af' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2a44', margin: '2px 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#059669' }}>{sub}</div>
    </div>
  );
}
