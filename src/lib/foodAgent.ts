import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { repairJson, extractJsonObject } from './jsonRepair';
import type { Location, Meal, TokenUsage } from '@/types/itinerary';

// ===== 高德：周边 POI 搜索（探店核心，被行程餐食复用）=====
// v3/place/around：以 location 为中心，按关键词+半径返回周边餐厅，自带 distance（米）
async function amapAround(
  lng: number,
  lat: number,
  keywords: string,
  radius: number,
  sort: 'distance' | 'rating',
): Promise<AroundPOI[]> {
  const key = process.env.AMAP_KEY;
  if (!key) return [];
  const url =
    `https://restapi.amap.com/v3/place/around?key=${key}` +
    `&location=${lng},${lat}&keywords=${encodeURIComponent(keywords)}` +
    `&radius=${radius}&offset=25&page=1&sortrule=${sort === 'rating' ? 'weight' : 'distance'}`;
  const data = await fetch(url).then((r) => r.json());
  if (data.status !== '1') return [];
  const pois: AroundPOI[] = (data.pois || [])
    .map((p: any) => {
      const [plng, plat] = (p.location || '').split(',').map(Number);
      const rating = p.biz_ext?.rating ? Number(p.biz_ext.rating) : undefined;
      const cost = p.biz_ext?.cost ? Number(p.biz_ext.cost) : undefined;
      return {
        id: String(p.id || p.name),
        name: p.name,
        category: (p.type || '美食').split(';').filter(Boolean).pop() || '美食',
        address: p.address || '',
        distance: Number(p.distance) || 0,
        rating: Number.isFinite(rating) ? rating : undefined,
        cost: Number.isFinite(cost) ? cost : undefined,
        location: plng && plat ? { longitude: plng, latitude: plat } : { longitude: lng, latitude: lat },
        photo: p.photos && p.photos[0] ? p.photos[0].url : '',
        tel: p.tel || undefined,
      } as AroundPOI;
    })
    .filter((p: AroundPOI) => p.location.longitude && p.location.latitude);

  if (sort === 'rating') {
    pois.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }
  return pois.slice(0, 15);
}

interface AroundPOI {
  id: string;
  name: string;
  category: string;
  address: string;
  distance: number;
  rating?: number;
  cost?: number;
  location: Location;
  photo?: string;
  tel?: string;
}

export interface MealCenter {
  lng: number;
  lat: number;
  name: string;
}

function toMeal(type: 'breakfast' | 'lunch' | 'dinner' | 'snack', p: AroundPOI, estCost: number): Meal {
  return {
    type,
    name: p.name,
    address: p.address,
    location: p.location,
    rating: p.rating,
    cost: p.cost,
    distance: p.distance,
    estimated_cost: estCost,
  };
}

// 费用估算（DeepSeek 峰谷定价，与 agent.ts 一致）
function computeCost(inputTokens: number, outputTokens: number, when = new Date()) {
  const h = when.getHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  const inRate = peak ? 3 : 1.5;
  const outRate = peak ? 9 : 4.5;
  const cost = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return { cost: Number(cost.toFixed(4)), peak };
}

/**
 * 为某一天所在位置推荐真实附近的午餐/晚餐，绑进行程的 meal 节点。
 * - 规则模式(aiMode=false)：直接返回高德周边评分最高的真实餐厅（0 token）。
 * - AI 模式：再对这几家做一次轻量 DeepSeek 点评（reason + tags）。
 * 返回 Meal[]（午餐、晚餐）与可选 token 用量（仅 AI 模式有值）。
 */
