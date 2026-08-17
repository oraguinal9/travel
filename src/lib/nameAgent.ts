import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { repairJson, extractJsonObject } from './jsonRepair';

export type NameCategory = 'baby' | 'brand' | 'pet';

export interface NameRequest {
  category: NameCategory;
  mode?: 'ai' | 'rule';
  count?: number;
  gender?: '男' | '女' | '不限';
  style?: string;
  surname?: string;
  keywords?: string[];
  industry?: string;
  petType?: string;
  free_text?: string;
}

export interface NameItem {
  name: string;
  pinyin?: string;
  meaning: string;
  tags?: string[];
}

export interface NameResult {
  category: NameCategory;
  mode: 'ai' | 'rule';
  names: NameItem[];
  note: string;
}

export interface NameUsage {
  input: number;
  output: number;
  cost: number;
  peak: boolean;
}

// —— 宝宝起名：精选字库（每个字含拼音、寓意、性别倾向、风格、主题）——
interface BabyChar {
  char: string;
  py: string;
  mean: string;
  g: '男' | '女' | '通';
  style: string;
  theme: string;
}
const BABY_CHARS: BabyChar[] = [
  { char: '安', py: 'ān', mean: '平安、安宁', g: '通', style: '古风', theme: '平安' },
  { char: '宁', py: 'níng', mean: '宁静、安宁', g: '通', style: '古风', theme: '平安' },
  { char: '睿', py: 'ruì', mean: '睿智、深远', g: '男', style: '现代', theme: '智慧' },
  { char: '智', py: 'zhì', mean: '智慧', g: '男', style: '现代', theme: '智慧' },
  { char: '慧', py: 'huì', mean: '聪慧', g: '女', style: '现代', theme: '智慧' },
  { char: '敏', py: 'mǐn', mean: '聪敏、敏捷', g: '通', style: '现代', theme: '智慧' },
  { char: '昕', py: 'xīn', mean: '黎明、光明', g: '通', style: '阳光', theme: '阳光' },
  { char: '曦', py: 'xī', mean: '晨曦、朝阳', g: '女', style: '诗意', theme: '阳光' },
  { char: '阳', py: 'yáng', mean: '阳光、开朗', g: '男', style: '阳光', theme: '阳光' },
  { char: '暖', py: 'nuǎn', mean: '温暖', g: '通', style: '现代', theme: '阳光' },
  { char: '沐', py: 'mù', mean: '润泽、如沐春风', g: '通', style: '诗意', theme: '自然' },
  { char: '溪', py: 'xī', mean: '清溪、灵动', g: '通', style: '诗意', theme: '自然' },
  { char: '岚', py: 'lán', mean: '山间雾气、清雅', g: '女', style: '诗意', theme: '自然' },
  { char: '森', py: 'sēn', mean: '森林、生机', g: '通', style: '自然', theme: '自然' },
  { char: '书', py: 'shū', mean: '书香、知书达理', g: '通', style: '文艺', theme: '文雅' },
  { char: '墨', py: 'mò', mean: '墨香、文雅', g: '男', style: '文艺', theme: '文雅' },
  { char: '雅', py: 'yǎ', mean: '雅致', g: '女', style: '文艺', theme: '文雅' },
  { char: '韵', py: 'yùn', mean: '气韵、风韵', g: '女', style: '文艺', theme: '文雅' },
  { char: '谦', py: 'qiān', mean: '谦逊', g: '男', style: '古风', theme: '美德' },
  { char: '仁', py: 'rén', mean: '仁爱', g: '男', style: '古风', theme: '美德' },
  { char: '德', py: 'dé', mean: '品德', g: '男', style: '古风', theme: '美德' },
  { char: '婉', py: 'wǎn', mean: '婉约、温婉', g: '女', style: '古风', theme: '柔美' },
  { char: '柔', py: 'róu', mean: '温柔', g: '女', style: '古风', theme: '柔美' },
  { char: '萱', py: 'xuān', mean: '萱草、忘忧', g: '女', style: '诗意', theme: '柔美' },
  { char: '然', py: 'rán', mean: '自然、坦然', g: '通', style: '现代', theme: '自然' },
  { char: '逸', py: 'yì', mean: '飘逸、安逸', g: '男', style: '古风', theme: '洒脱' },
  { char: '澄', py: 'chéng', mean: '清澈', g: '通', style: '诗意', theme: '自然' },
  { char: '悦', py: 'yuè', mean: '喜悦', g: '通', style: '现代', theme: '喜悦' },
  { char: '乐', py: 'lè', mean: '快乐', g: '通', style: '现代', theme: '喜悦' },
  { char: '航', py: 'háng', mean: '扬帆起航', g: '男', style: '现代', theme: '志向' },
  { char: '宇', py: 'yǔ', mean: '气宇轩昂', g: '男', style: '现代', theme: '志向' },
  { char: '嘉', py: 'jiā', mean: '美好、嘉许', g: '通', style: '古风', theme: '美好' },
  { char: '宜', py: 'yí', mean: '适宜、安宜', g: '通', style: '古风', theme: '美好' },
  { char: '桐', py: 'tóng', mean: '梧桐、高洁', g: '女', style: '诗意', theme: '自然' },
  { char: '锦', py: 'jǐn', mean: '锦绣、华美', g: '通', style: '文艺', theme: '美好' },
  { char: '泽', py: 'zé', mean: '恩泽、润泽', g: '男', style: '古风', theme: '自然' },
  { char: '瑶', py: 'yáo', mean: '美玉', g: '女', style: '诗意', theme: '美好' },
  { char: '琪', py: 'qí', mean: '美玉、珍贵', g: '女', style: '现代', theme: '美好' },
];

