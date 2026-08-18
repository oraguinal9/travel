'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface QuotaInfo {
  remaining: number;
  limit: number;
  used: number;
}

interface MistakeItem {
  subject: string;
  text: string;
  reason: string;
  topics: string[];
}
interface WeakPoint {
  subject: string;
  topic: string;
  count: number;
  reasons: string[];
}
interface PlanItem {
  round: number;
  day: number;
  date: string;
  subject: string;
  topic: string;
  action: string;
}
interface PracticeItem {
  subject: string;
  topic: string;
  question: string;
  answer: string;
}
interface MistakeResult {
  mode: 'rule' | 'ai';
  items: MistakeItem[];
  summary: { total: number; subjects: Record<string, number>; reasons: Record<string, number> };
  weakPoints: WeakPoint[];
  plan: PlanItem[];
  tips: string[];
  kbLinks: { subject: string; href: string }[];
  practice?: PracticeItem[];
  strategy?: string[];
  note: string;
}

const EXAMPLE = `【数学】全等三角形判定：已知两边一角，什么时候用 SAS 什么时候用 SSS？我用错了 | 概念错
【物理】凸透镜成像：物距小于焦距时成什么像？我写成倒立放大实像了 | 概念错
【数学】一次函数 y=kx+b，k>0 时图像过哪些象限？判断错了 | 概念错
【英语】一般过去时和现在完成时的区别，She has gone to / has been to 选错 | 方法错
【物理】沸腾的条件：水沸腾后继续加热温度还升高吗？ | 概念错
【数学】勾股定理应用题：直角三角形两直角边为 3 和 4，斜边算错成 6 | 计算错
【英语】被动语态：The room is cleaned / cleans every day，选错 | 方法错
【语文】病句：「通过这次活动，使我明白了道理」错在哪？ | 审题错`;

const REASON_COLORS: Record<string, string> = {
  计算错: '#f59e0b',
  概念错: '#ef4444',
  审题错: '#8b5cf6',
  方法错: '#3b82f6',
  其他: '#9ca3af',
};

