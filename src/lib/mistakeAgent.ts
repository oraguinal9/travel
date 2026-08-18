import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { repairJson, extractJsonObject } from './jsonRepair';

export type MistakeMode = 'ai' | 'rule';

export interface MistakeItem {
  subject: string; // 科目
  text: string; // 题目/描述
  reason: string; // 错因分类
  topics: string[]; // 命中的知识点
}

export interface WeakPoint {
  subject: string;
  topic: string;
  count: number;
  reasons: string[];
}

export interface PlanItem {
  round: number; // 第几轮复习
  day: number; // 距今天数
  date: string; // YYYY-MM-DD
  subject: string;
  topic: string;
  action: string;
}

export interface PracticeItem {
  subject: string;
  topic: string;
  question: string;
  answer: string;
}

export interface MistakeResult {
  mode: MistakeMode;
  items: MistakeItem[];
  summary: {
    total: number;
    subjects: Record<string, number>;
    reasons: Record<string, number>;
  };
  weakPoints: WeakPoint[];
  plan: PlanItem[];
  tips: string[];
  kbLinks: { subject: string; href: string }[];
  practice?: PracticeItem[];
  strategy?: string[];
  note: string;
}

export interface MistakeUsage {
  input: number;
  output: number;
  cost: number;
  peak: boolean;
}

// —— 知识库联动：与 /learn/kb 一致的科目与错因分类 ——
export const KB_SUBJECTS = ['语文', '数学', '英语', '物理', '生物', '地理', '历史', '道法', '体育'];
export const KB_REASONS = ['计算错', '概念错', '审题错', '方法错', '其他'];
// 与知识库「错题本」间隔复习一致：第 1/2/4/7/15/30 天
export const KB_INTERVALS = [1, 2, 4, 7, 15, 30];