// —— 品牌起名：字库（字 + 寓意 + 风格分类）——
interface BrandUnit {
  s: string;
  mean: string;
  cat: string;
}
const BRAND_UNITS: BrandUnit[] = [
  { s: '云', mean: '云端·连接', cat: 'tech' },
  { s: '智', mean: '智慧·智能', cat: 'tech' },
  { s: '链', mean: '链接·贯通', cat: 'tech' },
  { s: '芯', mean: '核心·芯片', cat: 'tech' },
  { s: '元', mean: '本源·新生', cat: 'tech' },
  { s: '数', mean: '数据·精准', cat: 'tech' },
  { s: '创', mean: '创新·开创', cat: 'tech' },
  { s: '极', mean: '极致·专注', cat: 'tech' },
  { s: '码', mean: '代码·科技', cat: 'tech' },
  { s: '鲜', mean: '新鲜·鲜活', cat: 'food' },
  { s: '味', mean: '风味·回味', cat: 'food' },
  { s: '膳', mean: '膳食·健康', cat: 'food' },
  { s: '醇', mean: '醇厚·品质', cat: 'food' },
  { s: '飨', mean: '宴飨·美味', cat: 'food' },
  { s: '谷', mean: '谷物·自然', cat: 'food' },
  { s: '焙', mean: '烘焙·手作', cat: 'food' },
  { s: '津', mean: '津味·鲜甜', cat: 'food' },
  { s: '墨', mean: '墨香·文化', cat: 'culture' },
  { s: '集', mean: '集合·市集', cat: 'culture' },
  { s: '坊', mean: '工坊·匠心', cat: 'culture' },
  { s: '言', mean: '言说·表达', cat: 'culture' },
  { s: '栖', mean: '栖居·生活', cat: 'culture' },
  { s: '山', mean: '山河·自然', cat: 'culture' },
  { s: '简', mean: '简约·素雅', cat: 'culture' },
  { s: '白', mean: '留白·纯粹', cat: 'culture' },
  { s: '悦', mean: '喜悦·愉悦', cat: 'generic' },
  { s: '嘉', mean: '美好·嘉许', cat: 'generic' },
  { s: '优', mean: '优质·优越', cat: 'generic' },
  { s: '本', mean: '本真·根本', cat: 'generic' },
  { s: '知', mean: '知性·认知', cat: 'generic' },
  { s: '光', mean: '光芒·希望', cat: 'generic' },
  { s: '见', mean: '洞见·看见', cat: 'generic' },
  { s: '合', mean: '合一·融合', cat: 'generic' },
];

const PET_PREFIX = ['小', '大', '胖', '懒', '萌', '酷', '阿'];
const PET_CORE = ['豆', '球', '喵', '汪', '虎', '宝', '星', '团', '米', '橘', '布', '可'];
const PET_NAMES = [
  '豆豆', '布丁', '奶茶', '球球', '咪咪', '旺财', '闪电', '糯米', '年糕', '可乐',
  '雪球', '团团', '点点', '毛毛', '皮皮', '糖糖', '芝士', '奶昔', '熊熊', '果果',
];

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function clampCount(c: number | undefined): number {
  return Math.max(3, Math.min(20, c || 8));
}

