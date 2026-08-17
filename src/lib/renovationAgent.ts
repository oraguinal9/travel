import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { repairJson, extractJsonObject } from './jsonRepair';

export type Tier = 't1' | 't15' | 't2' | 't3';
export type Grade = 'economy' | 'standard' | 'premium' | 'luxury';
export type StyleKey = 'modern' | 'nordic' | 'chinese' | 'american' | 'japanese';

export interface RenovInput {
  area: number;
  tier: Tier;
  grade: Grade;
  bedrooms: number;
  livingRooms: number;
  bathrooms: number;
  style?: StyleKey;
  mode?: 'ai' | 'rule';
}

export interface LineItem {
  category: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  subtotal: number;
}

export interface RenovResult {
  mode: 'ai' | 'rule';
  area: number;
  tier: Tier;
  grade: Grade;
  style: StyleKey;
  items: LineItem[];
  total: number;
  perSqm: number;
  byCategory: { category: string; subtotal: number; pct: number }[];
  tips: string[];
  note: string;
}

export interface RenovUsage {
  input: number;
  output: number;
  cost: number;
  peak: boolean;
}

export const TIER_LABEL: Record<Tier, string> = {
  t1: '一线城市',
  t15: '新一线',
  t2: '二线城市',
  t3: '三线及以下',
};
export const GRADE_LABEL: Record<Grade, string> = {
  economy: '简装（经济）',
  standard: '中档',
  premium: '高档',
  luxury: '豪华',
};
export const STYLE_LABEL: Record<StyleKey, string> = {
  modern: '现代简约',
  nordic: '北欧',
  chinese: '新中式',
  american: '美式',
  japanese: '日式',
};

const TIER_MULT: Record<Tier, number> = { t1: 1.3, t15: 1.15, t2: 1.0, t3: 0.85 };
const GRADE_MULT: Record<Grade, number> = { economy: 0.68, standard: 1.0, premium: 1.55, luxury: 2.3 };
const STYLE_MULT: Record<StyleKey, number> = {
  modern: 1.0,
  nordic: 1.05,
  chinese: 1.15,
  american: 1.2,
  japanese: 1.1,
};

type QFn = (a: number, b: number, l: number, bath: number) => number;

interface CatDef {
  key: string;
  rate: number; // 元/㎡ @中档/二线
  styleSensitive?: boolean;
  items: { name: string; unit: string; w: number; q: QFn }[];
}

// 基础单价模型（中档 / 二线城市 元/㎡），合计约 2450 元/㎡，符合市场全包区间
const CATS: CatDef[] = [
  {
    key: '基础硬装',
    rate: 650,
    items: [
      { name: '水电改造', unit: '点位', w: 0.28, q: (a) => Math.max(20, Math.round(a / 6)) },
      { name: '泥瓦工程', unit: '㎡', w: 0.3, q: (a) => Math.round(a * 0.5) },
      { name: '油漆工程', unit: '㎡', w: 0.27, q: (a) => Math.round(a * 2.5) },
      { name: '人工辅料', unit: '㎡', w: 0.15, q: (a) => a },
    ],
  },
  {
    key: '地面主材',
    rate: 230,
    items: [{ name: '地砖/地板', unit: '㎡', w: 1, q: (a) => Math.round(a * 0.9) }],
  },
  {
    key: '门窗',
    rate: 170,
    styleSensitive: true,
    items: [
      { name: '室内门', unit: '樘', w: 0.6, q: (a, b, l) => b + l + 1 },
      { name: '窗/垭口', unit: '项', w: 0.4, q: (a, b, l, bath) => Math.max(1, bath) },
    ],
  },
  {
    key: '厨卫',
    rate: 280,
    items: [
      { name: '整体厨柜', unit: '延米', w: 0.5, q: (a, b) => Math.round(3.5 + 0.8 * Math.max(0, b - 1)) },
      { name: '卫浴洁具', unit: '套', w: 0.3, q: (a, b, l, bath) => Math.max(1, bath) },
      { name: '防水工程', unit: '㎡', w: 0.2, q: (a) => Math.round(a * 0.12) },
    ],
  },
  {
    key: '墙面吊顶',
    rate: 140,
    items: [
      { name: '吊顶', unit: '㎡', w: 0.4, q: (a) => Math.round(a * 0.4) },
      { name: '背景墙/造型', unit: '项', w: 0.3, q: () => 1 },
      { name: '美缝/收口', unit: '㎡', w: 0.3, q: (a) => Math.round(a * 0.9) },
    ],
  },
  {
    key: '家具软装',
    rate: 420,
    styleSensitive: true,
    items: [
      { name: '沙发/茶几', unit: '套', w: 0.3, q: () => 1 },
      { name: '床+床垫', unit: '套', w: 0.35, q: (a, b) => Math.max(1, b) },
      { name: '衣柜/收纳', unit: '套', w: 0.35, q: (a, b) => Math.max(1, b) },
    ],
  },
  {
    key: '灯具窗帘',
    rate: 130,
    styleSensitive: true,
    items: [
      { name: '灯具', unit: '项', w: 0.5, q: () => 1 },
      { name: '窗帘', unit: '套', w: 0.5, q: (a, b, l) => Math.max(1, l + b) },
    ],
  },
  {
    key: '家电',
    rate: 360,
    items: [
      { name: '空调', unit: '台', w: 0.4, q: (a, b) => b + 1 },
      { name: '厨房电器', unit: '套', w: 0.3, q: () => 1 },
      { name: '冰洗电视', unit: '套', w: 0.3, q: () => 1 },
    ],
  },
  {
    key: '设计管理',
    rate: 70,
    items: [
      { name: '设计费', unit: '㎡', w: 0.5, q: (a) => a },
      { name: '管理费', unit: '㎡', w: 0.5, q: (a) => a },
    ],
  },
];

