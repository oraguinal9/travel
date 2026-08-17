import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { extractJsonObject } from './jsonRepair';

export interface TidyFile {
  raw: string; // 原始行
  path: string; // 规整后的路径(去前后空格)
  name: string; // 文件名(含扩展名)
  ext: string; // 小写扩展名(无点)
}

export interface TidyCategory {
  category: string;
  count: number;
  files: string[]; // 原路径
}

export interface TidyRename {
  from: string;
  to: string;
  reason: string;
}

export interface TidyResult {
  total: number;
  categories: TidyCategory[];
  duplicates: string[][]; // 每组相同文件名(忽略大小写)的不同路径
  renames: TidyRename[];
  summary: string;
  ai: boolean;
}

// —— 扩展名 → 默认分类 ——
const EXT_MAP: Record<string, string> = {
  jpg: '图片', jpeg: '图片', png: '图片', gif: '图片', webp: '图片', heic: '图片',
  bmp: '图片', tiff: '图片', svg: '图片', raw: '图片', cr2: '图片', nef: '图片',
  pdf: '文档', doc: '文档', docx: '文档', xls: '文档', xlsx: '文档', ppt: '文档',
  pptx: '文档', txt: '文档', md: '文档', csv: '文档', pages: '文档', key: '文档',
  numbers: '文档', rtf: '文档', epub: '电子书', mobi: '电子书', azw: '电子书',
  mp4: '视频', mov: '视频', avi: '视频', mkv: '视频', webm: '视频', flv: '视频', wmv: '视频',
  mp3: '音频', wav: '音频', flac: '音频', m4a: '音频', aac: '音频', ogg: '音频',
  zip: '压缩包', rar: '压缩包', '7z': '压缩包', tar: '压缩包', gz: '压缩包', iso: '压缩包',
  js: '代码', ts: '代码', py: '代码', java: '代码', c: '代码', cpp: '代码', go: '代码',
  rs: '代码', html: '代码', css: '代码', json: '代码', ipynb: '代码', sh: '代码', sql: '代码',
};

// 仅保留字母数字、中文、点、下划线、连字符、空格
function cleanPath(line: string): string {
  return line.replace(/^[\s│├└─+\\|]+/, '').replace(/\s+$/, '');
}

export function parseList(text: string): TidyFile[] {
  const out: TidyFile[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const p = cleanPath(line);
    if (!p) continue;
    // 目录行(以 / 或 \ 结尾、且无扩展名)跳过，除非它带文件
    const name = p.split(/[\\/]/).pop() || p;
    if (!name || name.endsWith('/') || name.endsWith('\\')) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    out.push({ raw: line, path: p, name, ext });
  }
  return out;
}

// —— 规则模式：扩展名分类 + 重复 + 重命名规范化 ——
export function planTidyRule(files: TidyFile[]): TidyResult {
  const cats = new Map<string, string[]>();
  for (const f of files) {
    const c = EXT_MAP[f.ext] || '其他';
    if (!cats.has(c)) cats.set(c, []);
    cats.get(c)!.push(f.path);
  }
  const categories: TidyCategory[] = [...cats.entries()]
    .map(([category, fs]) => ({ category, count: fs.length, files: fs }))
    .sort((a, b) => b.count - a.count);

  // 同名重复(忽略大小写、忽略路径)
  const byName = new Map<string, string[]>();
  for (const f of files) {
    const k = f.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(f.path);
  }
  const duplicates = [...byName.values()].filter((g) => g.length > 1);

  const renames = suggestRenames(files);

  const summary = buildSummary(files.length, categories, duplicates, renames);
  return { total: files.length, categories, duplicates, renames, summary, ai: false };
}

// 重命名规范化：空格/下划线→连字符、扩展名小写、相机/社交命名提示
function suggestRenames(files: TidyFile[]): TidyRename[] {
  const out: TidyRename[] = [];
  const camPat = /^(img|vid|mvimg|screenshot|微信图片|mmexport|微信视频|snapchat|instantboard)[_ ]/i;
  for (const f of files) {
    let to = f.name;
    const reasons: string[] = [];
    // 扩展名小写
    if (f.ext && f.name !== f.name.toLowerCase() && /[A-Z]/.test(f.ext)) {
      to = to.slice(0, to.length - f.ext.length) + f.ext;
    }
    // 空格/全角空格/下划线 → 连字符
    const normalized = to.replace(/[ _　]+/g, '-');
    if (normalized !== to) {
      to = normalized;
      reasons.push('空白/下划线转连字符');
    }
    // 相机/社交默认命名 → 提示按时间或主题
    if (camPat.test(f.name)) {
      reasons.push('默认相机/社交命名，建议改为语义化(如 2024-春节-三亚-001)');
      // 给一个示例：保留序号
      const seq = f.name.replace(camPat, '').replace(/\.[^.]+$/, '');
      to = `主题-${seq || '001'}.${f.ext || 'jpg'}`;
    }
    if (reasons.length) {
      out.push({ from: f.path, to, reason: reasons.join('；') });
    }
  }
  return out.slice(0, 60);
}

