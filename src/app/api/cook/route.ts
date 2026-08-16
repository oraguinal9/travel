import { NextRequest, NextResponse } from 'next/server';
import { createTask, updateTask } from '@/lib/taskStore';
import { planWeek } from '@/lib/cookAgent';
import {
  getIdentity,
  getCookieName,
  getCookieMaxAge,
  checkQuota,
  consume,
  type PlanMode,
} from '@/lib/rateLimit';
import type { CookRequest } from '@/types/recipe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: CookRequest;
  try {
    body = (await req.json()) as CookRequest;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.days || body.days < 1) body.days = 7;
  if (!body.people) body.people = 2;
  if (!body.max_minutes) body.max_minutes = 60;
  if (body.new_freq == null) body.new_freq = 0.3;
  if (!body.spicy) body.spicy = '随便';
  if (!body.dishes || body.dishes < 2) body.dishes = 3;
  body.avoid = body.avoid || [];

  // 模式判定：显式 rule，或没配 DeepSeek → 规则模式（0 token）；否则 AI
  const mode: PlanMode = body.mode === 'rule' || !process.env.DEEPSEEK_API_KEY ? 'rule' : 'ai';

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

  consume(idn.uid, mode);
  const needSetCookie = !idn.fromCookie;

  const task = createTask();
  (async () => {
    try {
      updateTask(task.id, {
        stage: 'planning',
        message: mode === 'rule' ? '免 DeepSeek 规则模式：从菜谱库排一周…' : 'AI 正在排一周菜谱…',
        progress: 20,
      });
      const res = await planWeek(body, (stage, message, progress) =>
        updateTask(task.id, { stage, message, progress: Math.max(progress, 20) }),
      );
      updateTask(task.id, {
        status: 'completed',
        progress: 100,
        stage: 'completed',
        message: mode === 'rule' ? '免 DeepSeek 规则模式（0 token）' : '完成',
        result: res.plan,
        usage: res.usage
          ? {
              inputTokens: res.usage.input,
              outputTokens: res.usage.output,
              totalTokens: res.usage.input + res.usage.output,
              costYuan: res.usage.cost,
              peak: res.usage.peak,
            }
          : undefined,
        demo: mode === 'rule',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateTask(task.id, { status: 'failed', message: '规划失败', error: msg });
    }
  })();

  const resp = NextResponse.json({ task_id: task.id });
  if (needSetCookie) {
    resp.cookies.set(getCookieName(), idn.uid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    });
  }
  return resp;
}
