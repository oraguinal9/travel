'use client';

import { useRef, useState } from 'react';

export default function WatermarkPage() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const resultRef = useRef<HTMLCanvasElement | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brush, setBrush] = useState(24);
  const [sweeps, setSweeps] = useState(60);
  const [hasMask, setHasMask] = useState(false);
  const [msg, setMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

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
    if (!imgLoaded) return;
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

  // 纯 JS 调和插值修复（Laplace 松弛 / Gauss-Seidel 迭代），无需任何外部依赖
  const runInpaint = () => {
    if (!imgLoaded) {
      setMsg('请先上传图片');
      return;
    }
    const img = imgRef.current;
    const maskCvs = maskRef.current;
    const outCvs = resultRef.current;
    if (!img || !maskCvs || !outCvs) return;
    const mctx = maskCvs.getContext('2d');
    if (!mctx) return;
    const md = mctx.getImageData(0, 0, maskCvs.width, maskCvs.height).data;
    let painted = 0;
    for (let i = 0; i < md.length; i += 4) if (md[i] > 40) painted++;
    if (painted < 20) {
      setMsg('请先用鼠标在图片上的水印区域涂抹（白色笔迹）');
      return;
    }
    setBusy(true);
    setMsg('正在修复中…');
    try {
      const w = maskCvs.width;
      const h = maskCvs.height;
      // 把原图绘制到结果画布（自然尺寸），逐像素处理
      outCvs.width = w;
      outCvs.height = h;
      const octx = outCvs.getContext('2d')!;
      octx.drawImage(img, 0,0, w, h);
      const imgData = octx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const N = w * h;
      const mask = new Uint8Array(N);
      for (let i = 0; i < N; i++) mask[i] = md[i * 4] > 40 ? 1 : 0;

      const r = new Float32Array(N);
      const g = new Float32Array(N);
      const b = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        r[i] = data[i * 4];
        g[i] = data[i * 4 + 1];
        b[i] = data[i * 4 + 2];
      }
      const iters = Math.max(20, Math.min(200, sweeps));
      for (let s = 0; s < iters; s++) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!mask[idx]) continue;
            let sr = 0, sg = 0, sb = 0, n = 0;
            if (y > 0) { const j = idx - w; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (y < h - 1) { const j = idx + w; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (x > 0) { const j = idx - 1; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (x < w - 1) { const j = idx + 1; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (n) { r[idx] = sr / n; g[idx] = sg / n; b[idx] = sb / n; }
          }
        }
      }
      for (let i = 0; i < N; i++) {
        data[i * 4] = r[i];
        data[i * 4 + 1] = g[i];
        data[i * 4 + 2] = b[i];
      }
      octx.putImageData(imgData, 0, 0);
      const url = outCvs.toDataURL('image/png');
      setResultUrl(url);
      setMsg('修复完成，可下载保存');
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
        上传图片 → 用鼠标在<strong>水印区域</strong>涂抹 → 一键修复并下载干净图。全程在浏览器本地处理，不上传服务器、零费用、不依赖任何平台，打开即用。
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
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
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>修复强度（迭代次数）：{sweeps}</div>
              <input type="range" min={20} max={200} value={sweeps} onChange={(e) => setSweeps(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={runInpaint}
                disabled={!imgLoaded || busy}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: imgLoaded && !busy ? '#185fa5' : '#b9c7d6',
                  color: '#fff',
                  fontSize: 15,
                  cursor: imgLoaded && !busy ? 'pointer' : 'not-allowed',
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
            适用：半透明 logo、边角文字、纯色/简单背景上的水印效果最好；复杂/大面积水印会被平滑填充（略有模糊），请酌情使用。仅用于你<strong>自有或已授权</strong>的内容。
          </p>
        </section>

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
                cursor: 'crosshair',
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
