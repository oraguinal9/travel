import { NextRequest, NextResponse } from 'next/server';
import { getIdentity, getCookieName, getCookieMaxAge } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// 移动端 UA：抖音网页视频页是 SSR，带浏览器 UA 才能拿到 RENDER_DATA
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

// 轻量每日上限（复用 ta_uid 身份），防止被当免费代理滥用
const PARSE_DAILY = 30;
const PROXY_DAILY = 100;
const dstore: Map<string, { date: string; n: number }> =
  (globalThis as unknown as { __dyQuota?: Map<string, { date: string; n: number }> }).__dyQuota ||
  ((globalThis as unknown as { __dyQuota?: Map<string, { date: string; n: number }> }).__dyQuota = new Map());

function dyToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dyCheck(uid: string, cap: number) {
  const t = dyToday();
  let c = dstore.get(uid);
  if (!c || c.date !== t) {
    c = { date: t, n: 0 };
    dstore.set(uid, c);
  }
  return { left: cap - c.n, bump: () => (c!.n += 1) };
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0] : null;
}

async function resolveShort(link: string): Promise<string> {
  try {
    const r = await fetch(link, { redirect: 'follow', headers: { 'User-Agent': UA } });
    return r.url || link;
  } catch {
    return link;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  return r.text();
}

function parseRender(html: string): any {
  const m = html.match(/<script id="RENDER_DATA" type="application\/json">([^<]+)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

// 兜底：当页面是 SPA 壳、拿不到 RENDER_DATA 时，直接从原始 HTML 里扫出候选播放地址
function candidateUrlsFromHtml(html: string): string[] {
  const urls = html.match(/https?:\/\/[^\s"'\\<>]+/g) || [];
  return urls.filter(
    (u) =>
      /(snssdk\.com|douyin\.com|\.bytecdn|\.bytedance)/i.test(u) &&
      /play|aweme|video|download|\.mp4/i.test(u),
  );
}

// 在任意嵌套对象里收集指定 key 的值
function dig(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((o) => dig(o, key, out));
    return out;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) out.push(obj[k]);
    dig(obj[k], key, out);
  }
  return out;
}

function firstUrl(v: any): string | null {
  if (typeof v === 'string') return v;
  if (v && Array.isArray(v.url_list) && v.url_list.length) return v.url_list[0];
  return null;
}

// 抖音经典 trick：播放地址里的 playwm -> play 即去水印
function noWm(u: string | null): string | null {
  return u ? u.replace(/playwm/gi, 'play') : u;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '无效的请求' }, { status: 400 });
  }
  const link = (body && body.link) || '';
  const url = extractUrl(link);
  if (!url) {
    return NextResponse.json({ ok: false, error: '未识别到抖音链接，请粘贴分享链接' }, { status: 400 });
  }

  const idn = getIdentity(req);
  const q = dyCheck(idn.uid, PARSE_DAILY);
  if (q.left <= 0) {
    const resp = NextResponse.json(
      { ok: false, error: `今日解析次数已用完（${PARSE_DAILY} 次/天）` },
      { status: 429 },
    );
    if (!idn.fromCookie) setUidCookie(resp, idn.uid);
    return resp;
  }

  try {
    let pageUrl = url;
    if (pageUrl.includes('v.douyin.com')) pageUrl = await resolveShort(pageUrl);
    const html = await fetchHtml(pageUrl);
    const rd = parseRender(html);
    if (!rd) {
      return NextResponse.json(
        { ok: false, error: '解析失败：未取到视频数据（抖音可能启用了验证/反爬，稍后再试）' },
        { status: 422 },
      );
    }
    const playApi = noWm(firstUrl(dig(rd, 'playApi')[0]));
    const downloadAddr = noWm(firstUrl(dig(rd, 'downloadAddr')[0]));
    const playAddr = noWm(firstUrl(dig(rd, 'playAddr')[0]));
    const title = (dig(rd, 'desc')[0] as string) || '';
    const coverObj = dig(rd, 'cover')[0];
    const cover = coverObj ? firstUrl(coverObj) : null;
    let clean = playApi || downloadAddr || playAddr;
    if (!clean) {
      // 兜底：从原始 HTML 扫描候选播放地址
      const cands = candidateUrlsFromHtml(html).map(noWm).filter(Boolean);
      clean = cands[0] || null;
    }
    if (!clean) {
      return NextResponse.json({ ok: false, error: '未提取到视频地址' }, { status: 422 });
    }
    q.bump();
    const resp = NextResponse.json({
      ok: true,
      title,
      cover,
      cleanUrl: clean,
      candidates: { playApi, downloadAddr, playAddr },
    });
    if (!idn.fromCookie) setUidCookie(resp, idn.uid);
    return resp;
  } catch (e: any) {
    const resp = NextResponse.json(
      { ok: false, error: e?.message || '解析异常' },
      { status: 500 },
    );
    if (!idn.fromCookie) setUidCookie(resp, idn.uid);
    return resp;
  }
}

function setUidCookie(resp: NextResponse, uid: string) {
  resp.cookies.set(getCookieName(), uid, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: getCookieMaxAge(),
    path: '/',
  });
}

// GET 用于代理下载/预览：?dl=<url> 附件下载，?stream=<url> 内联播放
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const target = sp.get('dl') || sp.get('stream');
  if (!target) return NextResponse.json({ error: 'missing target' }, { status: 400 });

  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }
  const hostOk = /(^|\.)(douyin\.com|snssdk\.com|bytecdn\.com|bytedance\.com|ixigua\.com|toutiao\.com)$/i.test(
    u.hostname,
  );
  if (!hostOk) return NextResponse.json({ error: 'host not allowed' }, { status: 400 });

  const idn = getIdentity(req);
  const q = dyCheck(idn.uid, PROXY_DAILY);
  if (q.left <= 0) {
    return NextResponse.json({ error: `今日代理次数已用完（${PROXY_DAILY} 次/天）` }, { status: 429 });
  }

  const isDl = !!sp.get('dl');
  const range = req.headers.get('range') || undefined;
  const hd: Record<string, string> = { 'User-Agent': UA, Referer: 'https://www.douyin.com/' };
  if (range) hd['Range'] = range;

  try {
    const r = await fetch(target, { redirect: 'follow', headers: hd });
    if (!r.ok && r.status !== 206) {
      return NextResponse.json({ error: 'upstream ' + r.status }, { status: 502 });
    }
    q.bump();
    const out: Record<string, string> = {
      'Content-Type': r.headers.get('content-type') || 'video/mp4',
      'Cache-Control': 'no-store',
      'Content-Disposition': isDl ? 'attachment; filename="douyin_no_wm.mp4"' : 'inline',
    };
    const cr = r.headers.get('content-range');
    if (cr) out['Content-Range'] = cr;
    const cl = r.headers.get('content-length');
    if (cl) out['Content-Length'] = cl;
    const ar = r.headers.get('accept-ranges');
    if (ar) out['Accept-Ranges'] = ar;
    return new NextResponse(r.body, { status: r.status, headers: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'fetch failed' }, { status: 502 });
  }
}
