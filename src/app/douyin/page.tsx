'use client';

import { useState } from 'react';

interface DouyinResult {
  title: string;
  cover: string | null;
  cleanUrl: string;
}

export default function DouyinPage() {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState<DouyinResult | null>(null);

  const parse = async () => {
    setErr('');
    setData(null);
    if (!link.trim()) {
      setErr('请粘贴抖音分享链接');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/douyin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.error || '解析失败');
      } else {
        setData({ title: j.title, cover: j.cover, cleanUrl: j.cleanUrl });
      }
    } catch (e: any) {
      setErr(e?.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const streamUrl = data ? `/api/douyin?stream=${encodeURIComponent(data.cleanUrl)}` : '';
  const dlUrl = data ? `/api/douyin?dl=${encodeURIComponent(data.cleanUrl)}` : '';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 16, color: '#222' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>抖音视频去水印</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 16 }}>
        粘贴抖音<strong>分享链接</strong>（支持 <code>v.douyin.com</code> 短链，会自动解析），服务端提取抖音官方无水印版本直链并代理下载。视频不会长期存储在我们的服务器上。
      </p>

      <div
        style={{
          border: '2px dashed #bbb',
          borderRadius: 10,
          padding: 16,
          background: '#fafafa',
        }}
      >
        <textarea
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="在此粘贴抖音分享链接，例如：https://v.douyin.com/iRxxxx/  或带文案的整段分享文本"
          style={{
            width: '100%',
            minHeight: 80,
            resize: 'vertical',
            padding: 10,
            fontSize: 14,
            borderRadius: 8,
            border: '1px solid #ccc',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={parse}
            disabled={loading}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#b9c7d6' : '#185fa5',
              color: '#fff',
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '解析中…' : '解析去水印'}
          </button>
          {loading && <span style={{ fontSize: 13, color: '#999' }}>正在连接抖音…</span>}
        </div>
        {err && <div style={{ marginTop: 12, fontSize: 13, color: '#c0392b' }}>{err}</div>}
      </div>

      {data && (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {data.title || '（无标题）'}
          </div>
          {data.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.cover}
              alt="封面"
              style={{ width: 160, borderRadius: 8, border: '1px solid #eee', marginBottom: 12 }}
            />
          )}
          <div style={{ marginTop: 8 }}>
            <video
              src={streamUrl}
              controls
              style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 480 }}
            />
          </div>
          <a
            href={dlUrl}
            style={{
              display: 'inline-block',
              marginTop: 12,
              padding: '10px 18px',
              borderRadius: 8,
              background: '#1e8e3e',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 15,
            }}
          >
            下载无水印视频
          </a>
        </section>
      )}

      <p style={{ fontSize: 12, color: '#999', marginTop: 24, lineHeight: 1.7 }}>
        说明：本工具通过解析抖音公开分享链接获取其官方提供的无水印播放地址，不涉及破解或 AI
        重绘。抖音接口可能随版本调整而暂时失效；若提示解析失败，请稍后重试或换一个视频。
        <br />
        <strong>仅用于您本人拥有或已获授权的内容。</strong>请遵守抖音用户协议与相关版权法规，勿将本工具用于侵犯他人权益的用途。
      </p>
    </main>
  );
}
