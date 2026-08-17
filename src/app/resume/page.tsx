'use client';

import { useState } from 'react';

interface Suggestion {
  point: string;
  detail: string;
  severity: '高' | '中' | '低';
}
interface ImprovedSection {
  section: string;
  content: string;
}
interface ResumeResult {
  mode: 'ai' | 'rule';
  score: number;
  suggestions: Suggestion[];
  improved?: ImprovedSection[];
  note: string;
}

const BLUE = '#185fa5';
const SEV: Record<Suggestion['severity'], { color: string; bg: string }> = {
  高: { color: '#c0392b', bg: '#fdecea' },
  中: { color: '#b9770e', bg: '#fef5e7' },
  低: { color: '#1e8449', bg: '#eafaf1' },
};

function severityRank(s: Suggestion['severity']): number {
  return s === '高' ? 0 : s === '中' ? 1 : 2;
}

export default function ResumePage() {
  const [resume, setResume] = useState('');
  const [jd, setJd] = useState('');
  const [focus, setFocus] = useState('');
  const [mode, setMode] = useState<'ai' | 'rule'>('rule');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResumeResult | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, jd, focus, mode }),
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

  const sortedSug = result ? [...result.suggestions].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)) : [];

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, color: BLUE, margin: '0 0 4px' }}>AI 简历优化器</h1>
      <p style={{ color: '#666', margin: '0 0 20px' }}>
        粘贴简历 + 目标岗位 JD，一键给出优化建议与改写稿。规则模式免 AI（0 token），AI 模式更懂你的岗位。
      </p>

      <div
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          padding: 18,
          marginBottom: 18,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 6, fontWeight: 600 }}>
            简历原文（必填）
          </div>
          <textarea
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="粘贴你的简历内容，越完整建议越准……"
            style={{
              width: '100%',
              minHeight: 200,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
              lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 6, fontWeight: 600 }}>
            目标岗位 JD（可选，给出后按岗位匹配度给分）
          </div>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="粘贴招聘要求 / 岗位描述，用于关键词匹配与针对性优化……"
            style={{
              width: '100%',
              minHeight: 110,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
              lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 6, fontWeight: 600 }}>
            聚焦方向（可选，如「突出管理能力」「转向数据方向」）
          </div>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="希望重点突出什么？"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 6, fontWeight: 600 }}>生成模式</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['rule', 'ai'] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
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
                  {m === 'rule' ? '规则（0 token）' : 'AI（更个性化）'}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={loading || resume.trim().length < 30}
          style={{
            marginTop: 8,
            padding: '12px 28px',
            borderRadius: 10,
            border: 'none',
            background: BLUE,
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: loading || resume.trim().length < 30 ? 'default' : 'pointer',
            opacity: loading || resume.trim().length < 30 ? 0.6 : 1,
          }}
        >
          {loading ? '分析中…' : '优化简历'}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                background: '#eef5fc',
                border: `3px solid ${BLUE}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 800, color: BLUE }}>{result.score}</span>
              <span style={{ fontSize: 11, color: '#888' }}>评分</span>
            </div>
            <div style={{ color: '#555', fontSize: 14, flex: 1 }}>
              {result.note}
              {usage && (
                <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
                  本次消耗 {usage.totalTokens} tokens · 约 ¥{usage.costYuan}
                </div>
              )}
              {!usage && <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>(规则模式 · 0 token)</div>}
            </div>
          </div>

          {/* AI 改写稿 */}
          {result.improved && result.improved.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: BLUE, margin: '0 0 10px' }}>AI 改写稿</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {result.improved.map((s, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 700, color: BLUE, marginBottom: 8 }}>{s.section}</div>
                    <div style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{s.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 优化建议 */}
          <h2 style={{ fontSize: 17, color: BLUE, margin: '0 0 10px' }}>
            优化建议（{result.suggestions.length} 条）
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedSug.map((s, i) => {
              const sev = SEV[s.severity];
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, display: 'flex', gap: 12 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: sev.color,
                      background: sev.bg,
                      borderRadius: 6,
                      padding: '2px 10px',
                      height: 'fit-content',
                      flexShrink: 0,
                    }}
                  >
                    {s.severity}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#333', marginBottom: 4 }}>{s.point}</div>
                    <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>{s.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
