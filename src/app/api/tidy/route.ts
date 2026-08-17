import { NextRequest, NextResponse } from 'next/server';
import { getIdentity, getCookieName, getCookieMaxAge, checkQuota, consume, type PlanMode } from '@/lib/rateLimit';
import { parseList, planTidyRule, planTidyAI } from '@/lib/tidyAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: '请粘贴文件列表' }, { status: 400 });
  }
  if (text.length > 50000) {
    return NextResponse.json({ error: '文件列表过长（上限 5 万字符）' }, { status: 400 });
  }

  const aiWanted = body.mode === 'ai' && !!process.env.DEEPSEEK_API_KEY;
  const mode: PlanMode = aiWanted ? 'ai' : 'rule';

  const { uid, fromCookie } = getIdentity(req);
  const q = checkQuota(uid, mode);
  if (!q.allowed) {
    const res = NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: `今日${mode === 'ai' ? 'AI' : '规则'}模式次数已用完（${q.limit} 次/天），明天重置。` },
      { status: 429 }
    );
    return res;
  }

  const files = parseList(text);
  if (!files.length) {
    return NextResponse.json({ error: '未解析到文件（每行一个路径）' }, { status: 400 });
  }

  consume(uid, mode);

  let result: any;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    if (mode === 'ai') {
      const r = await planTidyAI(files);
      result = r.result;
      inputTokens = r.inputTokens;
      outputTokens = r.outputTokens;
    } else {
      result = planTidyRule(files);
    }
  } catch (e: any) {
    return NextResponse.json({ error: '分析失败：' + (e?.message || '未知错误') }, { status: 500 });
  }

  const cost = ((inputTokens + outputTokens) * 0.0).toFixed(4); // 占位，实际费用在结果页按峰谷估算
  const res = NextResponse.json({
    result,
    usage: { inputTokens, outputTokens, mode },
  });
  if (!fromCookie) {
    res.cookies.set(getCookieName(), uid, { maxAge: getCookieMaxAge(), path: '/' });
  }
  return res;
}
