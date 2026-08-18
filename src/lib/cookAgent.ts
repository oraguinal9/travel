import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { repairJson, extractJsonObject } from './jsonRepair';
import { RECIPES, getRecipeById } from './recipes';
import type {
  CookRequest,
  Recipe,
  WeeklyPlan,
  DayMenu,
  RecipeLite,
  ShoppingList,
} from '@/types/recipe';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// —— 按偏好过滤菜谱池 ——
function filterPool(req: CookRequest): Recipe[] {
  const avoid = new Set(req.avoid || []);
  return RECIPES.filter((r) => {
    // 命中忌口则排除
    if (r.tags.some((t) => avoid.has(t))) return false;
    // 不要辣：排除带辣标签
    if (req.spicy === '不要' && r.tags.includes('辣')) return false;
    // 每餐耗时上限
    if (req.max_minutes && r.total_minutes > req.max_minutes) return false;
    return true;
  });
}

function toLite(r: Recipe): RecipeLite {
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    difficulty: r.difficulty,
    total_minutes: r.total_minutes,
    tags: r.tags,
  };
}

// —— 一顿饭：荤素汤搭配，尽量一周不重样地挑 count 道 ——
function pickMeal(pool: Recipe[], count: number, req: CookRequest, usedGlobal: Set<string>): Recipe[] {
  const meal: Recipe[] = [];
  const usedHere = new Set<string>();
  const pickOne = (pred: (r: Recipe) => boolean) => {
    let cand = pool.filter((r) => !usedGlobal.has(r.id) && !usedHere.has(r.id) && pred(r));
    if (!cand.length) cand = pool.filter((r) => !usedHere.has(r.id) && pred(r));
    if (!cand.length) cand = pool.filter((r) => !usedHere.has(r.id));
    if (!cand.length) cand = pool.slice();
    if (req.spicy === '要') {
      cand = cand.slice().sort((a, b) => (b.tags.includes('辣') ? 1 : 0) - (a.tags.includes('辣') ? 1 : 0));
    }
    const c = cand[0];
    meal.push(c);
    usedHere.add(c.id);
    usedGlobal.add(c.id);
  };
  // 搭配优先：至少一荤、一素；3 道及以上再补一汤
  pickOne((r) => r.tags.includes('肉') || r.tags.includes('海鲜'));
  if (count >= 2) pickOne((r) => r.tags.includes('素'));
  if (count >= 3) pickOne((r) => r.tags.includes('汤'));
  while (meal.length < count) pickOne(() => true);
  return meal;
}

// —— 采购单聚合：去重、按荤/素/调料分类 ——
function buildShopping(chosen: Recipe[]): ShoppingList {
  const map = new Map<string, { category: string; amounts: Set<string> }>();
  for (const r of chosen) {
    for (const ing of r.ingredients) {
      if (!map.has(ing.name)) map.set(ing.name, { category: ing.category, amounts: new Set() });
      map.get(ing.name)!.amounts.add(ing.amount);
    }
  }
  const list: ShoppingList = { meat: [], veg: [], seasoning: [] };
  for (const [name, v] of map) {
    const item = { name, amount: [...v.amounts].join(' / ') };
    if (v.category === '荤') list.meat.push(item);
    else if (v.category === '素') list.veg.push(item);
    else list.seasoning.push(item);
  }
  // 稳定排序：按名称
  list.meat.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  list.veg.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  list.seasoning.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return list;
}

function assembleDays(
  req: CookRequest,
  mealsByDay: { lunch: Recipe[]; dinner: Recipe[] }[],
  ai: boolean,
  note?: string,
): WeeklyPlan {
  const daysN = req.days || 7;
  const days: DayMenu[] = [];
  const all: Recipe[] = [];
  for (let d = 0; d < daysN; d++) {
    const m = mealsByDay[d] || { lunch: [], dinner: [] };
    all.push(...m.lunch, ...m.dinner);
    days.push({
      day_index: d,
      weekday: daysN <= 7 ? WEEKDAYS[d % 7] : `第${d + 1}天`,
      lunch: m.lunch.map(toLite),
      dinner: m.dinner.map(toLite),
    });
  }
  return { days, shopping: buildShopping(all), ai, note };
}

export interface CookResult {
  plan: WeeklyPlan;
  usage?: { input: number; output: number; cost: number; peak: boolean };
}

export function planWeekRule(req: CookRequest): WeeklyPlan {
  const pool = filterPool(req);
  const daysN = req.days || 7;
  const count = Math.max(2, req.dishes || 3);
  if (!pool.length) {
    return { days: [], shopping: { meat: [], veg: [], seasoning: [] }, ai: false, note: '没有符合你忌口/耗时的菜，放宽条件试试？' };
  }
  const usedGlobal = new Set<string>();
  const mealsByDay: { lunch: Recipe[]; dinner: Recipe[] }[] = [];
  for (let d = 0; d < daysN; d++) {
    mealsByDay.push({
      lunch: pickMeal(pool, count, req, usedGlobal),
      dinner: pickMeal(pool, count, req, usedGlobal),
    });
  }
  return assembleDays(req, mealsByDay, false);
}

// —— AI 模式：DeepSeek 在菜谱池内做个性化排期（每餐多道） ——
function computeCost(inputTokens: number, outputTokens: number, when = new Date()) {
  const h = when.getHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  const inRate = peak ? 3 : 1.5;
  const outRate = peak ? 9 : 4.5;
  const cost = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return { cost: Number(cost.toFixed(4)), peak };
}