// 各科核心知识点关键词（源自初二全科知识库 · 核心知识卡 / 教材章节）
const KB_TOPICS: Record<string, { name: string; keywords: string[] }[]> = {
  数学: [
    { name: '全等三角形', keywords: ['全等', 'SSS', 'SAS', 'ASA', 'AAS', 'HL', '角平分线', '垂直平分线', '对应边', '对应角'] },
    { name: '轴对称', keywords: ['轴对称', '对称轴', '等腰三角形', '等边三角形', '顶角', '底角'] },
    { name: '实数', keywords: ['实数', '平方根', '算术平方根', '立方根', '无理数', '开方'] },
    { name: '一次函数', keywords: ['一次函数', '正比例函数', '斜率', '函数图像', '直线', '自变量', '因变量', 'k>0', 'k<0'] },
    { name: '整式与分式', keywords: ['整式', '分式', '因式分解', '完全平方', '平方差', '通分', '约分', '公因式', '多项式'] },
    { name: '勾股定理', keywords: ['勾股', '直角三角形', '斜边', '直角边', '勾三股四'] },
    { name: '平行线与三角形', keywords: ['平行线', '同位角', '内错角', '同旁内角', '三角形内角', '外角', '三角形三边'] },
    { name: '平面直角坐标系', keywords: ['坐标系', '坐标', '象限', '横坐标', '纵坐标', '点的位置'] },
  ],
  物理: [
    { name: '声现象', keywords: ['声', '声音', '音调', '响度', '音色', '回声', '超声波', '次声波', '噪声', '振动'] },
    { name: '物态变化', keywords: ['物态', '熔化', '凝固', '汽化', '液化', '升华', '凝华', '沸腾', '蒸发', '熔点', '沸点', '晶体', '非晶体'] },
    { name: '光现象', keywords: ['光', '反射', '折射', '平面镜', '光的直线传播', '色散', '红外线', '紫外线', '入射角', '反射角'] },
    { name: '凸透镜成像', keywords: ['凸透镜', '凹透镜', '焦距', '物距', '像距', '实像', '虚像', '放大镜', '照相机', '投影仪', '望远镜', '显微镜'] },
    { name: '物体的运动', keywords: ['运动', '速度', '路程', '时间', '匀速', '平均速度', '参照物', 'v=s', '米每秒'] },
    { name: '密度', keywords: ['密度', '质量', '体积', '天平', '量筒', 'ρ', '密度计', '同体积'] },
  ],
  语文: [
    { name: '文言文', keywords: ['文言文', '之', '其', '而', '以', '于', '乃', '通假字', '古今异义', '一词多义', '虚词'] },
    { name: '古诗词', keywords: ['古诗', '诗', '词', '意象', '借景抒情', '托物言志', '赏析', '名句'] },
    { name: '阅读理解', keywords: ['阅读', '记叙文', '说明文', '议论文', '散文', '小说', '中心思想', '主旨', '概括', '作用'] },
    { name: '作文', keywords: ['作文', '写作', '素材', '开头', '结尾', '立意', '结构', '细节描写'] },
    { name: '基础字词', keywords: ['字音', '字形', '错别字', '拼音', '成语', '病句', '标点', '修辞', '仿写'] },
  ],
  英语: [
    { name: '时态', keywords: ['时态', '一般现在', '一般过去', '一般将来', '现在进行', '过去进行', '现在完成', '第三人称', '动词原形'] },
    { name: '被动语态', keywords: ['被动', 'be done', 'was done', 'by', '动作承受者'] },
    { name: '从句', keywords: ['从句', '宾语从句', '定语从句', '状语从句', 'that', 'which', 'who', 'where', 'when'] },
    { name: '词汇语法', keywords: ['单词', '词汇', '语法', '固定搭配', '介词', '冠词', '形容词', '副词', '比较级', '最高级'] },
    { name: '完形与阅读', keywords: ['完形填空', '阅读理解', '上下文', '主旨大意', '细节题', '推断题'] },
    { name: '写作', keywords: ['写作', '作文', '书面表达', '句型', '连接词'] },
  ],
  生物: [
    { name: '细胞', keywords: ['细胞', '细胞膜', '细胞质', '细胞核', '细胞壁', '叶绿体', '线粒体', '液泡', '分裂'] },
    { name: '光合与呼吸', keywords: ['光合作用', '呼吸作用', '有机物', '二氧化碳', '氧气', '淀粉', '能量'] },
    { name: '生态系统', keywords: ['生态', '食物链', '食物网', '生产者', '消费者', '分解者', '生物圈'] },
    { name: '遗传变异', keywords: ['遗传', '变异', '基因', 'DNA', '染色体', '性状', '显性', '隐性'] },
    { name: '动植物结构', keywords: ['动物', '植物', '器官', '组织', '根', '茎', '叶', '花', '果实', '种子', '消化', '呼吸', '循环'] },
    { name: '微生物', keywords: ['细菌', '真菌', '病毒', '微生物', '发酵'] },
  ],
  地理: [
    { name: '经纬网', keywords: ['经纬', '经度', '纬度', '赤道', '本初子午线', '南北半球', '东西半球', '五带'] },
    { name: '地图', keywords: ['地图', '比例尺', '方向', '图例', '等高线', '地形图', '海拔'] },
    { name: '地形与气候', keywords: ['地形', '气候', '气温', '降水', '季风', '大陆性', '海洋性', '高原', '平原', '山地', '盆地'] },
    { name: '河流海洋', keywords: ['河流', '长江', '黄河', '珠江', '海洋', '湖泊', '流域', '汛期'] },
    { name: '中国地理', keywords: ['中国', '行政区划', '省', '直辖市', '自治区', '人口', '民族', '自然资源', '农业', '工业', '交通'] },
  ],
  历史: [
    { name: '鸦片战争', keywords: ['鸦片战争', '林则徐', '虎门销烟', '南京条约', '割地赔款', '半殖民地'] },
    { name: '近代化探索', keywords: ['洋务运动', '戊戌变法', '百日维新', '辛亥革命', '孙中山', '新文化运动', '自强求富', '民主科学'] },
    { name: '新民主主义革命', keywords: ['五四运动', '中国共产党成立', '北伐', '南昌起义', '长征', '遵义会议', '抗日战争', '九一八', '七七事变', '解放战争', '三大战役'] },
    { name: '近代经济文化', keywords: ['民族工业', '张謇', '近代教育', '京师大学堂', '科举', '文学', '鲁迅'] },
  ],
  道法: [
    { name: '宪法', keywords: ['宪法', '根本法', '国家机构', '公民', '基本权利', '基本义务', '法律体系'] },
    { name: '权利义务', keywords: ['权利', '义务', '受教育', '人身', '财产', '消费者', '监督', '行使', '履行'] },
    { name: '法律与社会', keywords: ['法律', '规则', '秩序', '违法', '犯罪', '刑罚', '保护', '未成年人', '网络安全', '诚信'] },
    { name: '责任与国情', keywords: ['责任', '国情', '制度', '社会主义', '发展', '创新', '生态', '共同富裕'] },
  ],
  体育: [
    { name: '田径', keywords: ['长跑', '短跑', '立定跳远', '实心球', '跑步', '起跑', '冲刺', '体能'] },
    { name: '球类', keywords: ['篮球', '足球', '排球', '运球', '投篮', '传球', '垫球'] },
    { name: '体能与技巧', keywords: ['仰卧起坐', '引体向上', '俯卧撑', '坐位体前屈', '跳绳', '柔韧', '力量', '耐力'] },
  ],
};

