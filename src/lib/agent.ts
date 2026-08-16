import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { WeatherTool } from './tools/weather';
import { PoiTool } from './tools/poi';
import { RouteTool } from './tools/route';
import { BudgetTool } from './tools/budget';
import { PackingTool } from './tools/packing';
import { repairJson, extractJsonObject } from './jsonRepair';
import { suggestDayMeals } from './foodAgent';
import type { PlanRequest, TripPlan, TokenUsage, Meal } from '@/types/itinerary';

const SYSTEM_PROMPT = `你是一个擅长规划旅行的 AI 助手，帮助用户制定详细行程。
你拥有多个工具：天气、POI 搜索、路线、预算、打包清单。根据用户的请求决定调用哪些工具，必要时链式调用。

【工具使用规则】
1. 规划前必须先调用 get_weather_forecast 获取目的地天气，再决定穿衣/打包。
2. 必须用 search_poi 搜索真实景点/餐厅（按用户偏好选关键词，如"美食"搜"特色餐厅"），再排进日程。
3. 涉及交通耗时时用 get_route。
4. 预算用 plan_budget；用户给了总预算就传入 total，没给则按城市等级估算。
5. 多城市时在对应 day 标记 is_transfer_day 并写 transfer_info。

【输出要求】
- 最终只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块标记。
- 严格遵循如下结构（key 保持英文，value 用中文）：
{
  "city": "主城市",
  "cities": ["途经城市"],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_index": 0,
      "city": "城市",
      "is_transfer_day": false,
      "transfer_info": "",
      "description": "当日行程简述",
      "transportation": "公共交通",
      "accommodation": "经济型酒店",
      "hotel": { "name":"", "address":"", "price_range":"", "rating":"", "estimated_cost":0 },
      "attractions": [ { "name":"", "address":"", "location": {"longitude":0,"latitude":0}, "visit_duration":90, "description":"", "category":"", "ticket_price":0 } ],
      "meals": [ { "type":"lunch", "name":"", "address":"", "estimated_cost":0 } ]
    }
  ],
  "weather_info": [ { "date":"", "city":"", "day_weather":"晴", "night_weather":"多云", "day_temp":24, "night_temp":16 } ],
  "overall_suggestions": "总体建议",
  "budget": { "total_attractions":0, "total_hotels":0, "total_meals":0, "total_transportation":0, "total_inter_city_transport":0, "total":0 }
}
- 每天 08:00–22:00 排 2–4 个景点 + 早/午/晚三餐，避免赶场；attractions 的 location 必须来自 search_poi 返回的真实经纬度。
- 用友好、清晰的语气。如果缺少必要信息，先向用户追问。`;

function buildHumanPrompt(req: PlanRequest): string {
  const prefs = req.preferences?.length ? req.preferences.join('、') : '无特别偏好';
  return `请为用户规划旅行：
目的地：${req.city}
天数：${req.travel_days}
交通方式：${req.transportation}
住宿偏好：${req.accommodation}
偏好标签：${prefs}
总预算：${req.total_budget ? '¥' + req.total_budget : '未指定（请按城市等级估算）'}
城市等级：${req.city_tier || 'other'}
附加要求：${req.free_text_input || '无'}
请先调用天气与 POI 工具获取真实数据，再输出完整 JSON 行程。`;
}

/**
 * 工具阶段 → 进度文案与百分比。
 * 用于在多轮工具调用期间实时上报，避免前端进度条一直停在 20% 看起来像"卡死"。
 * （已关闭思考模式，单轮明显快于开启时，但多轮工具循环仍可能数秒~十几秒。）
 */
const TOOL_STAGES: Record<string, { msg: string; p: number }> = {
  get_weather_forecast: { msg: '正在获取目的地天气…', p: 35 },
  search_poi: { msg: '正在搜索真实景点与餐厅…', p: 52 },
  get_route: { msg: '正在规划交通路线…', p: 68 },
  plan_budget: { msg: '正在核算预算…', p: 82 },
  packing_checklist: { msg: '正在生成打包清单…', p: 90 },
};