async function planWeekAI(
  req: CookRequest,
  onProgress?: (stage: string, message: string, progress: number) => void,
): Promise<CookResult> {
  const pool = filterPool(req);
  const daysN = req.days || 7;
  const count = Math.max(2, req.dishes || 3);
  if (!pool.length) {
    return { plan: { days: [], shopping: { meat: [], veg: [], seasoning: [] }, ai: true, note: '没有符合你忌口/耗时的菜，放宽条件试试？' } };
  }
  const catalog = pool
    .map((r) => `- ${r.id} | ${r.name} | ${r.cuisine} | 难度${r.difficulty} | ${r.total_minutes}分钟 | 标签:${r.tags.join('/')}`)
    .join('\n');

  const sysPrompt = `你是家庭食谱规划助手。用户给了人数、辣度、忌口、每餐最长耗时、想试新菜比例、以及「每餐几道菜」。
请从下面的「可用菜谱」中挑选，排出 ${daysN} 天、每天午餐+晚餐，每餐 ${count} 道菜（荤素汤搭配）。
要求：每餐 lunch_ids/dinner_ids 都是长度 ${count} 的 id 数组；尽量荤素搭配、一周内尽量少重复；尊重忌口与耗时上限；想试新菜比例 ${req.new_freq}（越高越多用不常吃的）。
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块：
{"note":"一句话个性化说明（如：考虑到你不吃辣且带娃，多排了清淡快手菜）",
 "picks":[{"day_index":0,"lunch_ids":["id1","id2","id3"],"dinner_ids":["id4","id5","id6"]}, ... ]}
lunch_ids/dinner_ids 必须是「可用菜谱」里的 id，长度严格为 ${count}。`;

  const humanPrompt = `人数：${req.people}
辣度偏好：${req.spicy}
忌口标签：${req.avoid.length ? req.avoid.join('、') : '无'}
每餐最长耗时：${req.max_minutes} 分钟
想试新菜比例：${req.new_freq}
天数：${daysN}
每餐几道菜：${count}
附加要求：${req.free_text || '无'}

可用菜谱：
${catalog}`;

  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.6,
    streamUsage: true,
    timeout: 90000, // DeepSeek 高峰排队可达 60s+，90s 超时兜底防挂死
    modelKwargs: { thinking: { type: 'disabled' } },
  });

  const usageAcc = { input: 0, output: 0 };
  const usageCb: any = {
    handleLLMEnd(output: any) {
      const u = output?.llmOutput?.usage || output?.usage || output?.llmOutput?.tokenUsage;
      if (!u) return;
      usageAcc.input += u.prompt_tokens ?? u.input_tokens ?? 0;
      usageAcc.output += u.completion_tokens ?? u.output_tokens ?? 0;
    },
  };

  onProgress?.('planning', 'AI 正在按你家口味排一周菜谱…', 40);
  const msg: any = await llm.invoke([new SystemMessage(sysPrompt), new HumanMessage(humanPrompt)], {
    callbacks: [usageCb],
  } as any);
  // 非流式调用时 usage 可能落在消息元数据里，兜底取一次
  const um = msg?.usage_metadata || msg?.response_metadata?.usage;
  if (um && !usageAcc.input && !usageAcc.output) {
    usageAcc.input += um.input_tokens ?? um.prompt_tokens ?? 0;
    usageAcc.output += um.output_tokens ?? um.completion_tokens ?? 0;
  }
  const text = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '');
  const json = JSON.parse(repairJson(extractJsonObject(text)));
  const picks: { day_index: number; lunch_ids?: string[]; dinner_ids?: string[] }[] = json.picks || [];

  const resolveIds = (ids: string[] | undefined): Recipe[] => {
    const out: Recipe[] = [];
    for (const id of ids || []) {
      const r = getRecipeById(id);
      if (r && pool.some((p) => p.id === r.id) && !out.some((x) => x.id === r.id)) out.push(r);
    }
    // 长度不足则补足
    let i = 0;
    while (out.length < count) {
      const r = pool[i % pool.length];
      if (!out.some((x) => x.id === r.id)) out.push(r);
      i++;
      if (i > pool.length * 3) break;
    }
    return out;
  };

  const mealsByDay: { lunch: Recipe[]; dinner: Recipe[] }[] = [];
  for (let d = 0; d < daysN; d++) {
    const p = picks.find((x) => x.day_index === d);
    mealsByDay.push({ lunch: resolveIds(p?.lunch_ids), dinner: resolveIds(p?.dinner_ids) });
  }
  const c = computeCost(usageAcc.input, usageAcc.output);
  return { plan: assembleDays(req, mealsByDay, true, json.note || '已按你的偏好个性化排期'), usage: { ...usageAcc, ...c } };
}

export async function planWeek(
  req: CookRequest,
  onProgress?: (stage: string, message: string, progress: number) => void,
): Promise<CookResult> {
  const ai = req.mode === 'ai' && !!process.env.DEEPSEEK_API_KEY;
  if (ai) {
    try {
      return await planWeekAI(req, onProgress);
    } catch (e) {
      onProgress?.('fallback', 'AI 生成失败，已回退规则模式', 50);
      return { plan: planWeekRule(req) };
    }
  }
  return { plan: planWeekRule(req) };
}
