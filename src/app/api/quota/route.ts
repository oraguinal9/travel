import { NextRequest, NextResponse } from 'next/server';
import {
  getIdentity,
  getCookieName,
  getCookieMaxAge,
  snapshotQuota,
} from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// 返回当前身份的每日剩余配额，供前端显示「今日剩 X 次」并据此禁用按钮
export async function GET(req: NextRequest) {
  const idn = getIdentity(req);
  const quota = snapshotQuota(idn.uid);

  const resp = NextResponse.json({ quota, identity: idn.uid });
  // 无 cookie 时种下匿名身份（与本次快照同一 uid），后续请求即可稳定计数
  if (!idn.fromCookie) {
    resp.cookies.set(getCookieName(), idn.uid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    });
  }
  return resp;
}