export async function suggestDayMeals(opts: {
  center: MealCenter;
  foodKeyword: string;
  weatherTip?: string;
  aiMode: boolean;
  onProgress?: (stage: string, message: string, progress: number) => void;
}): Promise<{ meals: Meal[]; usage?: TokenUsage }> {
  const { center, foodKeyword, weatherTip, aiMode, onProgress } = opts;
  const radius = 2000;
  const pois = await amapAround(center.lng, center.lat, foodKeyword, radius, 'rating');

  // 周边没搜到：给一个占位餐食，不报错
  if (!pois.length) {
    return {
      meals: [
        { type: 'lunch', name: `${foodKeyword}（附近未搜到，建议到当地美食街）`, estimated_cost: 80 },
        { type: 'dinner', name: `${foodKeyword}（附近未搜到，建议到当地美食街）`, estimated_cost: 120 },
      ],
    };
  }

  const lunch = pois[0];
  const dinner = pois.length > 1 ? pois[1] : pois[0];
  const base: Meal[] = [toMeal('lunch', lunch, 80), toMeal('dinner', dinner, 120)];

  if (!aiMode || !process.env.DEEPSEEK_API_KEY) return { meals: base };

  // AI 模式：对这两家做点评 + 标签（单次调用）
  onProgress?.('meals', 'AI 正在为今天的餐厅写推荐…', 92);
  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.7,
    streamUsage: true,
    timeout: 90000, // DeepSeek 高峰排队可达 60s+，90s 超时兜底防挂死
    modelKwargs: { thinking: { type: 'disabled' } },
  });

  const candidateList = base.map((m) => ({
    type: m.type,
    name: m.name,
    rating: m.rating ?? null,
    cost: m.cost ?? null,
    distance: m.distance ?? null,
    address: m.address ?? '',
  }));
  const sysPrompt = '你是一名本地美食参谋，风格亲切、专业。会根据真实数据为用户挑选的餐厅写简短推荐理由与标签。';
  const humanPrompt =
    `用户在某地「${center.name}」附近找「${foodKeyword}」。\n` +
    `当前天气：${weatherTip || '未知'}。\n` +
    `候选餐厅（高德真实数据）：${JSON.stringify(candidateList, null, 2)}\n\n` +
    `请为每一家写一句中文推荐理由(reason，1-2 句)并给 1-3 个标签(tags)。\n` +
    `只输出一个 JSON 对象，不要解释、不要 markdown：\n` +
    `{ "meals": [ { "type":"lunch", "reason":"", "tags":[""] }, { "type":"dinner", "reason":"", "tags":[""] } ] }\n` +
    `type 必须对应上面候选的 lunch / dinner，不要编造新餐厅。`;

  const usageAcc = { input: 0, output: 0 };
  const usageCb: any = {
    handleLLMEnd(output: any) {
      const u = output?.llmOutput?.usage || output?.usage || output?.llmOutput?.tokenUsage;
      if (!u) return;
      usageAcc.input += u.prompt_tokens ?? u.input_tokens ?? 0;
      usageAcc.output += u.completion_tokens ?? u.output_tokens ?? 0;
    },
  };

  let enriched: { meals?: { type: string; reason?: string; tags?: string[] }[] } = {};
  let msg: any;
  try {
    msg = await llm.invoke([new SystemMessage(sysPrompt), new HumanMessage(humanPrompt)], {
      callbacks: [usageCb],
    } as any);
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
    enriched = JSON.parse(repairJson(extractJsonObject(text)));
  } catch {
    /* AI 点评失败：保留规则列表（无 reason/tags） */
  }

  if (enriched.meals) {
    for (const e of enriched.meals) {
      const target = base.find((m) => m.type === e.type);
      if (target) {
        if (e.reason) target.reason = e.reason;
        if (e.tags) target.tags = e.tags;
      }
    }
  }

  let inputTokens = usageAcc.input;
  let outputTokens = usageAcc.output;
  if (inputTokens === 0 && outputTokens === 0 && (msg as any)?.usage_metadata) {
    inputTokens = (msg as any).usage_metadata.input_tokens || 0;
    outputTokens = (msg as any).usage_metadata.output_tokens || 0;
  }
  const c = computeCost(inputTokens, outputTokens);
  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costYuan: c.cost,
    peak: c.peak,
  };
  return { meals: base, usage };
}
