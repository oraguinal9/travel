'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import DayCard from '@/components/DayCard';
import BudgetPanel from '@/components/BudgetPanel';
import MapView from '@/components/MapView';
import { speak, stop, planToSpeech, prepareVoices, isTtsSupported } from '@/lib/tts';
import type { TokenUsage } from '@/types/itinerary';

interface Task {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  result?: any;
  demo?: boolean;
  usage?: TokenUsage;
}

export default function PlanPage() {
  const { id } = useParams() as { id: string };
  const [task, setTask] = useState<Task | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    prepareVoices(); // 提前预热语音列表（异步加载）
    return () => stop(); // 离开页面时停止朗读
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const t = await fetch(`/api/plan/${id}`).then((r) => r.json());
      setTask(t);
      if (t.status === 'processing') timer = setTimeout(poll, 3000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [id]);

  if (!task) return <p style={{ padding: 40 }}>加载中…</p>;
  if (task.status === 'processing')
    return <p style={{ padding: 40 }}>规划中：{task.message}（{task.progress || 0}%）</p>;
  if (task.status === 'failed') return <p style={{ padding: 40 }}>规划失败：{task.error}</p>;

  const plan = task.result;
  return (
    <>
      {task.demo && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: '#fff7e6',
            border: '1px solid #ffd591',
            color: '#ad6800',
            padding: '8px 16px',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          免 DeepSeek 规则模式：行程由高德真实 POI + 高德路线耗时 + Open-Meteo 真实天气拼装（0 token，非 AI 规划）。
        </div>
      )}
    <main style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, maxWidth: 1100, margin: '24px auto', padding: '0 16px' }}>
      <div>
        <h2 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {plan.city} {plan.days.length}天 · 预算 ¥{plan.budget?.total}
          {!task.demo && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: '2px 10px',
                borderRadius: 999,
                border: '1px solid #b7eb8f',
                background: '#f6ffed',
                color: '#389e0d',
              }}
            >
              AI 规划
            </span>
          )}
        </h2>
        <p style={{ color: '#666' }}>{plan.overall_suggestions}</p>
        {task.usage && (
          <div
            style={{
              fontSize: 12,
              color: '#1677ff',
              background: '#e6f4ff',
              border: '1px solid #91caff',
              borderRadius: 8,
              padding: '6px 12px',
              display: 'inline-block',
              marginBottom: 8,
            }}
          >
            本次消耗 {task.usage.totalTokens.toLocaleString()} tokens（输入 {task.usage.inputTokens.toLocaleString()} · 输出 {task.usage.outputTokens.toLocaleString()}）· 约 ¥{task.usage.costYuan.toFixed(2)}
            {task.usage.peak ? '（峰值时段计价）' : '（空闲时段计价）'}
          </div>
        )}
        {plan.days.map((d: any, i: number) => (
          <DayCard key={i} day={d} />
        ))}
      </div>
      <div>
        <MapView plan={plan} />
        <BudgetPanel budget={plan.budget} />
        <button
          style={{ marginTop: 16, width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', background: speaking ? '#ffe9e9' : 'transparent', cursor: 'pointer' }}
          disabled={!isTtsSupported()}
          onClick={() => {
            if (speaking) {
              stop();
              setSpeaking(false);
            } else {
              setSpeaking(true);
              speak(planToSpeech(plan), () => setSpeaking(false));
            }
          }}
        >
          {speaking ? '⏹ 停止朗读' : '🔊 念给我听'}
        </button>
        {!isTtsSupported() && (
          <p style={{ fontSize: 12, color: '#999' }}>当前浏览器不支持语音合成（speechSynthesis）</p>
        )}
      </div>
    </main>
    </>
  );
}
