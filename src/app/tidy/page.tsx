'use client';

import { useState } from 'react';

interface TidyCategory { category: string; count: number; files: string[]; }
interface TidyRename { from: string; to: string; reason: string; }
interface TidyResult {
  total: number;
  categories: TidyCategory[];
  duplicates: string[][];
  renames: TidyRename[];
  summary: string;
  ai: boolean;
}

const CAT_COLOR: Record<string, string> = {
  图片: '#0ea5e9', 视频: '#8b5cf6', 音频: '#ec4899',
  文档: '#f59e0b', 电子书: '#d97706', 压缩包: '#64748b',
  代码: '#10b981', 其他: '#94a3b8',
};

export default function TidyPage() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'rule' | 'ai'>('rule');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<TidyResult | null>(null);
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number; mode: string } | null>(null);

  async function run() {
    if (!text.trim()) { setErr('请先粘贴文件列表'); return; }
    setErr(''); setLoading(true); setResult(null);
    try {
      const r = await fetch('/api/tidy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode }),
      });
      const data = await r.json();
      if (r.status === 429) { setErr(data.message || '今日次数已用完'); return; }
      if (!r.ok) { setErr(data.error || '请求失败'); return; }
      setResult(data.result);
      setUsage(data.usage);
    } catch (e: any) {
      setErr(e?.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }

  const sample = `D:\\照片\\IMG_20240101_001.jpg
D:\\照片\\IMG_20240101_002.jpg
D:\\照片\\Screenshot 2024-02-03.png
D:\\文档\\发票_2024.pdf
D:\\文档\\报销单 final final.docx
D:\\文档\\合同-最终版-真的_final.pdf
D:\\下载\\安装包.zip
D:\\下载\\movie.mp4
D:\\下载\\song.mp3
D:\\备份\\IMG_20240101_001.jpg`;

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 60px' }}>
      <h1 style={{ fontSize: 22, color: '#185fa5', marginBottom: 6 }}>文件整理智能体</h1>
      <p style={{ color: '#555', fontSize: 14, marginBottom: 14 }}>
        粘贴你的文件列表（每行一个路径，可用 <code>tree /f</code>、<code>dir /s /b</code> 或手动粘贴），AI 帮你分类、找重复、规范命名。
      </p>

      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
        🔒 <b>只读模式</b>：本工具只分析你粘贴的<strong>文本</strong>，绝不访问或改动你电脑上的任何真实文件。所有建议需你自行执行。
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => setMode('rule')}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, background: mode === 'rule' ? '#185fa5' : '#e2e8f0', color: mode === 'rule' ? '#fff' : '#333' }}
        >
          规则模式（免 AI·快）
        </button>
        <button
          onClick={() => setMode('ai')}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, background: mode === 'ai' ? '#185fa5' : '#e2e8f0', color: mode === 'ai' ? '#fff' : '#333' }}
        >
          AI 语义整理
        </button>
        <button onClick={() => setText(sample)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          填入示例
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'每行一个文件路径，例如：\nD:\\照片\\IMG_20240101_001.jpg\nD:\\文档\\发票_2024.pdf'}
        style={{ width: '100%', height: 200, padding: 12, borderRadius: 10, border: '1px solid #ccc', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
      />

      <div style={{ margin: '14px 0' }}>
        <button
          onClick={run}
          disabled={loading}
          style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: '#185fa5', color: '#fff', fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '分析中…' : '生成整理方案'}
        </button>
        {usage && (
          <span style={{ marginLeft: 14, color: '#666', fontSize: 13 }}>
            本次消耗 {usage.inputTokens + usage.outputTokens} tokens（{usage.mode === 'ai' ? 'AI 语义' : '规则'}）
          </span>
        )}
      </div>

      {err && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 14 }}>{err}</div>}

      {result && (
        <div style={{ marginTop: 10 }}>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px 16px', borderRadius: 10, fontSize: 14, color: '#0c4a6e', marginBottom: 18 }}>
            <b>📋 方案总结：</b>{result.summary}
          </div>

          {/* 分类 */}
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>① 分类建议（{result.categories.length} 类）</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            {result.categories.map((c) => (
              <div key={c.category} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLOR[c.category] || '#94a3b8' }} />
                  <b style={{ fontSize: 14 }}>{c.category}</b>
                  <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>{c.count} 个</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#555', maxHeight: 120, overflow: 'auto' }}>
                  {c.files.slice(0, 20).map((f, i) => <li key={i} style={{ wordBreak: 'break-all' }}>{f}</li>)}
                  {c.files.length > 20 && <li style={{ color: '#aaa' }}>…还有 {c.files.length - 20} 个</li>}
                </ul>
              </div>
            ))}
          </div>

          {/* 重复 */}
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>② 重复文件（{result.duplicates.length} 组）</h2>
          {result.duplicates.length === 0 ? (
            <p style={{ color: '#888', fontSize: 14 }}>未发现同名重复文件。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {result.duplicates.map((g, i) => (
                <div key={i} style={{ border: '1px solid #fecaca', background: '#fff5f5', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 4 }}>第 {i + 1} 组（同名 {g.length} 处）</div>
                  {g.map((p, j) => <div key={j} style={{ fontSize: 13, color: '#555', wordBreak: 'break-all' }}>• {p}</div>)}
                </div>
              ))}
            </div>
          )}

          {/* 重命名 */}
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>③ 重命名建议（{result.renames.length} 个）</h2>
          {result.renames.length === 0 ? (
            <p style={{ color: '#888', fontSize: 14 }}>命名基本规范，无需重命名。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {result.renames.map((r, i) => (
                <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff', fontSize: 13 }}>
                  <div style={{ wordBreak: 'break-all' }}><span style={{ color: '#b91c1c' }}>✗ {r.from}</span></div>
                  <div style={{ wordBreak: 'break-all', marginTop: 4 }}><span style={{ color: '#15803d' }}>✓ {r.to}</span></div>
                  <div style={{ color: '#888', marginTop: 2, fontSize: 12 }}>理由：{r.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
