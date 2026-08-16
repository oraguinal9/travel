import { NextRequest, NextResponse } from 'next/server';
import { createTask, updateTask } from '@/lib/taskStore';
import { planTrip, demoPlan } from '@/lib/agent';
import {
  getIdentity,
  getCookieName,
  getCookieMaxAge,
  checkQuota,
  consume,
  type PlanMode,
} from '@/lib/rateLimit';
import type { PlanRequest } from '@/types/itinerary';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: PlanRequest;
  try {
    body = (await req.json()) as PlanRequest;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.city || !body.travel_days) {
    return NextResponse.json({ error: 'city 和 travel_days 必填' }, { status: 400 });
  }

  // 模式判定：显式选 rule，或没配 DeepSeek → 规则模式（0 token）；否则 AI 模式（花钱）
  const mode: PlanMode = body.mode === 'rule' || !process.env.DEEPSEEK_API_KEY ? 'rule' : 'ai';

  // 身份与每日配额
  const idn = getIdentity(req);
  const quota = checkQuota(idn.uid, mode);
  if (!quota.allowed) {
    const message =
      mode === 'ai'
        ? `AI 规划今日已用完（${quota.limit} 次/天）。可改用「免 DeepSeek 规则模式」，或明天再来。`
        : `规则模式今日已用完（${quota.limit} 次/天），明天再来吧。`;
    return NextResponse.json(
      {
        error: '今日试用次数已用完',
        code: 'QUOTA_EXCEEDED',
        mode,
        remaining: 0,
        limit: quota.limit,
        date: quota.date,
        message,
      },
      { status: 429 },
    );
  }

  // 请求被接受即消耗一次配额（含后续失败，防止失败重试刷额度）
  consume(idn.uid, mode);
  const needSetCookie = !idn.fromCookie;

  const task = createTask();
  // 异步执行，立即返回 task_id，避免长生成导致 504
  (async () => {
    try {
      updateTask(task.id, {
        stage: 'planning',
        message: mode === 'rule' ? '免 DeepSeek 规则模式：拉取高德真实景点…' : '正在规划行程…',
        progress: 20,
      });
      // 进度单调递增（agent 可能循环调用工具，避免进度条回退显得卡顿）
      let lastProgress = 20;
      const res =
        mode === 'rule'
          ? { plan: await demoPlan(body), usage: undefined }
          : await planTrip(body, (stage, message, progress) => {
              lastProgress = Math.max(lastProgress, progress);
              updateTask(task.id, { stage, message, progress: lastProgress });
            });
      updateTask(task.id, {
        status: 'completed',
        progress: 100,
        stage: 'completed',
        message: mode === 'rule' ? '免 DeepSeek 规则模式（0 token）' : '完成',
        result: res.plan,
        usage: res.usage,
        demo: mode === 'rule',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateTask(task.id, { status: 'failed', message: '规划失败', error: msg });
    }
  })();

  const resp = NextResponse.json({ task_id: task.id });
  if (needSetCookie) {
    // 关键：cookie 写入与本次 consume 完全相同的 uid，否则计数会落到丢弃的临时身份上
    resp.cookies.set(getCookieName(), idn.uid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    });
  }
  return resp;
}