/**
 * 根据 DeepSeek 峰谷定价估算费用（deepseek-v4-flash，2026-08-17 起生效）。
 * 峰值 09:00–12:00 / 14:00–18:00：输入 ¥3/百万、输出 ¥9/百万（未命中缓存价）。
 * 空闲时段：输入 ¥1.5/百万、输出 ¥4.5/百万。返回保留 4 位小数的金额与是否峰值。
 */
function computeCost(inputTokens: number, outputTokens: number, when = new Date()) {
  const h = when.getHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  const inRate = peak ? 3 : 1.5;
  const outRate = peak ? 9 : 4.5;
  const cost = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return { cost: Number(cost.toFixed(4)), peak };
}

/**
 * 规划一次旅行，返回结构化 TripPlan。
 * 使用 DeepSeek（复用 jarvis 的 Key），通过 OpenAI 兼容接口接入。
 * onProgress 用于实时上报进度（推理模型较慢时避免前端假死）。
 */
export async function planTrip(
  req: PlanRequest,
  onProgress?: (stage: string, message: string, progress: number) => void,
): Promise<{ plan: TripPlan; usage: TokenUsage }> {
  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.7,
    // streamUsage=true：LangChain 仅在「流式」调用自动附加 stream_options.include_usage，
    // 非流式调用不会附带，从而避免 DeepSeek 报 "stream_options should be set along with stream = true"。
    // 这样流式响应会带回 usage，用于「本次消耗 X tokens / 约 ¥Y」统计。
    streamUsage: true,
    // 关闭思考模式：deepseek-v4-flash 默认开启推理(CoT)，会产生大量思考 token、拉高费用；
    // 关掉后仍是正常指令模型，工具调用 / JSON 输出不受影响，单次规划成本显著下降。
    modelKwargs: { thinking: { type: 'disabled' } },
  });

  const agent = createReactAgent({
    llm,
    tools: [new WeatherTool(), new PoiTool(), new RouteTool(), new BudgetTool(), new PackingTool()],
    messageModifier: new SystemMessage(SYSTEM_PROMPT),
  });

  // 用 stream(streamMode: 'values') 逐轮拿到完整消息列表：
  // 既能从新增消息的 tool_calls 提取工具名实时上报进度，
  // 又能在循环结束时取到最后一条（含 JSON 答案）的消息。
  // 注：langgraph 0.0.31 无 streamEvents，故用 stream + values 模式。
  // 累计各轮 LLM token 用量（用于「本次消耗 X tokens / 约 ¥Y」统计）
  const usageAcc = { input: 0, output: 0 };
  const usageCb: any = {
    handleLLMEnd(output: any) {
      const u = output?.llmOutput?.usage || output?.usage || output?.llmOutput?.tokenUsage;
      if (!u) return;
      usageAcc.input += u.prompt_tokens ?? u.input_tokens ?? 0;
      usageAcc.output += u.completion_tokens ?? u.output_tokens ?? 0;
    },
  };

  const input = { messages: [new HumanMessage(buildHumanPrompt(req))] };
  const stream = await agent.stream(input, { streamMode: 'values', callbacks: [usageCb] });
  let messages: any[] = [];
  let prevLen = 0;
  for await (const state of stream as any) {
    const msgs: any[] = (state as any)?.messages || [];
    const added = msgs.slice(prevLen);
    prevLen = msgs.length;
    for (const m of added) {
      const calls: any[] = m?.tool_calls || [];
      for (const c of calls) {
        const name: string = c?.name || c?.function?.name || '';
        const s = TOOL_STAGES[name];
        if (s && onProgress) onProgress('planning', s.msg, s.p);
      }
    }
    messages = msgs;
  }

  const last = messages[messages.length - 1];
  const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
  const jsonStr = repairJson(extractJsonObject(text));
  const plan = JSON.parse(jsonStr) as TripPlan;

  // 餐食增强：把每天午餐/晚餐替换为「当天所在位置附近」的真实高德餐厅；AI 模式再附点评
  const fkw = foodKeyword(req.preferences || []);
  let mealInput = 0;
  let mealOutput = 0;
  for (const d of plan.days) {
    const a = d.attractions?.[0];
    if (a?.location?.longitude && a?.location?.latitude) {
      const w = plan.weather_info?.find((x) => x.date === d.date);
      const weatherTip = w ? `${w.day_weather} ${w.day_temp}℃` : undefined;
      onProgress?.('meals', `正在安排第 ${d.day_index + 1} 天附近的美食…`, 92);
      const r = await suggestDayMeals({
        center: { lng: a.location.longitude, lat: a.location.latitude, name: d.city || plan.city },
        foodKeyword: fkw,
        weatherTip,
        aiMode: true,
        onProgress,
      });
      if (r.meals.length) d.meals = r.meals;
      if (r.usage) {
        mealInput += r.usage.inputTokens;
        mealOutput += r.usage.outputTokens;
      }
    }
  }

  // 用量统计：优先用 LLM 回调（每轮一次），回退到消息 usage_metadata
  let inputTokens = usageAcc.input;
  let outputTokens = usageAcc.output;
  inputTokens += mealInput; // 计入餐食点评的 token（AI 模式）
  outputTokens += mealOutput;
  if (inputTokens === 0 && outputTokens === 0) {
    for (const m of messages) {
      const isAI = typeof m?._getType === 'function' ? m._getType() === 'ai' : m?.type === 'ai';
      if (!isAI) continue;
      const um = m.usage_metadata;
      if (um) {
        inputTokens += um.input_tokens || 0;
        outputTokens += um.output_tokens || 0;
      }
    }
  }
  const cost = computeCost(inputTokens, outputTokens);
  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costYuan: cost.cost,
    peak: cost.peak,
  };
  return { plan, usage };
}