// —— 规则模式：宝宝 ——
function genBabyRule(req: NameRequest): NameResult {
  const count = clampCount(req.count);
  const gender = req.gender || '不限';
  const style = req.style || '';
  const kws = (req.keywords || []).map((k) => k.trim()).filter(Boolean);

  let pool = BABY_CHARS.filter((c) => gender === '不限' || c.g === '通' || c.g === gender);
  if (style || kws.length) {
    // 打分：命中风格 +2、命中寓意关键词 +1，按分取前若干字，既贴合偏好又保证组合多样性
    const scored = pool
      .map((c) => {
        let s = 0;
        if (style && c.style === style) s += 2;
        if (kws.length && kws.some((k) => c.theme.includes(k) || c.mean.includes(k))) s += 1;
        return { c, s };
      })
      .sort((a, b) => b.s - a.s);
    const need = Math.min(pool.length, Math.max(6, count));
    pool = scored.slice(0, need).map((x) => x.c);
  }
  // 兜底：池子太小则放宽性别
  if (pool.length < 2) pool = BABY_CHARS.filter((c) => gender === '不限' || c.g === '通' || c.g === gender);

  const names: NameItem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (names.length < count && guard < count * 40) {
    guard++;
    const two = shuffle(pool).slice(0, 2);
    if (two.length < 2 || two[0].char === two[1].char) continue;
    const given = two.map((c) => c.char).join('');
    const full = (req.surname || '') + given;
    if (seen.has(full)) continue;
    seen.add(full);
    names.push({
      name: full,
      pinyin: two.map((c) => c.py).join(' '),
      meaning: two.map((c) => `${c.char}（${c.mean}）`).join(' + '),
      tags: Array.from(new Set(two.map((c) => c.theme))),
    });
  }
  const note = `规则模式：从 ${pool.length} 个精选字中按「${gender === '不限' ? '通用' : gender + '孩'}${
    style ? '·' + style : ''
  }」组合生成（0 token，无需 AI）。`;
  return { category: 'baby', mode: 'rule', names, note };
}

// —— 规则模式：品牌 ——
function genBrandRule(req: NameRequest): NameResult {
  const count = clampCount(req.count);
  const kw = `${req.industry || ''}${req.style || ''}`.toLowerCase();
  let cat = 'generic';
  if (/科技|技术|软件|互联网|智能|ai|数据|芯片|数码/.test(kw)) cat = 'tech';
  else if (/美食|餐饮|食品|咖啡|烘焙|零食|生鲜|茶饮|酒/.test(kw)) cat = 'food';
  else if (/文化|文创|书店|茶|手作|艺术|设计|工作室|传媒/.test(kw)) cat = 'culture';

  const pool = BRAND_UNITS.filter((u) => u.cat === cat || u.cat === 'generic');
  const names: NameItem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (names.length < count && guard < count * 40) {
    guard++;
    const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    const units = shuffle(pool).slice(0, n);
    if (units.length < n) continue;
    const pick = units.map((u) => u.s).join('');
    if (seen.has(pick)) continue;
    seen.add(pick);
    names.push({
      name: pick,
      meaning: `定位寓意：${units.map((u) => u.mean).join('·')}`,
      tags: [cat === 'generic' ? '通用' : cat],
    });
  }
  const note = `规则模式：从「${cat}」风格字库组合生成 ${names.length} 个品牌名（0 token）。`;
  return { category: 'brand', mode: 'rule', names, note };
}

// —— 规则模式：宠物 ——
function petNote(nm: string, type: string): string {
  const notes = ['听着亲切，叫起来顺口', '软萌好记，适合日常呼唤', '自带喜感，辨识度高', '短促清脆，唤宠更省力'];
  return `${type ? type + '专属 · ' : ''}${notes[Math.floor(Math.random() * notes.length)]}`;
}

function genPetRule(req: NameRequest): NameResult {
  const count = clampCount(req.count);
  const type = req.petType || '';
  const names: NameItem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (names.length < count && guard < count * 40) {
    guard++;
    let nm: string;
    if (Math.random() < 0.5) {
      nm = PET_PREFIX[Math.floor(Math.random() * PET_PREFIX.length)] + PET_CORE[Math.floor(Math.random() * PET_CORE.length)];
    } else {
      nm = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
    }
    if (seen.has(nm)) continue;
    seen.add(nm);
    names.push({
      name: nm,
      meaning: petNote(nm, type),
      tags: type ? ['宠物', type] : ['宠物'],
    });
  }
  const note = `规则模式：生成 ${names.length} 个萌系宠物名（0 token）。`;
  return { category: 'pet', mode: 'rule', names, note };
}

