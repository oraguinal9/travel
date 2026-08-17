import { NextRequest, NextResponse } from 'next/server';
import { generateNames, type NameRequest, type NameCategory } from '@/lib/nameAgent';
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

  const category: NameCategory = ['baby', 'brand', 'pet'].includes(body.category)
    ? body.category
    : 'baby';
  const count = Math.max(3, Math.min(20, Number(body.count) || 8));
  const mode: PlanMode = body.mode === 'rule' || !process.env.DEEPSEEK_API_KEY ? 'rule' : 'ai';

  const idn = getIdentity(req);
  const quota = checkQuota(idn.uid, mode);
  if (!quota.allowed) {
    const message =
      mode === 'ai'
        ? `AI 起名今日已用完（${quota.limit} 次/天）。可改用「规则模式」，或明天再来。`
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

  const reqBody: NameRequest = {
    category,
    mode,
    count,
    gender: body.gender,
    style: body.style,
    surname: body.surname,
    keywords: body.keywords,
    industry: body.industry,
    petType: body.petType,
    free_text: body.free_text,
  };

  try {
    const { result, usage } = await generateNames(reqBody);
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
