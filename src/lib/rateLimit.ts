// 轻量级每日配额（进程内；单实例 PM2 足够。进程重启会归零，对本 Demo 可接受）
//
// 限制维度：匿名身份 cookie（ta_uid），无 cookie 时按请求生成一个随机身份并写回 cookie。
// 这样普通浏览器用户会被稳定计数；忽略 cookie 的脚本类请求由 nginx limit_req 兜底拦刷。
//
// 配额：AI 模式（真花钱调 DeepSeek）严；规则模式（仅高德+天气）宽松。

// 规划模式：'ai' = 调用 DeepSeek；'rule' = 免 DeepSeek 规则拼装
export type PlanMode = 'ai' | 'rule';

// 每日每身份配额（计数为 used < limit，故 ai:2 即允许 2 次/天）
export const QUOTA: Record<PlanMode, number> = {
  ai: 2, // AI 规划：每身份每天 2 次（按 DeepSeek 峰谷计价，约 ¥0.05/次）
  rule: 5, // 规则模式：每身份每天 5 次（免 DeepSeek，仅高德+天气）
};

const COOKIE_NAME = 'ta_uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

interface DayCount {
  date: string; // 服务器时区的 YYYY-MM-DD
  ai: number;
  rule: number;
}

// 用 globalThis 持久化，避免 Next 各 route 独立打包导致模块级 Map 不共享
const store: Map<string, DayCount> =
  (globalThis as unknown as { __taQuota?: Map<string, DayCount> }).__taQuota ||
  ((globalThis as unknown as { __taQuota?: Map<string, DayCount> }).__taQuota = new Map<string, DayCount>());

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 清理非今天的旧记录，避免内存无限增长
function sweep(): void {
  const t = today();
  for (const [k, v] of store) {
    if (v.date !== t) store.delete(k);
  }
}

// 解析请求身份：优先 cookie，否则生成随机身份（调用方负责写回 cookie）
export function getIdentity(req: Request): { uid: string; fromCookie: boolean } {
  const cookieHeader = req.headers.get('cookie') || '';
  const m = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (m && m[1]) return { uid: m[1], fromCookie: true };
  return { uid: genUid(), fromCookie: false };
}

export function genUid(): string {
  return 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function getCookieMaxAge(): number {
  return COOKIE_MAX_AGE;
}

function ensureToday(uid: string): DayCount {
  const t = today();
  let c = store.get(uid);
  if (!c || c.date !== t) {
    c = { date: t, ai: 0, rule: 0 };
    store.set(uid, c);
  }
  return c;
}

export interface QuotaResult {
  allowed: boolean;
  mode: PlanMode;
  limit: number;
  used: number;
  remaining: number;
  date: string;
}

export function checkQuota(uid: string, mode: PlanMode): QuotaResult {
  sweep();
  const c = ensureToday(uid);
  const limit = QUOTA[mode];
  const used = c[mode];
  return {
    allowed: used < limit,
    mode,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    date: c.date,
  };
}

// 消耗一次配额（请求被接受即计数，含失败请求，防止失败重试刷额度）
export function consume(uid: string, mode: PlanMode): void {
  const c = ensureToday(uid);
  c[mode] += 1;
}

// 前端展示用：一次返回两种模式的配额
export function snapshotQuota(uid: string): Record<PlanMode, { remaining: number; limit: number; used: number }> {
  const modes: PlanMode[] = ['ai', 'rule'];
  const out = {} as Record<PlanMode, { remaining: number; limit: number; used: number }>;
  for (const mode of modes) {
    const q = checkQuota(uid, mode);
    out[mode] = { remaining: q.remaining, limit: q.limit, used: q.used };
  }
  return out;
}
