// 移植自 TripStar 的 JSON 容错逻辑（Python -> TS）
// LLM 输出的 JSON 一定会脏（截断、尾巴逗号、中文引号、算术表达式），必须修复后再 parse

/**
 * 清理常见的 JSON 格式污染
 */
export function sanitizeJsonString(input: string): string {
  let s = input.trim();
  // 1. 去掉 ```json ... ``` 包裹
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // 2. 去掉 JS 风格注释
  s = s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // 3. 去掉控制字符
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // 4. 修复尾部逗号 ,] },
  s = s.replace(/,\s*([\]\}])/g, '$1');
  // 5. 中文引号 -> 单引号（值内部，绝不可变双引号否则破坏结构）
  s = s.replace(/[\u201c\u201d]/g, "'").replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/：/g, ':').replace(/，/g, ',');
  // 6. 修复冒号后的算术表达式 "30+54=324" -> 324
  s = s.replace(/:\s*(\d+(?:\s*[+\-*/]\s*\d+)+(?:\s*=\s*\d+)?)/g, (m, expr) => {
    const e = String(expr).trim();
    if (e.includes('=')) return m.replace(expr, e.split('=').pop()!.trim());
    try {
      // eslint-disable-next-line no-new-func
      const r = Function('"use strict";return (' + e.replace(/\s+/g, '') + ')')();
      return m.replace(expr, String(r));
    } catch {
      return m;
    }
  });
  return s;
}

/**
 * 修复 JSON 字符串值内部未转义的双引号
 * 例如: "description": "这是"好的"景点" -> "这是'好的'景点"
 */
export function fixUnescapedQuotes(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        const rest = jsonStr.slice(i + 1).replace(/^\s+/, '');
        if (!rest || ']},:'.includes(rest[0])) {
          inString = false;
          result += ch;
        } else {
          result += "'";
        }
      }
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * 修复被 max_tokens 截断的不完整 JSON
 */
export function repairTruncatedJson(jsonStr: string): string {
  let s = jsonStr.replace(/\s+$/, '');
  if (!s) return s;

  // Step 1: 关闭未终止的字符串
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
  }
  if (inStr) {
    s = s.replace(/\\$/, '') + '"';
  }

  // Step 2: 按括号栈补齐缺失的 ] 和 }
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === '[') stack.push(']');
    else if (ch === '{') stack.push('}');
    else if (ch === ']' || ch === '}') {
      if (stack[stack.length - 1] === ch) stack.pop();
    }
  }
  s += stack.reverse().join('');

  return s;
}

/**
 * 从模型输出文本中提取第一个完整 JSON 对象（按括号配平）
 */
export function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return end === -1 ? text.slice(start) : text.slice(start, end + 1);
}

/**
 * 主入口：多层兜底修复，返回可解析的 JSON 字符串
 */
export function repairJson(raw: string): string {
  let s = sanitizeJsonString(raw);
  s = fixUnescapedQuotes(s);
  try {
    JSON.parse(s);
    return s;
  } catch {
    /* fallthrough */
  }
  s = repairTruncatedJson(s);
  s = sanitizeJsonString(s);
  try {
    JSON.parse(s);
    return s;
  } catch {
    /* 已尽力，交由调用方处理 */
  }
  return s;
}