function buildSummary(total: number, cats: TidyCategory[], dups: string[][], rens: TidyRename[]): string {
  const top = cats.slice(0, 3).map((c) => `${c.category} ${c.count}`).join('、');
  let s = `共解析 ${total} 个文件，主要类型：${top || '无'}。`;
  if (dups.length) s += `发现 ${dups.length} 组同名重复文件，建议核对后保留一份。`;
  if (rens.length) s += `有 ${rens.length} 个文件命名不规范，建议规范化。`;
  s += '（本结果为只读分析，未改动任何文件）';
  return s;
}

// —— AI 模式：DeepSeek 语义整理 ——
export async function planTidyAI(
  files: TidyFile[]
): Promise<{ result: TidyResult; inputTokens: number; outputTokens: number }> {
  let inputTokens = 0;
  let outputTokens = 0;
  const usageCb: any = {
    handleLLMEnd: (output: any) => {
      const u = output?.llmOutput?.usage || output?.llmOutput?.tokenUsage;
      if (u) {
        inputTokens = u.prompt_tokens || u.input_tokens || inputTokens;
        outputTokens = u.completion_tokens || u.output_tokens || outputTokens;
      }
    },
  };
  const llm = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' },
    temperature: 0.3,
  });

  const list = files.map((f) => f.path).slice(0, 300).join('\n');
  const sys = `你是文件整理助手。用户粘贴了一份文件列表（每行一个文件路径，可能来自 Windows 的 dir /s /b、tree 或手动粘贴）。请分析并给出整理方案。
只输出 JSON，不要任何解释文字。格式：
{
 "categories":[{"category":"分类名(中文,语义化,如 图片/文档/视频/发票收据/旅行照片/工作文档/电子书/代码/其他)","files":["原路径1","原路径2"]}],
 "renames":[{"from":"原路径","to":"建议新名(语义化、含合理扩展名)","reason":"简短理由"}],
 "duplicates":[["路径a","路径b"]],
 "summary":"中文一句话总结(含文件总数与主要建议)"
}
规则：
- categories 需覆盖所有文件，每个文件只归入一个最贴切分类；分类名要语义化（例如把发票、收据、报销单归为「发票收据」，把 IMG/旅行照片归为「旅行照片」，把合同、方案、报告归为「工作文档」）。
- renames 只对命名混乱的文件给建议（如 IMG_20240101_001.jpg → 2024-春节-三亚-001.jpg；空格/中文日期规范化）；不要给所有文件重命名。
- duplicates 是文件名相同（忽略大小写）出现在不同路径的文件组。
- 绝对不要编造路径：categories/renames.from/duplicates 里的路径只能来自用户原列表。`;

  const msg: any = await llm.invoke(
    [new SystemMessage(sys), new HumanMessage('文件列表：\n' + list)],
    { callbacks: [usageCb] } as any
  );
  const um = msg?.usage_metadata || msg?.response_metadata?.usage;
  if (um) {
    inputTokens = um.input_tokens || um.prompt_tokens || inputTokens;
    outputTokens = um.output_tokens || um.completion_tokens || outputTokens;
  }

  let ai: any = {};
  try {
    ai = extractJsonObject(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
  } catch {
    ai = {};
  }

  // 用规则结果兜底，保证结构完整
  const rule = planTidyRule(files);
  const categories: TidyCategory[] = Array.isArray(ai.categories)
    ? ai.categories.map((c: any) => ({
        category: String(c.category || '其他'),
        count: Array.isArray(c.files) ? c.files.length : 0,
        files: Array.isArray(c.files) ? c.files.map(String) : [],
      }))
    : rule.categories;
  const duplicates: string[][] = Array.isArray(ai.duplicates)
    ? ai.duplicates.map((g: any) => (Array.isArray(g) ? g.map(String) : [String(g)]))
    : rule.duplicates;
  const renames: TidyRename[] = Array.isArray(ai.renames)
    ? ai.renames.slice(0, 60).map((r: any) => ({
        from: String(r.from || ''),
        to: String(r.to || ''),
        reason: String(r.reason || ''),
      }))
    : rule.renames;
  const summary =
    typeof ai.summary === 'string' && ai.summary
      ? ai.summary + '（AI 语义分析，只读，未改动文件）'
      : rule.summary;

  return {
    result: { total: files.length, categories, duplicates, renames, summary, ai: true },
    inputTokens,
    outputTokens,
  };
}