export default function MistakesPage(): ReactNode {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'rule' | 'ai'>('rule');
  const [quota, setQuota] = useState<Record<string, QuotaInfo> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MistakeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/quota')
      .then((r) => r.json())
      .then((j) => setQuota(j?.quota || null))
      .catch(() => {});
  }, []);

  const run = useCallback(async () => {
    if (!text.trim()) {
      setError('请先粘贴错题内容（每行一条）。');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/mistakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j?.message || j?.error || `请求失败（${r.status}）`);
        if (j?.quota) setQuota(j.quota);
        return;
      }
      setQuota(j.quota || quota);
      setResult(j.result);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [text, mode, quota]);

  const maxCount = useCallback(
    (rec: Record<string, number>): number => Math.max(1, ...Object.values(rec)),
    [],
  );

  const copyReport = useCallback(() => {
    if (!result) return;
    const lines: string[] = [];
    lines.push('# 错题本分析报告');
    lines.push(`- 错题总数：${result.summary.total} 题（${result.mode === 'ai' ? 'AI 模式' : '规则模式'}）`);
    lines.push('- 科目分布：' + Object.entries(result.summary.subjects).map(([s, n]) => `${s} ${n}`).join('，'));
    lines.push('- 错因分布：' + Object.entries(result.summary.reasons).map(([r, n]) => `${r} ${n}`).join('，'));
    lines.push('');
    lines.push('## 薄弱知识点');
    result.weakPoints.forEach((w, i) => lines.push(`${i + 1}. ${w.subject}·${w.topic}（错 ${w.count} 次：${w.reasons.join('/')}）`));
    if (!result.weakPoints.length) lines.push('（未能自动匹配，请补充科目与知识点关键词）');
    lines.push('');
    lines.push('## 间隔复习计划');
    result.plan.forEach((p) => lines.push(`- 第${p.round}轮（+${p.day}天，${p.date}）：${p.subject}·${p.topic} — ${p.action}`));
    lines.push('');
    lines.push('## 建议');
    result.tips.forEach((t) => lines.push(`- ${t}`));
    if (result.practice?.length) {
      lines.push('');
      lines.push('## 针对性变式练习');
      result.practice.forEach((p, i) => {
        lines.push(`${i + 1}. 【${p.subject}·${p.topic}】${p.question}`);
        lines.push(`   答案：${p.answer}`);
      });
    }
    if (result.strategy?.length) {
      lines.push('');
      lines.push('## 复习策略');
      result.strategy.forEach((s) => lines.push(`- ${s}`));
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [result]);

  const reasonTotal = result ? Object.values(result.summary.reasons).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 20px 56px' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <a href="/learn" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          ← 学习助手
        </a>
        <span style={{ color: '#9ca3af' }}>/</span>
        <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 15 }}>错题本分析器</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {quota
            ? `今日剩余：规则 ${quota.rule?.remaining ?? '-'}/${quota.rule?.limit ?? '-'} · AI ${quota.ai?.remaining ?? '-'}/${quota.ai?.limit ?? '-'}`
            : ''}
        </span>
      </div>

      <h1 style={{ fontSize: 22, margin: '0 0 6px', color: '#1f2a44' }}>错题本分析器 📝</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, marginTop: 0, lineHeight: 1.7 }}>
        把错题逐条粘贴进来，自动按科目与错因归类、匹配知识库薄弱知识点，生成<b>间隔复习计划</b>
        （第 1/2/4/7/15/30 天）与针对性建议；AI 模式还会生成<b>变式练习卷</b>。
        可与站内「初二全科知识库」配合使用，错题归类后直接去核心知识卡复习。
      </p>

      {/* 输入区 */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: 16,
          background: '#fff',
          boxShadow: '0 1px 6px rgba(0,0,0,.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 14 }}>错题内容</span>
          <button
            onClick={() => setText(EXAMPLE)}
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
          placeholder={'每行一条错题，建议标注科目与错因，例如：\n【数学】全等三角形判定用错 | 概念错\n【物理】凸透镜成像规律记混 | 方法错'}
          style={{
            width: '100%',
            minHeight: 180,
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
          {/* 模式切换 */}
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#f8fafc',
            }}
          >
            <button
              onClick={() => setMode('rule')}
              style={{
                padding: '7px 14px',
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                color: mode === 'rule' ? '#fff' : '#64748b',
                background: mode === 'rule' ? '#2563eb' : 'transparent',
              }}
            >
              规则模式（推荐 · 0 token）
            </button>
            <button
              onClick={() => setMode('ai')}
              style={{
                padding: '7px 14px',
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                color: mode === 'ai' ? '#fff' : '#64748b',
                background: mode === 'ai' ? '#2563eb' : 'transparent',
              }}
            >
              AI 模式（生成练习卷）
            </button>
          </div>
          <button
            onClick={run}
            disabled={loading}
            style={{
              padding: '8px 22px',
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              background: loading ? '#93c5fd' : '#2563eb',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '分析中…' : mode === 'ai' ? 'AI 诊断 + 生成练习卷' : '开始分析'}
          </button>
          {error && (
            <span style={{ fontSize: 13, color: '#dc2626' }}>⚠ {error}</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '10px 0 0' }}>
          错题内容将发送到本站服务器做分析（规则模式 0 费用；AI 模式约 ¥0.05 一次，计入每日限额）。仅供自有/授权内容使用。
        </p>
      </div>

      {/* 结果区 */}
      {result && (
        <div ref={resultRef} style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 17 }}>分析报告</span>
            <button
              onClick={copyReport}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: copied ? '#059669' : '#2563eb',
                background: copied ? '#ecfdf5' : '#eff6ff',
                border: `1px solid ${copied ? '#a7f3d0' : '#bfdbfe'}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {copied ? '✓ 已复制' : '复制报告'}
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: '#9ca3af' }}>{result.note}</div>

          {/* 概览 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card title={`科目分布（共 ${result.summary.total} 题）`}>
              {Object.entries(result.summary.subjects).length === 0 && <Empty>未识别到科目</Empty>}
              {Object.entries(result.summary.subjects).map(([s, n]) => (
                <Bar key={s} label={s} value={n} max={maxCount(result.summary.subjects)} color="#2563eb" />
              ))}
            </Card>
            <Card title="错因分布">
              {reasonTotal === 0 && <Empty>未识别到错因</Empty>}
              {Object.entries(result.summary.reasons).map(([r, n]) => (
                <Bar key={r} label={r} value={n} max={maxCount(result.summary.reasons)} color={REASON_COLORS[r] || '#9ca3af'} />
              ))}
            </Card>
          </div>

          {/* 薄弱知识点 */}
          <Card title="薄弱知识点（按错误频次）">
            {result.weakPoints.length === 0 && <Empty>未能自动匹配知识点——在每条错题里写清涉及的概念（如「全等三角形」「凸透镜」）后重试。</Empty>}
            {result.weakPoints.map((w, i) => (
              <div
                key={`${w.subject}-${w.topic}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: i === 0 ? '#fef2f2' : '#f8fafc',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                    background: i === 0 ? '#dc2626' : '#94a3b8',
                    flex: 'none',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontWeight: 700, color: '#1f2a44', fontSize: 14 }}>
                  {w.subject} · {w.topic}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                  错 {w.count} 次 · {w.reasons.join('/')}
                </span>
              </div>
            ))}
          </Card>

          {/* 复习计划 */}
          <Card title="间隔复习计划（第 1/2/4/7/15/30 天 · 与知识库错题本一致）">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>轮次</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>日期</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>科目 · 知识点</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>任务</th>
                  </tr>
                </thead>
                <tbody>
                  {result.plan.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', color: '#64748b' }}>
                        第{p.round}轮 (+{p.day}天)
                      </td>
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', color: '#1f2a44' }}>{p.date}</td>
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                        <b style={{ color: '#1f2a44' }}>{p.subject}</b> · {p.topic}
                      </td>
                      <td style={{ padding: '7px 8px', color: '#475569' }}>{p.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.plan.length === 0 && <Empty>暂无复习计划——先补充错题。</Empty>}
          </Card>

          {/* AI 练习卷 */}
          {result.practice && result.practice.length > 0 && (
            <Card title="针对性变式练习（AI 生成）">
              {result.practice.map((p, i) => (
                <div key={i} style={{ marginBottom: 14, padding: 12, background: '#f8fafc', borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2a44', marginBottom: 6 }}>
                    {i + 1}. 【{p.subject} · {p.topic}】
                  </div>
                  <div style={{ fontSize: 13.5, color: '#1f2a44', lineHeight: 1.7 }}>{p.question}</div>
                  <div style={{ fontSize: 12.5, color: '#059669', marginTop: 6, background: '#ecfdf5', padding: '8px 10px', borderRadius: 8 }}>
                    <b>答案：</b>{p.answer}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* AI 策略 */}
          {result.strategy && result.strategy.length > 0 && (
            <Card title="复习策略（AI 生成）">
              {result.strategy.map((s, i) => (
                <div key={i} style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.8, marginBottom: 6 }}>
                  {i + 1}. {s}
                </div>
              ))}
            </Card>
          )}

          {/* 建议 */}
          <Card title="自动建议">
            {result.tips.map((t, i) => (
              <div key={i} style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.8, marginBottom: 6 }}>
                • {t}
              </div>
            ))}
          </Card>

          {/* 知识库联动 */}
          {result.kbLinks.length > 0 && (
            <Card title="去知识库复习">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.kbLinks.map((l) => (
                  <a
                    key={l.subject}
                    href={l.href}
                    target="_blank"
                    rel="noopener"
                    style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#2563eb',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 10,
                      textDecoration: 'none',
                    }}
                  >
                    📚 {l.subject} 核心知识卡 →
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 16,
        background: '#fff',
        boxShadow: '0 1px 6px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ fontWeight: 700, color: '#1f2a44', fontSize: 14.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <span style={{ width: 52, fontSize: 12.5, color: '#475569', flex: 'none' }}>{label}</span>
      <div style={{ flex: 1, height: 16, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.max(pct, value > 0 ? 6 : 0)}%`,
            height: '100%',
            background: color,
            borderRadius: 8,
            transition: 'width .4s ease',
          }}
        />
      </div>
      <span style={{ width: 26, fontSize: 12.5, fontWeight: 700, color: '#1f2a44', flex: 'none', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>{children}</div>;
}
