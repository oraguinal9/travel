import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { repairJson, extractJsonObject } from './jsonRepair';

export type ResumeMode = 'ai' | 'rule';

export interface ResumeRequest {
  resume: string;
  jd?: string;
  mode?: ResumeMode;
  focus?: string;
}

export interface Suggestion {
  point: string;
  detail: string;
  severity: '高' | '中' | '低';
}

export interface ImprovedSection {
  section: string;
  content: string;
}

export interface ResumeResult {
  mode: ResumeMode;
  score: number; // 0-100
  suggestions: Suggestion[];
  improved?: ImprovedSection[];
  note: string;
}

export interface ResumeUsage {
  input: number;
  output: number;
  cost: number;
  peak: boolean;
}

// —— 规则模式：关键词提取（中文 2-6 字、英文 3+ 字母，过滤停用词）——
const STOPWORDS = new Set([
  '我们', '公司', '以及', '可以', '通过', '进行', '相关', '负责', '参与', '协助',
  '工作', '岗位', '职责', '要求', '任职', '优先', '以上', '以下', '具有', '具备',
  '能力', '经验', '一定', '良好', '沟通', '团队', '了解', '熟悉', '使用', '能够',
  'the', 'and', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'has',
]);

function extractKeywords(text: string): string[] {
  const out = new Set<string>();
  // 中文连续 2-6 字
  const cjk = text.match(/[一-龥]{2,6}/g) || [];
  for (const w of cjk) {
    if (!STOPWORDS.has(w)) out.add(w);
  }
  // 英文词 3+ 字母
  const en = text.toLowerCase().match(/[a-z][a-z0-9+#]{2,}/g) || [];
  for (const w of en) {
    if (!STOPWORDS.has(w)) out.add(w);
  }
  return Array.from(out);
}

function severityRank(s: Suggestion['severity']): number {
  return s === '高' ? 0 : s === '中' ? 1 : 2;
}

// —— 规则模式：启发式分析 ——
function analyzeRule(req: ResumeRequest): ResumeResult {
  const resume = (req.resume || '').trim();
  const jd = (req.jd || '').trim();
  const suggestions: Suggestion[] = [];
  const lines = resume
    .split(/[\n\r]+/)
    .map((l) => l.replace(/^[\s•·\-—–·]+/, '').trim())
    .filter(Boolean);

  // 1. 内容长度
  const chars = resume.replace(/\s/g, '').length;
  if (chars < 300) {
    suggestions.push({
      point: '简历内容偏短',
      detail: `当前约 ${chars} 字，建议补充具体项目、量化成果与技能栈，让 HR 更快看到匹配点。`,
      severity: '中',
    });
  } else if (chars > 3500) {
    suggestions.push({
      point: '简历可能偏长',
      detail: `当前约 ${chars} 字，社招简历建议控制在 1-2 页，突出与目标岗位最相关的经历。`,
      severity: '低',
    });
  }

  // 2. JD 关键词匹配
  let score = 60;
  if (jd) {
    const jdKw = extractKeywords(jd);
    const resumeLow = resume.toLowerCase();
    const matched = jdKw.filter((k) => resumeLow.includes(k.toLowerCase()));
    const miss = jdKw.filter((k) => !resumeLow.includes(k.toLowerCase()));
    const ratio = jdKw.length ? matched.length / jdKw.length : 0;
    score = Math.round(40 + ratio * 60);
    if (miss.length) {
      suggestions.push({
        point: `JD 关键词命中 ${matched.length}/${jdKw.length}`,
        detail: `岗位描述中的关键词尽量在简历中体现，建议补充：${miss.slice(0, 14).join('、')}。`,
        severity: '高',
      });
    } else {
      suggestions.push({
        point: '关键词匹配度高',
        detail: `简历基本覆盖了岗位描述的关键词，匹配分 ${score}。`,
        severity: '低',
      });
    }
  } else {
    score = 70;
  }

  // 3. 量化成果
  const longLines = lines.filter((l) => l.length > 15);
  const noNum = longLines.filter((l) => !/\d/.test(l));
  if (noNum.length >= 3) {
    suggestions.push({
      point: '较多要点缺少量化成果',
      detail: `有 ${noNum.length} 处描述没有数据支撑，建议补充「提升 X%」「节省 Y 小时」「服务 Z 用户/万」等量化结果。`,
      severity: '高',
    });
  }

  // 4. 弱动词
  const weak = ['负责', '参与', '协助', '帮助', '配合'];
  const weakHits = lines.filter((l) => weak.some((w) => l.startsWith(w) || l.includes(w + '了')));
  if (weakHits.length) {
    suggestions.push({
      point: '弱动词偏多',
      detail: `「${weak.join('、')}」等词弱化个人贡献，建议改为「主导/搭建/优化/推动/实现/带领」等强动词开头。`,
      severity: '中',
    });
  }

  // 5. 联系方式
  if (!/(1[3-9]\d{9})|(@[a-z0-9.]+)|微信|电话/.test(resume)) {
    suggestions.push({
      point: '缺少联系方式',
      detail: '简历建议包含手机号 / 邮箱，方便 HR 联系。',
      severity: '中',
    });
  }

  // 6. 聚焦要求
  if (req.focus && req.focus.trim()) {
    const f = req.focus.trim();
    if (!resume.includes(f) && !resume.toLowerCase().includes(f.toLowerCase())) {
      suggestions.push({
        point: '聚焦方向未体现',
        detail: `你希望突出「${f}」，但简历中未见相关表述，建议增加对应经历或成果。`,
        severity: '中',
      });
    }
  }

  // 排序：严重度优先
  suggestions.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  // 控制数量
  const shown = suggestions.slice(0, 8);

  return {
    mode: 'rule',
    score,
    suggestions: shown,
    note: `规则模式：基于关键词命中、量化、动词、长度等启发式规则给出优化建议（0 token，无需 AI）。`,
  };
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

async function genAI(req: ResumeRequest): Promise<{ result: ResumeResult; usage: ResumeUsage }> {
  const sys = `你是一位资深 HR 与简历优化顾问。用户给出简历原文、目标岗位 JD、以及可选的聚焦方向。
请输出一个 JSON 对象（不要 markdown、不要解释文字）：
{"note":"一句话整体评价","score":<0-100 匹配/质量分>,"suggestions":[{"point":"建议标题","detail":"具体说明","severity":"高|中|低"}],"improved":[{"section":"模块名(如:工作经历/项目经历/个人总结)","content":"改写后的该模块文字，用换行分隔要点"}]}
要求：建议要可落地、针对这份简历；improved 给出 2-4 个最值得改写的模块，文案专业、有量化、强动词开头。severity 按影响程度标注。`;

  const human = `【简历原文】
${req.resume || '（空）'}

【目标岗位 JD】
${req.jd || '（未提供，按通用优质简历标准优化）'}

【聚焦方向】${req.focus?.trim() ? req.focus.trim() : '（无）'}`;

  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.7,
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

  const suggestions: Suggestion[] = (json.suggestions || []).slice(0, 10).map((x: any) => ({
    point: String(x.point || ''),
    detail: String(x.detail || ''),
    severity: ['高', '中', '低'].includes(x.severity) ? x.severity : '中',
  }));
  const improved: ImprovedSection[] = (json.improved || []).slice(0, 4).map((x: any) => ({
    section: String(x.section || '模块'),
    content: String(x.content || ''),
  }));
  const score = Math.max(0, Math.min(100, Number(json.score) || 0));
  const note = typeof json.note === 'string' ? json.note : 'AI 结合你的简历与岗位做了针对性优化。';
  const cost = computeCost(usageAcc.input, usageAcc.output);
  return {
    result: { mode: 'ai', score, suggestions, improved, note },
    usage: { input: usageAcc.input, output: usageAcc.output, cost: cost.cost, peak: cost.peak },
  };
}

export async function optimizeResume(req: ResumeRequest): Promise<{ result: ResumeResult; usage?: ResumeUsage }> {
  if (req.mode === 'rule') {
    return { result: analyzeRule(req) };
  }
  return genAI(req);
}