/**
 * 免 DeepSeek 规则模式行程生成（零 LLM 调用，0 token）。
 * 直接调高德真实 POI + 高德路线(真实耗时) + Open-Meteo 真实天气，按规则拼装可渲染的 TripPlan，
 * 让地图 / 行程卡 / 预算 / 念给我听都能完整运行，成本仅为几次高德 API 调用。
 */

// 将用户偏好映射为高德 POI 搜索关键词（保证至少含「景点」）
function poiKeywords(prefs: string[]): string[] {
  const set = new Set<string>();
  const joined = prefs.join('，');
  if (/美食|吃|餐厅|小吃|火锅|烧烤/.test(joined)) set.add('特色餐厅');
  if (/历史|文化|古迹|博物馆|古建|古镇/.test(joined)) set.add('博物馆');
  if (/自然|山水|户外|公园|风光|登山|徒步/.test(joined)) set.add('自然风景区');
  if (/亲子|儿童|宝宝|乐园/.test(joined)) set.add('亲子乐园');
  if (/购物|商场|逛街/.test(joined)) set.add('商圈');
  if (/夜景|网红|打卡/.test(joined)) set.add('热门景点');
  set.add('景点'); // 兜底，保证有景点可排
  return [...set];
}

// 将用户偏好映射为「餐食」高德周边搜索关键词（与景点关键词区分）
function foodKeyword(prefs: string[]): string {
  const j = prefs.join('，');
  if (/火锅|串串/.test(j)) return '火锅';
  if (/烧烤|撸串/.test(j)) return '烧烤';
  if (/日料|寿司|料理/.test(j)) return '日料';
  if (/咖啡|下午茶/.test(j)) return '咖啡';
  if (/小吃|夜市|路边摊|宵夜/.test(j)) return '小吃';
  if (/面食|面馆|粉/.test(j)) return '面馆';
  if (/甜品|甜点|蛋糕/.test(j)) return '甜品';
  if (/美食|吃|餐厅|川菜|湘菜|粤菜|本帮|江浙|鲁菜/.test(j)) return '特色餐厅';
  return '美食';
}

// 高德路线：返回真实距离(km)与耗时(分钟)，失败返回 null（调用方回退估算）
async function amapRoute(
  origin: string,
  dest: string,
  city: string,
  mode: 'transit' | 'driving' | 'walking',
): Promise<{ km: number; min: number } | null> {
  const key = process.env.AMAP_KEY;
  if (!key) return null;
  try {
    const url = `https://restapi.amap.com/v5/direction/${mode}?key=${key}&origin=${encodeURIComponent(
      origin,
    )}&destination=${encodeURIComponent(dest)}&city=${encodeURIComponent(city)}&show_fields=cost`;
    const data = await fetch(url).then((r) => r.json());
    if (data.status === '1') {
      const path = data.route?.paths?.[0];
      if (path && path.distance && path.duration) {
        return { km: Number(path.distance) / 1000, min: Math.round(Number(path.duration) / 60) };
      }
    }
  } catch {
    /* 网络/解析异常时回退估算 */
  }
  return null;
}

