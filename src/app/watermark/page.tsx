'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    cv?: any;
  }
}

export default function WatermarkPage() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const resultRef = useRef<HTMLCanvasElement | null>(null);

  const [cvReady, setCvReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brush, setBrush] = useState(24);
  const [radius, setRadius] = useState(4);
  const [method, setMethod] = useState<'TELEA' | 'NS'>('TELEA');
  const [hasMask, setHasMask] = useState(false);
  const [msg, setMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // 加载本地 OpenCV.js（wasm 已内嵌，自包含）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.cv && window.cv.Mat && window.cv.inpaint) {
      setCvReady(true);
      return;
    }
    const s = document.createElement('script');
    s.src = '/watermark/opencv.js';
    s.async = true;
    s.onload = () => {
      const poll = () => {
        if (window.cv && window.cv.Mat && window.cv.inpaint) setCvReady(true);
        else setTimeout(poll, 120);
      };
      poll();
    };
    s.onerror = () => setLoadError(true);
    document.body.appendChild(s);
  }, []);

  const setupMask = () => {
    const img = imgRef.current;
    const cvs = maskRef.current;
    if (!img || !cvs || !img.naturalWidth) return;
    cvs.width = img.naturalWidth;
    cvs.height = img.naturalHeight;
    const ctx = cvs.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
    }
    setHasMask(false);
    setResultUrl(null);
  };

  const onFile = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
      setMsg('请选择图片文件');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = imgRef.current;
    if (!img) return;
    img.onload = () => {
      setImgLoaded(true);
      setMsg('');
      setupMask();
    };
    img.src = url;
  };

  const ptFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cvs = maskRef.current!;
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const drawAt = (p: { x: number; y: number }) => {
    const cvs = maskRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const rect = cvs.getBoundingClientRect();
    const scale = cvs.width / rect.width;
    const r = brush * scale;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = r;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lp = lastPt.current;
    if (lp) {
      ctx.beginPath();
      ctx.moveTo(lp.x, lp.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPt.current = p;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cvReady || !imgLoaded) return;
    drawing.current = true;
    lastPt.current = null;
    (e.target as Element).setPointerCapture(e.pointerId);
    drawAt(ptFromEvent(e));
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawAt(ptFromEvent(e));
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
    setHasMask(true);
  };

  const clearMask = () => setupMask();

  const runInpaint = () => {
    if (!cvReady || !imgLoaded) {
      setMsg('请先上传图片并等待引擎加载');
      return;
    }
    const img = imgRef.current;
    const maskCvs = maskRef.current;
    const outCvs = resultRef.current;
    if (!img || !maskCvs || !outCvs) return;
    const ctx = maskCvs.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, maskCvs.width, maskCvs.height).data;
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 40) painted++;
    }
    if (painted < 20) {
      setMsg('请先用鼠标在图片上的水印区域涂抹（白色笔迹）');
      return;
    }
    setBusy(true);
    setMsg('正在修复中…');
    try {
      const cv = window.cv!;
      const src = cv.imread(img);
      const maskRaw = cv.imread(maskCvs);
      const mask = new cv.Mat();
      cv.cvtColor(maskRaw, mask, cv.COLOR_RGBA2GRAY);
      cv.threshold(mask, mask, 30, 255, cv.THRESH_BINARY);
      const dst = new cv.Mat();
      const flag = method === 'TELEA' ? cv.INPAINT_TELEA : cv.INPAINT_NS;
      cv.inpaint(src, mask, dst, Number(radius), flag);
      cv.imshow(outCvs, dst);
      const url = outCvs.toDataURL('image/png');
      setResultUrl(url);
      setMsg('修复完成，可下载保存');
      src.delete();
      maskRaw.delete();
      mask.delete();
      dst.delete();
    } catch (err: any) {
      setMsg('处理失败：' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16, color: '#222' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>图片去水印</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 16 }}>
        上传图片 → 用鼠标在<strong>水印区域</strong>涂抹 → 一键修复并下载干净图。全程在浏览器本地处理，不上传服务器、零费用、不依赖任何平台。
      </p>

      {!cvReady && !loadError && (
        <div style={{ padding: '20px', background: '#eef4fb', borderRadius: 10, color: '#185fa5', fontSize: 14 }}>
          正在加载去水印引擎（首次约 13MB，稍候几秒）…
        </div>
      )}
      {loadError && (
        <div style={{ padding: '16px', background: '#fde8e8', borderRadius: 10, color: '#c0392b', fontSize: 14 }}>
          OpenCV 引擎加载失败，请刷新页面重试。
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        {/* 左：上传 + 操作 */}
        <section style={{ flex: '1 1 320px', minWidth: 300 }}>
          <label
            style={{
              display: 'block',
              border: '2px dashed #bbb',
              borderRadius: 10,
              padding: 20,
              textAlign: 'center',
              cursor: 'pointer',
              color: '#555',
              fontSize: 14,
            }}
          >
            点击选择图片，或拖拽 / 粘贴到此处
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>笔刷大小：{brush}px</div>
              <input type="range" min={6} max={80} value={brush} onChange={(e) => setBrush(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>修复强度（半径）：{radius}</div>
              <input type="range" min={1} max={12} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>算法</div>
              <select value={method} onChange={(e) => setMethod(e.target.value as 'TELEA' | 'NS')} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ccc' }}>
                <option value="TELEA">TELEA（快，适合文字/小标记）</option>
                <option value="NS">NS（平滑，适合大块区域）</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={runInpaint}
                disabled={!cvReady || !imgLoaded || busy}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: cvReady && imgLoaded && !busy ? '#185fa5' : '#b9c7d6',
                  color: '#fff',
                  fontSize: 15,
                  cursor: cvReady && imgLoaded && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? '修复中…' : '去水印'}
              </button>
              <button
                onClick={clearMask}
                disabled={!imgLoaded}
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#333', fontSize: 15, cursor: imgLoaded ? 'pointer' : 'not-allowed' }}
              >
                清空涂抹
              </button>
            </div>
            {msg && <div style={{ fontSize: 13, color: '#185fa5' }}>{msg}</div>}
          </div>

          <p style={{ fontSize: 12, color: '#999', marginTop: 12, lineHeight: 1.6 }}>
            适用：边角文字、半透明 logo、纯色背景上的标记等简单水印效果最好；复杂/大面积水印还原有限，请酌情使用。仅用于你<strong>自有或已授权</strong>的内容。
          </p>
        </section>

        {/* 右：画布 + 结果 */}
        <section style={{ flex: '2 1 460px', minWidth: 320 }}>
          <div
            style={{ position: 'relative', border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', background: '#fafafa' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            onPaste={(e) => {
              const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
              if (item) onFile(item.getAsFile());
            }}
          >
            {!imgLoaded && (
              <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontSize: 14 }}>预览区</div>
            )}
            <img ref={imgRef} alt="" style={{ display: imgLoaded ? 'block' : 'none', width: '100%', userSelect: 'none' }} />
            <canvas
              ref={maskRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: imgLoaded ? 'block' : 'none',
                cursor: cvReady ? 'crosshair' : 'default',
                touchAction: 'none',
              }}
            />
          </div>
          {resultUrl && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>修复结果</div>
              <img src={resultUrl} alt="修复结果" style={{ width: '100%', borderRadius: 10, border: '1px solid #eee' }} />
              <a
                href={resultUrl}
                download="watermark_removed.png"
                style={{ display: 'inline-block', marginTop: 10, padding: '10px 16px', borderRadius: 8, background: '#1e8e3e', color: '#fff', textDecoration: 'none', fontSize: 15 }}
              >
                下载干净图
              </a>
            </div>
          )}
          <canvas ref={resultRef} style={{ display: 'none' }} />
        </section>
      </div>
    </main>
  );
}
