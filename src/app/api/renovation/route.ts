import { NextRequest, NextResponse } from 'next/server';
import { generateRenovation, type RenovInput, type Tier, type Grade, type StyleKey } from '@/lib/renovationAgent';
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

const TIERS: Tier[] = ['t1', 't15', 't2', 't3'];
const GRADES: Grade[] = ['economy', 'standard', 'premium', 'luxury'];
const STYLES: StyleKey[] = ['modern', 'nordic', 'chinese', 'american', 'japanese'];

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const area = Math.max(20, Math.min(1000, Number(body.area) || 0));
  if (!area || area < 20) {
    return NextResponse.json({ error: '请填写有效的建筑面积（20-1000㎡）' }, { status: 400 });
  }
  const tier: Tier = TIERS.includes(body.tier) ? body.tier : 't2';
  const grade: Grade = GRADES.includes(body.grade) ? body.grade : 'standard';
  const style: StyleKey = STYLES.includes(body.style) ? body.style : 'modern';
  const bedrooms = Math.max(1, Math.min(6, Math.round(Number(body.bedrooms)) || 3));
  const livingRooms = Math.max(1, Math.min(3, Math.round(Number(body.livingRooms)) || 1));
  const bathrooms = Math.max(1, Math.min(4, Math.round(Number(body.bathrooms)) || 2));
  const mode: PlanMode = body.mode === 'rule' || !process.env.DEEPSEEK_API_KEY ? 'rule' : 'ai';

  const idn = getIdentity(req);
  const quota = checkQuota(idn.uid, mode);
  if (!quota.allowed) {
    const message =
      mode === 'ai'
        ? `AI 深度建议今日已用完（${quota.limit} 次/天）。可改用「规则模式」查看预算清单，或明天再来。`
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

  const reqBody: RenovInput = { area, tier, grade, style, bedrooms, livingRooms, bathrooms, mode };

  try {
    const { result, usage } = await generateRenovation(reqBody);
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