function ruleTips(input: RenovInput): string[] {
  const { grade, tier, area, bedrooms: b, bathrooms: bath } = input;
  const tips: string[] = [];
  if (grade === 'economy')
    tips.push('简装建议保留原有水电格局，把预算重点放在厨卫防水与五金件上，这部分最影响居住体验。');
  if (grade === 'luxury')
    tips.push('高档装修务必额外预留 10–15% 不可预见费，主材升级、全屋定制极易在后期大幅超支。');
  tips.push('主材（地砖/地板/门窗）占总预算大头，建议多跑 2–3 家建材市场比价，淡季下单更划算。');
  if (tier === 't1') tips.push('一线城市人工费偏高，硬装人工占比会比二三线城市高约 20%，签约前问清工费计价方式。');
  if (area > 120) tips.push('大户型建议按空间（客餐厅/主卧/厨卫）分别设子预算，避免整体失控。');
  if (bath >= 2) tips.push('多卫户型防水与管路费用成倍增加，务必把厨卫列为重点监控项，闭水试验不能省。');
  tips.push('签约前要求装修公司出具「闭口合同」，把增项控制在 5% 以内，口头承诺全部写进补充协议。');
  return tips;
}

export function estimate(input: RenovInput): RenovResult {
  const area = Math.max(20, Math.min(1000, Number(input.area) || 90));
  const tier = input.tier || 't2';
  const grade = input.grade || 'standard';
  const style = input.style || 'modern';
  const b = Math.max(1, Math.min(6, Math.round(input.bedrooms) || 3));
  const l = Math.max(1, Math.min(3, Math.round(input.livingRooms) || 1));
  const bath = Math.max(1, Math.min(4, Math.round(input.bathrooms) || 2));

  const tm = TIER_MULT[tier];
  const gm = GRADE_MULT[grade];
  const sm = STYLE_MULT[style];

  const items: LineItem[] = [];
  for (const c of CATS) {
    const styleMult = c.styleSensitive ? sm : 1;
    const catSub = Math.round(c.rate * area * gm * tm * styleMult);
    for (const it of c.items) {
      const qty = Math.max(1, Math.round(it.q(area, b, l, bath)));
      const sub = Math.round((catSub * it.w) / qty) * qty;
      items.push({
        category: c.key,
        name: it.name,
        qty,
        unit: it.unit,
        price: Math.round((catSub * it.w) / qty),
        subtotal: sub,
      });
    }
  }

  const total = items.reduce((s, x) => s + x.subtotal, 0);
  const perSqm = Math.round(total / area);

  const catMap: Record<string, number> = {};
  for (const it of items) catMap[it.category] = (catMap[it.category] || 0) + it.subtotal;
  const byCategory = Object.entries(catMap)
    .map(([category, subtotal]) => ({ category, subtotal, pct: Math.round((subtotal / total) * 100) }))
    .sort((a, b) => b.subtotal - a.subtotal);

  return {
    mode: 'rule',
    area,
    tier,
    grade,
    style,
    items,
    total,
    perSqm,
    byCategory,
    tips: ruleTips({ area, tier, grade, style, bedrooms: b, livingRooms: l, bathrooms: bath }),
    note: `规则估算（0 token）：以 ${TIER_LABEL[tier]}·${GRADE_LABEL[grade]}·${STYLE_LABEL[style]} 为基准，按 ${area}㎡ 自动生成分项清单。`,
  };
}

