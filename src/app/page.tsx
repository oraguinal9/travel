'use client';

// 防止首页被 Next 当静态页缓存（否则前端 JS 更新后浏览器仍跑旧 bundle，导致 Server Action 版本错配、页面白屏）
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlanForm, { type QuotaInfo } from '@/components/PlanForm';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); // AI 请求已等待秒数，用于排队提示
  const abortRef = useRef<AbortController | null>(null);

  async function loadQuota() {
    try {
      const r = await fetch('/api/quota');
      const d = await r.json();
      if (d.quota) setQuota(d.quota);
    } catch {
      /* 配额查询失败不影响主流程，仅不显示剩余次数 */
    }
  }

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setLlmEnabled(!!d.llmEnabled))
      .catch(() => setLlmEnabled(null));
    loadQuota();
  }, []);

  async function onSubmit(req: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setElapsed(0);
    // 每秒更新等待时长，用于「排队中」提示（DeepSeek 高峰期可达 60s+）
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    // 75s 前端超时（后端 90s 兜底），避免无限转圈
    const ac = new AbortController();
    abortRef.current = ac;
    const timeoutId = setTimeout(() => ac.abort(), 75000);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ac.signal,
      });
      if (!res.ok) {
        // 429 = 今日试用次数用完
        const d = await res.json().catch(() => ({}));
        setError(d.message || (res.status === 429 ? '今日试用次数已用完，明天再来吧。' : '生成失败，请重试。'));
        setLoading(false);
        loadQuota(); // 刷新剩余次数
        return;
      }
      const { task_id } = await res.json();
      router.push(`/plan/${task_id}`);
    } catch (e) {
      if (ac.signal.aborted) {
        setError('请求超时（75 秒）：DeepSeek 高峰期排队较久，请稍后重试，或改用「规则模式」即时出结果。');
      } else {
        setError(e instanceof Error ? `请求失败：${e.message}` : '网络异常，请重试。');
      }
      setLoading(false);
    } finally {
      clearInterval(timer);
      clearTimeout(timeoutId);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>一句话规划旅行</h1>
      <p style={{ color: '#666', marginTop: 8 }}>
        AI 帮你排好带地图和预算的旅行行程
      </p>

      {llmEnabled !== null && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 12,
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: 13,
            border: `1px solid ${llmEnabled ? '#b7eb8f' : '#ffd591'}`,
            background: llmEnabled ? '#f6ffed' : '#fff7e6',
            color: llmEnabled ? '#389e0d' : '#ad6800',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: llmEnabled ? '#52c41a' : '#fa8c16',
              display: 'inline-block',
            }}
          />
          {llmEnabled ? 'AI 规划可用（默认走免费规则模式，可手动切换）' : '预览模式（未配置 DeepSeek，使用真实高德数据拼装）'}
        </div>
      )}

      {quota && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
          今日剩余：AI 智能规划 <b>{quota.ai.remaining}</b> / {quota.ai.limit} 次 · 免 DeepSeek 规则{' '}
          <b>{quota.rule.remaining}</b> / {quota.rule.limit} 次
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <PlanForm
          onSubmit={onSubmit}
          loading={loading}
          defaultMode="rule"
          llmEnabled={llmEnabled}
          quota={quota}
          error={error}
        />
        {/* DeepSeek 排队提示：避免用户误以为卡死 */}
        {loading && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.7,
              color: '#ad6800',
              background: '#fff7e6',
              border: '1px solid #ffd591',
            }}
          >
            {elapsed < 15
              ? 'AI 生成中，通常需要 10-30 秒…'
              : elapsed < 45
                ? 'DeepSeek 高峰期排队中，已等待 ' + elapsed + ' 秒，请再耐心等一会儿…'
                : '排队较久（' + elapsed + ' 秒）。若继续等待可能超时，可考虑改用「规则模式」即时出结果。'}
          </div>
        )}
      </div>
    </main>
  );
}