const SUBJECT_ALIASES: [RegExp, string][] = [
  [/道法|道德与法治|政治/, '道法'],
  [/数学/, '数学'],
  [/物理/, '物理'],
  [/语文/, '语文'],
  [/英语|英文/, '英语'],
  [/生物/, '生物'],
  [/地理/, '地理'],
  [/历史/, '历史'],
  [/体育/, '体育'],
];

// —— 输入解析：每行一条错题；尽量从行内提取 科目 / 错因 / 题目 ——
function parseInput(text: string): MistakeItem[] {
  const items: MistakeItem[] = [];
  const lines = text
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    // 去掉行首序号/项目符号
    const clean = line.replace(/^\s*(?:第?[一二三四五六七八九十\d]+[、.．)）]|\d+[、.．]|[-•*·])\s*/, '').trim();
    if (!clean) continue;

    let subject = '';
    for (const [re, name] of SUBJECT_ALIASES) {
      if (re.test(clean)) {
        subject = name;
        break;
      }
    }

    // 错因：在行首/行尾的【】或 | 分隔段中匹配
    let reason = '其他';
    for (const r of KB_REASONS) {
      if (clean.includes(r)) {
        reason = r;
        break;
      }
    }

    // 去掉已识别的 科目名 / 错因 词，剩余为题目描述
    let desc = clean;
    for (const s of ['道法', '道德与法治', '数学', '物理', '语文', '英语', '生物', '地理', '历史', '体育', '政治']) {
      desc = desc.replace(new RegExp(`(?:【|\\[|\\(|（)?${s}(?:】|\\]|\\)|）)?`, 'g'), '');
    }
    desc = desc.replace(/[【】\[\]（）()]/g, '');
    for (const r of KB_REASONS) {
      desc = desc.replace(r, '');
    }
    desc = desc.replace(/^[|｜\s,:：]+|[|｜\s,:：]+$/g, '').trim() || clean;

    // 知识点匹配
    const topics: string[] = [];
    if (subject && KB_TOPICS[subject]) {
      for (const t of KB_TOPICS[subject]) {
        if (t.keywords.some((k) => clean.includes(k) || desc.includes(k))) {
          topics.push(t.name);
        }
      }
    }

    items.push({ subject: subject || '未归类', text: desc, reason, topics });
  }
  return items;
}

function fmtDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// —— 规则模式：启发式诊断 ——
function analyzeRule(text: string): MistakeResult {
  const items = parseInput(text);
  const total = items.length;

  const subjects: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  KB_REASONS.forEach((r) => (reasons[r] = 0));
  const weakMap = new Map<string, WeakPoint>();

  for (const it of items) {
    subjects[it.subject] = (subjects[it.subject] || 0) + 1;
    reasons[it.reason] = (reasons[it.reason] || 0) + 1;
    for (const t of it.topics) {
      const key = `${it.subject}::${t}`;
      const w = weakMap.get(key) || { subject: it.subject, topic: t, count: 0, reasons: [] };
      w.count += 1;
      if (!w.reasons.includes(it.reason)) w.reasons.push(it.reason);
      weakMap.set(key, w);
    }
  }

  const weakPoints = Array.from(weakMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // 复习计划：针对薄弱知识点按间隔天数排
  const plan: PlanItem[] = [];
  weakPoints.slice(0, 3).forEach((w, idx) => {
    KB_INTERVALS.forEach((d, ri) => {
      plan.push({
        round: ri + 1,
        day: d,
        date: fmtDate(d),
        subject: w.subject,
        topic: w.topic,
        action:
          ri === 0
            ? `重做错题 + 看知识库「${w.subject}」核心知识卡`
            : `做 2-3 道「${w.topic}」同类变式题并复述思路`,
      });
    });
  });

  // 启发式建议（基于错因分布）
  const tips: string[] = [];
  if (total === 0) {
    tips.push('未识别到有效错题，请检查格式（每行一条，可包含科目与错因）。');
  }
  if (total > 0) {
    if ((reasons['概念错'] || 0) / total >= 0.3) {
      tips.push(`概念错占比高（${reasons['概念错']}/${total}）：先回归课本把「核心知识卡」里的定义、公式、规律背熟，再做变式题。`);
    }
    if ((reasons['计算错'] || 0) / total >= 0.3) {
      tips.push(`计算错占比高（${reasons['计算错']}/${total}）：建议每天限时 10 分钟做基础计算，草稿纸分区书写，做完回查一步。`);
    }
    if ((reasons['审题错'] || 0) / total >= 0.3) {
      tips.push(`审题错占比高（${reasons['审题错']}/${total}）：养成「圈题干关键词 + 先写已知条件」的习惯，做完核对题目问的是什么。`);
    }
    if ((reasons['方法错'] || 0) / total >= 0.3) {
      tips.push(`方法错占比高（${reasons['方法错']}/${total}）：把每类题型的通用解法整理成「方法卡片」，考前过一遍套路。`);
    }
    if (weakPoints.length === 0) {
      tips.push('未能自动匹配到知识点（可手动在科目里写清题目涉及的概念）。建议把每条错题标上科目，如【数学】全等三角形判定用错。');
    }
    const unclassified = items.filter((i) => i.subject === '未归类').length;
    if (unclassified > 0) {
      tips.push(`有 ${unclassified} 条未识别科目，建议行首用【数学】【物理】等标注，归类更准。`);
    }
  }
  if (tips.length === 0) tips.push('错因分布较均衡，保持「错题重做 + 间隔复习」的节奏即可。');

  const kbLinks = KB_SUBJECTS.filter((s) => subjects[s]).map((s) => ({ subject: s, href: '/learn/kb' }));

  return {
    mode: 'rule',
    items,
    summary: { total, subjects, reasons },
    weakPoints,
    plan,
    tips,
    kbLinks,
    note: `规则模式：按科目/错因/知识点统计并生成间隔复习计划（0 token，无需 AI）。`,
  };
}

// —— AI 模式：调 DeepSeek 生成练习卷与复习策略 ——
function computeCost(inputTokens: number, outputTokens: number, when = new Date()) {
  const h = when.getHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  const inRate = peak ? 3 : 1.5;
  const outRate = peak ? 9 : 4.5;
  const cost = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return { cost: Number(cost.toFixed(4)), peak };
}

async function genAI(text: string, base: MistakeResult): Promise<{ result: MistakeResult; usage: MistakeUsage }> {
  const weakList = base.weakPoints
    .map((w, i) => `${i + 1}. ${w.subject}·${w.topic}（错 ${w.count} 次，错因：${w.reasons.join('/')}）`)
    .join('\n');
  const subjectStat = Object.entries(base.summary.subjects)
    .map(([s, n]) => `${s} ${n} 题`)
    .join('，');

  const sys = `你是一位熟悉初中各科考点的资深教师。用户输入了一批错题，系统已按知识库归类。
请输出一个 JSON 对象（不要 markdown、不要解释文字）：
{
  "practice": [
    {"subject":"科目","topic":"知识点","question":"针对该薄弱知识点的 1 道变式题(题干完整、数字换掉、适合八年级难度)","answer":"答案与简要解析"}
  ],
  "strategy": ["针对薄弱点的 3-5 条可执行复习策略（具体到每天做什么、怎么做）"]
}
要求：practice 只针对最薄弱的 2-3 个知识点各出 1-2 题，共 3-5 题；答案要有解析；strategy 要可落地、避免空话。`;

  const human = `【错题统计】
总数 ${base.summary.total} 题；科目分布：${subjectStat}
错因分布：${Object.entries(base.summary.reasons)
    .map(([r, n]) => `${r} ${n}`)
    .join('，')}

【薄弱知识点】
${weakList || '（未能自动匹配，按科目整体出题）'}

【原始错题】
${text}`;

  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.7,
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

  const msg: any = await llm.invoke([new SystemMessage(sys), new HumanMessage(human)], {
    callbacks: [usageCb],
  } as any);
  const um = msg?.usage_metadata || msg?.response_metadata?.usage;
  if (um && !usageAcc.input && !usageAcc.output) {
    usageAcc.input += um.input_tokens ?? um.prompt_tokens ?? 0;
    usageAcc.output += um.output_tokens ?? um.completion_tokens ?? 0;
  }
  const textOut = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content ?? '');
  const json = JSON.parse(repairJson(extractJsonObject(textOut)));

  const practice: PracticeItem[] = (json.practice || [])
    .slice(0, 5)
    .map((x: any) => ({
      subject: String(x.subject || ''),
      topic: String(x.topic || ''),
      question: String(x.question || ''),
      answer: String(x.answer || ''),
    }));
  const strategy: string[] = (json.strategy || []).slice(0, 6).map((s: any) => String(s));

  const cost = computeCost(usageAcc.input, usageAcc.output);
  return {
    result: { ...base, mode: 'ai', practice, strategy, note: 'AI 模式：结合薄弱知识点生成了针对性变式练习与复习策略。' },
    usage: { input: usageAcc.input, output: usageAcc.output, cost: cost.cost, peak: cost.peak },
  };
}

export async function analyzeMistakes(text: string, mode: MistakeMode): Promise<{ result: MistakeResult; usage?: MistakeUsage }> {
  const base = analyzeRule(text);
  if (mode === 'rule') {
    return { result: base };
  }
  return genAI(text, base);
}
