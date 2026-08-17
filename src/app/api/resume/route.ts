import { NextRequest, NextResponse } from 'next/server';
import { optimizeResume } from '@/lib/resumeAgent';
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

  const resume = typeof body.resume === 'string' ? body.resume : '';
  const jd = typeof body.jd === 'string' ? body.jd : '';
  const focus = typeof body.focus === 'string' ? body.focus : '';
  if (resume.trim().length < 30) {
    return NextResponse.json(
      { error: '简历内容太少', message: '请粘贴至少一段简历内容（30 字以上）再优化。' },
      { status: 400 },
    );
  }

  const mode: PlanMode = body.mode === 'rule' || !process.env.DEEPSEEK_API_KEY ? 'rule' : 'ai';

  const idn = getIdentity(req);
  const quota = checkQuota(idn.uid, mode);
  if (!quota.allowed) {
    const message =
      mode === 'ai'
        ? `AI 优化今日已用完（${quota.limit} 次/天）。可改用「规则模式」，或明天再来。`
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

  try {
    const { result, usage } = await optimizeResume({ resume, jd, focus, mode });
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
    return NextResponse.json({ error: '生成失败', message: msg }, { status: 500 });
  }
}