// —— AI 模式：调 DeepSeek ——
function computeCost(inputTokens: number, outputTokens: number, when = new Date()) {
  const h = when.getHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  const inRate = peak ? 3 : 1.5;
  const outRate = peak ? 9 : 4.5;
  const cost = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return { cost: Number(cost.toFixed(4)), peak };
}

function buildPrompts(req: NameRequest, count: number): { sys: string; human: string } {
  if (req.category === 'baby') {
    return {
      sys: `你是有文化的起名助手。用户给出姓氏、性别、风格、寓意关键词、附加要求。请生成 ${count} 个中文名字（姓+名），每个名字附拼音、寓意解释、风格标签。
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块：
{"note":"一句话整体说明","names":[{"name":"姓名","pinyin":"pīn yīn","meaning":"寓意解释","tags":["风格/寓意"]}]}
名字必须自然好听、寓意正向，避免生僻字。`,
      human: `姓氏：${req.surname || '（可自加姓，先给不带姓的名亦可）'}
性别：${req.gender || '不限'}
风格偏好：${req.style || '不限'}
寓意关键词：${req.keywords && req.keywords.length ? req.keywords.join('、') : '无'}
附加要求：${req.free_text || '无'}`,
    };
  }
  if (req.category === 'brand') {
    return {
      sys: `你是品牌命名助手。用户给出行业、风格、附加要求。请生成 ${count} 个中文品牌名（2-3 字），每个附定位寓意、风格标签。
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块：
{"note":"一句话整体说明","names":[{"name":"品牌名","meaning":"定位寓意","tags":["行业/风格"]}]}
名字要好记、有辨识度、契合行业调性。`,
      human: `行业：${req.industry || '不限'}
风格偏好：${req.style || '不限'}
附加要求：${req.free_text || '无'}`,
    };
  }
  return {
    sys: `你是宠物起名助手。用户给出宠物类型、附加要求。请生成 ${count} 个可爱宠物名（猫/狗/小宠皆可），每个附萌点说明、标签。
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块：
{"note":"一句话整体说明","names":[{"name":"名字","meaning":"萌点/适合性格","tags":["类型"]}]}
名字要软萌、好叫、有画面感。`,
    human: `宠物类型：${req.petType || '不限'}
附加要求：${req.free_text || '无'}`,
  };
}

async function genAI(req: NameRequest): Promise<{ result: NameResult; usage: NameUsage }> {
  const count = clampCount(req.count);
  const { sys, human } = buildPrompts(req, count);

  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.85,
    streamUsage: true,
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

  const msg: any = await llm.invoke([new SystemMessage(sys), new HumanMessage(human)], {
    callbacks: [usageCb],
  } as any);
  const um = msg?.usage_metadata || msg?.response_metadata?.usage;
  if (um && !usageAcc.input && !usageAcc.output) {
    usageAcc.input += um.input_tokens ?? um.prompt_tokens ?? 0;
    usageAcc.output += um.output_tokens ?? um.completion_tokens ?? 0;
  }
  const text = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '');
  const json = JSON.parse(repairJson(extractJsonObject(text)));
  const items: NameItem[] = (json.names || []).slice(0, count).map((x: any) => ({
    name: String(x.name || ''),
    pinyin: x.pinyin ? String(x.pinyin) : undefined,
    meaning: String(x.meaning || ''),
    tags: Array.isArray(x.tags) ? x.tags.map(String) : undefined,
  }));
  const note = typeof json.note === 'string' ? json.note : 'AI 结合你的偏好生成。';
  const cost = computeCost(usageAcc.input, usageAcc.output);
  return {
    result: { category: req.category, mode: 'ai', names: items, note },
    usage: { input: usageAcc.input, output: usageAcc.output, cost: cost.cost, peak: cost.peak },
  };
}

export async function generateNames(req: NameRequest): Promise<{ result: NameResult; usage?: NameUsage }> {
  const mode = req.mode === 'rule' ? 'rule' : 'ai';
  if (mode === 'rule') {
    let result: NameResult;
    if (req.category === 'baby') result = genBabyRule(req);
    else if (req.category === 'brand') result = genBrandRule(req);
    else result = genPetRule(req);
    return { result };
  }
  return genAI(req);
}