// 交通方式 -> 每日市内交通预估花费（元）
function dailyTransportCost(mode: string): number {
  if (mode === '自驾') return 120;
  if (mode === '高铁') return 60;
  return 40; // 公共交通
}

export async function demoPlan(req: PlanRequest): Promise<TripPlan> {
  const city = req.city || '北京';
  const days = Math.max(1, Math.min(7, Number(req.travel_days) || 3));
  const key = process.env.AMAP_KEY;
  const transport = req.transportation || '公共交通';
  const acc = req.accommodation || '经济型酒店';

  // 按偏好并行搜索高德 POI（去重）
  const kws = poiKeywords(req.preferences || []);
  const fetchPoi = async (kw: string, n: number) => {
    if (!key) return [] as any[];
    const url = `https://restapi.amap.com/v3/place/text?key=${key}&keywords=${encodeURIComponent(
      kw,
    )}&city=${encodeURIComponent(city)}&citylimit=true&offset=${n}&page=1`;
    const data = await fetch(url).then((r) => r.json());
    if (data.status !== '1') return [] as any[];
    return (data.pois || []).map((p: any) => {
      const [lng, lat] = (p.location || '').split(',').map(Number);
      return {
        name: p.name,
        address: p.address || '',
        location: lng && lat ? { longitude: lng, latitude: lat } : { longitude: 0, latitude: 0 },
        category: kw,
        rating: p.biz_ext?.rating ? Number(p.biz_ext.rating) : undefined,
        ticket: p.biz_ext?.cost ? Number(p.biz_ext.cost) || 0 : 0,
        photo: p.photos?.[0]?.url || '',
        _coord: p.location || '',
      };
    });
  };

  const poiResults = await Promise.all(kws.map((kw) => fetchPoi(kw, 6)));
  const seen = new Set<string>();
  const spots: any[] = [];
  for (const list of poiResults) {
    for (const p of list) {
      if (!p._coord || seen.has(p.name)) continue;
      seen.add(p.name);
      spots.push(p);
    }
  }
  const hotels = (await fetchPoi('酒店', 3)).filter((h: any) => h._coord);

  // 真实天气（Open-Meteo 免 Key）
  const weather = await fetchWeather(city, days);

  // 分配景点到各天（每天 2-3 个）
  const start = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const nonFood = spots.filter((s) => s.category !== '特色餐厅');
  const perDay = Math.min(3, Math.max(2, Math.ceil(nonFood.length / days) || 2));
  let idx = 0;
  const dayPlans = [];
  const routeMode: 'transit' | 'driving' | 'walking' =
    transport === '自驾' ? 'driving' : 'transit';

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const daySpots: any[] = [];
    for (let s = 0; s < perDay && idx < nonFood.length; s++, idx++) daySpots.push(nonFood[idx]);

    // 真实路程：相邻景点之间（高德），失败回退估算 25 分钟
    let legMin = 0;
    for (let s = 1; s < daySpots.length; s++) {
      const r = await amapRoute(daySpots[s - 1]._coord, daySpots[s]._coord, city, routeMode);
      legMin += r ? r.min : 25;
    }

    // 餐食：用当天首个景点坐标做高德周边真实搜索（规则模式 0 token），返回附近真实餐厅
    let meals: Meal[] = [
      { type: 'lunch', name: '当地午餐', estimated_cost: 80 },
      { type: 'dinner', name: '当地晚餐', estimated_cost: 120 },
    ];
    const centerSpot = daySpots[0];
    if (centerSpot?._coord) {
      const [clng, clat] = centerSpot._coord.split(',').map(Number);
      if (clng && clat) {
        const r = await suggestDayMeals({
          center: { lng: clng, lat: clat, name: centerSpot.name || city },
          foodKeyword: foodKeyword(req.preferences || []),
          aiMode: false,
        });
        meals = r.meals;
      }
    }
    const hotel = hotels[0];
    const hotelCost = acc.includes('豪华') ? 800 : acc.includes('舒适') ? 450 : 300;
    dayPlans.push({
      date: fmt(d),
      day_index: i,
      city,
      description: `第${i + 1}天：${(daySpots[0]?.name) || city}等${daySpots.length}个景点`,
      transportation: transport + (legMin ? `（景点间约 ${legMin} 分钟车程）` : ''),
      accommodation: acc,
      hotel: hotel
        ? {
            name: hotel.name,
            address: hotel.address,
            location: hotel.location,
            price_range: acc.includes('豪华') ? '¥600-1200/晚' : acc.includes('舒适') ? '¥350-700/晚' : '¥200-400/晚',
            rating: hotel.rating ? String(hotel.rating) : '4.5',
            estimated_cost: hotelCost,
          }
        : undefined,
      attractions: daySpots.map((sp) => ({
        name: sp.name,
        address: sp.address,
        location: sp.location,
        visit_duration: 90,
        description: sp.address ? `位于${sp.address}` : '值得一去的景点',
        category: sp.category,
        rating: sp.rating,
        image_url: sp.photo,
        ticket_price: sp.ticket || 0,
      })),
      meals,
    });
  }

  // 预算：真实票价 + 住宿 + 餐饮 + 交通
  const ticketSum = dayPlans.reduce(
    (s, d) => s + d.attractions.reduce((a, x) => a + (x.ticket_price || 0), 0),
    0,
  );
  const hotelCost = dayPlans.reduce((s, d) => s + (d.hotel?.estimated_cost || 0), 0);
  const mealCost = dayPlans.reduce((s, d) => s + d.meals.reduce((a, m) => a + (m.estimated_cost || 0), 0), 0);
  const transportCost = days * dailyTransportCost(transport);
  const total = ticketSum + hotelCost + mealCost + transportCost;

  // 结合真实天气给建议
  const temps = weather.map((w) => w.day_temp);
  const minT = temps.length ? Math.min(...temps) : 20;
  const maxT = temps.length ? Math.max(...temps) : 30;
  const rainy = weather.some((w) => /雨|雪|雷/.test(w.day_weather));
  const suggestion = `免 DeepSeek 规则模式：景点与天气来自高德 / Open-Meteo 真实数据，行程按规则拼装（0 token）。${
    rainy ? '行程期间有降水，记得带伞。' : ''
  }气温 ${minT}~${maxT}℃，请据此准备衣物。`;

  const budget = {
    total_attractions: dayPlans.reduce((s, d) => s + d.attractions.length, 0),
    total_hotels: hotels.length ? days : 0,
    total_meals: dayPlans.reduce((s, d) => s + d.meals.length, 0),
    total_transportation: transportCost,
    total_inter_city_transport: 0,
    total,
  };

  return {
    city,
    cities: [city],
    start_date: fmt(start),
    end_date: fmt(new Date(start.getTime() + (days - 1) * 86400000)),
    days: dayPlans,
    weather_info: weather,
    overall_suggestions: suggestion,
    budget,
  };
}

// Open-Meteo 真实天气（免 Key），WMO 天气代码转中文
async function fetchWeather(city: string, days: number) {
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
    ).then((r) => r.json());
    const c = geo.results?.[0];
    if (!c) return [] as any[];
    const fc = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Shanghai&forecast_days=${days}`,
    ).then((r) => r.json());
    const wmo: Record<number, string> = {
      0: '晴', 1: '晴间多云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
      51: '毛毛雨', 53: '小雨', 55: '中雨', 61: '小雨', 63: '中雨', 65: '大雨',
      71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '阵雨', 82: '强阵雨',
      95: '雷阵雨', 96: '雷阵雨伴冰雹',
    };
    const times: string[] = fc.daily?.time || [];
    const codes: number[] = fc.daily?.weather_code || [];
    const tmax: number[] = fc.daily?.temperature_2m_max || [];
    const tmin: number[] = fc.daily?.temperature_2m_min || [];
    return times.map((t, i) => ({
      date: t,
      city,
      day_weather: wmo[codes[i]] ?? '未知',
      night_weather: wmo[codes[i]] ?? '未知',
      day_temp: Math.round(tmax[i]),
      night_temp: Math.round(tmin[i]),
    }));
  } catch {
    return [] as any[];
  }
}
