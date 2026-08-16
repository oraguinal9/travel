// 语音播报 —— 浏览器原生 Web Speech API（speechSynthesis）
// 零依赖、零 Key：Windows 上的 Edge/Chrome 自动使用微软中文语音（Yunxi / Kangkang 等）。
// 参考 web-ai-voice-assistant 经验包：男声锁定 / 语音异步加载 / 打断竞态 / markdown 清洗。
// 注意：所有 window 访问都做 typeof 守卫，保证 Next.js 服务端渲染（SSR）导入不报错。

const MALE_RE =
  /male|男|康|kang|kangkang|yunxi|yunjian|yunyang|yunhao|yunjhe|wanlung|zhangwei|guang|liang|daniel|david|george|harry|james/i;

function maleRank(v: SpeechSynthesisVoice): number {
  const n = v.name || '';
  if (/yunyang|yunhao/i.test(n)) return 0;
  if (/yunxi|yunjian|yunjhe|wanlung/i.test(n)) return 1;
  if (/kang|康/i.test(n)) return 2;
  return 3;
}

let voice: SpeechSynthesisVoice | null = null;
let basePitch = 0.84; // 男声基线；无男声时压到 0.55 低沉化
let epoch = 0; // 打断代次：旧队列回调发现代次不匹配则忽略
let preparing = false;

function loadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const isMale = (v: SpeechSynthesisVoice) => MALE_RE.test((v.name || '') + ' ' + (v.lang || ''));
  const zhCN = (v: SpeechSynthesisVoice) => /zh[-_]CN/i.test(v.lang);
  const maleZh = voices.filter((v) => /zh/i.test(v.lang) && isMale(v));
  const v =
    maleZh.slice().sort((a, b) => maleRank(a) - maleRank(b))[0] ||
    voices.find((x) => zhCN(x)) ||
    voices.find((x) => /zh/i.test(x.lang)) ||
    null;
  voice = v;
  basePitch = v && isMale(v) ? 0.84 : 0.55;
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

// 语音列表异步加载（Edge 在线男声要几秒）：轮询最多 ~6s 直到就位
function ensureVoicesReady(cb: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return cb();
  if (preparing) return;
  loadVoices();
  if (voice) return cb();
  preparing = true;
  const deadline = Date.now() + 6000;
  const tryWait = () => {
    loadVoices();
    if (voice || Date.now() >= deadline) {
      preparing = false;
      cb();
    } else {
      setTimeout(tryWait, 400);
    }
  };
  tryWait();
}

export function prepareVoices() {
  ensureVoicesReady(() => {});
}

// 朗读前清洗：去掉 markdown 标记，避免 TTS 念出"星号星号"
export function cleanText(t: string): string {
  return String(t)
    .replace(/```[\s\S]*?(```|$)/g, '（代码块）')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\*\*([^*\n]*)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.、)]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// 把结构化行程拼成可朗读文案
export function planToSpeech(plan: any): string {
  if (!plan) return '';
  const lines: string[] = [];
  lines.push(`为你播报${plan.city || ''}的${plan.days?.length || ''}天行程。`);
  (plan.days || []).forEach((d: any, i: number) => {
    lines.push(`第${i + 1}天，${d.date || ''}，${d.city || plan.city || ''}。${d.description || ''}`);
    (d.attractions || []).forEach((a: any) => {
      lines.push(`参观${a.name || ''}，${a.description || ''}${a.ticket_price ? `，门票约${a.ticket_price}元` : ''}。`);
    });
    (d.meals || []).forEach((m: any) => {
      const label = m.type === 'lunch' ? '午餐' : m.type === 'dinner' ? '晚餐' : m.type || '用餐';
      lines.push(`${label}推荐${m.name || ''}。`);
    });
    if (d.hotel?.name) lines.push(`住宿${d.hotel.name}。`);
  });
  if (plan.overall_suggestions) lines.push(`总体建议：${plan.overall_suggestions}`);
  if (plan.budget?.total) lines.push(`总预算约${plan.budget.total}元。`);
  return lines.join('');
}

// 朗读（按句切段 + 代次防打断竞态）
export function speak(text: string, onDone?: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onDone?.();
    return;
  }
  const plain = cleanText(text);
  if (!plain) {
    onDone?.();
    return;
  }
  ensureVoicesReady(() => {
    const synth = window.speechSynthesis;
    synth.cancel();
    synth.resume();
    const myEpoch = ++epoch;
    const segs = plain.split(/(?<=[。！？；;.!?])/).filter(Boolean);
    let idx = 0;
    const next = () => {
      if (myEpoch !== epoch) return; // 已被打断
      if (idx >= segs.length) {
        onDone?.();
        return;
      }
      const u = new SpeechSynthesisUtterance(segs[idx++]);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'zh-CN';
      u.pitch = basePitch;
      u.rate = 1.0;
      const done = () => {
        if (myEpoch !== epoch) return;
        next();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    };
    next();
  });
}

export function stop() {
  epoch++; // 让进行中的分段回调失效
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}
