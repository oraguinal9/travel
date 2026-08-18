import { NextRequest, NextResponse } from 'next/server';
import { analyzeMistakes, type MistakeMode } from '@/lib/mistakeAgent';
import {
  getIdentity,
  getCookieName,
  getCookieMaxAge,
  checkQuota,
  consume,
  snapshotQuota,
  type PlanMode,
} from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: '请粘贴错题内容（每行一条）' }, { status: 400 });
  }
  if (text.length > 8000) {
    return NextResponse.json({ error: '内容过长，请控制在 8000 字以内' }, { status: 400 });
  }
  const mode: MistakeMode =
    body.mode === 'rule' || !process.env.DEEPSEEK_API_KEY ? 'rule' : 'ai';
  const planMode: PlanMode = mode;

  const idn = getIdentity(req);
  const quota = checkQuota(idn.uid, planMode);
  if (!quota.allowed) {
    const message =
      mode === 'ai'
        ? `AI 练习卷今日已用完（${quota.limit} 次/天）。可改用「规则模式」查看薄弱点与复习计划，或明天再来。`
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
  consume(idn.uid, planMode);
  const needSetCookie = !idn.fromCookie;

  try {
    const { result, usage } = await analyzeMistakes(text, mode);
    const quotaAfter = snapshotQuota(idn.uid);
    const resp = NextResponse.json({
      result,
      usage: usage
        ? {
            inputTokens: usage.input,
            outputTokens: usage.output,
            totalTokens: usage.input + usage.output,
            costYuan: usage.cost,
            peak: usage.peak,
          }
        : undefined,
      demo: mode === 'rule',
      quota: quotaAfter,
    });
    if (needSetCookie) {
      resp.cookies.set(getCookieName(), idn.uid, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: getCookieMaxAge(),
        path: '/',
      });
    }
    return resp;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '分析失败', message: msg }, { status: 500 });
  }
}