function computeCost(inputTokens: number, outputTokens: number, when = new Date()) {
  const h = when.getHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  const inRate = peak ? 3 : 1.5;
  const outRate = peak ? 9 : 4.5;
  const cost = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return { cost: Number(cost.toFixed(4)), peak };
}

async function genAITips(
  input: RenovInput,
  summary: { total: number; perSqm: number; byCategory: RenovResult['byCategory'] },
): Promise<{ tips: string[]; note: string; usage: RenovUsage }> {
  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.7,
    streamUsage: true,
    modelKwargs: { thinking: { type: 'disabled' } },
  });

  const human = `城市档次：${TIER_LABEL[input.tier]}
装修档次：${GRADE_LABEL[input.grade]}
风格：${STYLE_LABEL[input.style || 'modern']}
建筑面积：${input.area}㎡
户型：${input.bedrooms}室${input.livingRooms}厅${input.bathrooms}卫
总预算估算：约 ${summary.total.toLocaleString()} 元（${summary.perSqm} 元/㎡）
各板块占比：${summary.byCategory.map((x) => `${x.category} ${x.pct}%`).join('、')}`;

  const usageAcc = { input: 0, output: 0 };
  const usageCb: any = {
    handleLLMEnd(output: any) {
      const u = output?.llmOutput?.usage || output?.usage || output?.llmOutput?.tokenUsage;
      if (!u) return;
      usageAcc.input += u.prompt_tokens ?? u.input_tokens ?? 0;
      usageAcc.output += u.completion_tokens ?? u.output_tokens ?? 0;
    },
  };

  const msg: any = await llm.invoke(
    [
      new SystemMessage(
        `你是资深装修预算顾问。根据用户房屋信息与预算结构，给出 5-7 条可执行的省钱与避坑建议。
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块：
{"note":"一句话总评","tips":["建议1","建议2",...]}
建议必须具体、贴合该城市档次与面积户型，能真正帮用户控预算、避坑，避免空话套话。`,
      ),
      new HumanMessage(human),
    ],
    { callbacks: [usageCb] } as any,
  );
  const um = msg?.usage_metadata || msg?.response_metadata?.usage;
  if (um && !usageAcc.input && !usageAcc.output) {
    usageAcc.input += um.input_tokens ?? um.prompt_tokens ?? 0;
    usageAcc.output += um.output_tokens ?? um.completion_tokens ?? 0;
  }
  const text = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '');
  const json = JSON.parse(repairJson(extractJsonObject(text)));
  const tips: string[] = Array.isArray(json?.tips)
    ? json.tips.slice(0, 7).map((t: any) => String(t))
    : [];
  const note = typeof json?.note === 'string' ? json.note : 'AI 结合你的房屋信息生成深度避坑建议。';
  const cost = computeCost(usageAcc.input, usageAcc.output);
  return { tips, note, usage: { input: usageAcc.input, output: usageAcc.output, cost: cost.cost, peak: cost.peak } };
}

export async function generateRenovation(
  input: RenovInput,
): Promise<{ result: RenovResult; usage?: RenovUsage }> {
  const result = estimate(input);
  if (input.mode === 'ai' && process.env.DEEPSEEK_API_KEY) {
    try {
      const ai = await genAITips(input, { total: result.total, perSqm: result.perSqm, byCategory: result.byCategory });
      result.tips = ai.tips;
      result.note = ai.note;
      result.mode = 'ai';
      return { result, usage: ai.usage };
    } catch {
      // AI 失败时回退规则建议，保证可用
      return { result };
    }
  }
  return { result };
}
