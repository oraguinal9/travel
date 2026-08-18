'use client';

import { useRef, useState } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

type Pos = 'bottom' | 'top' | 'both';
type Res = 'orig' | '720' | '480';

export default function SubtitlePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ w: number; h: number; dur: number } | null>(null);
  const [pos, setPos] = useState<Pos>('bottom');
  const [bandPct, setBandPct] = useState(12);
  const [res, setRes] = useState<Res>('720');
  const [fps, setFps] = useState(30);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  const stopRef = useRef(false);

  // 浏览器能力检测（WebCodecs + mp4-muxer 仅做打包，能力看 WebCodecs）
  const checkSupport = () => {
    const w = window as any;
    const ok = typeof w.VideoEncoder !== 'undefined' && typeof w.VideoFrame !== 'undefined';
    setSupported(ok);
    return ok;
  };

  const onFile = (f?: File | null) => {
    if (!f || !f.type.startsWith('video/')) {
      setMsg('请选择视频文件（mp4 / webm / mov 等浏览器可播放格式）');
      return;
    }
    if (!checkSupport()) return;
    stopRef.current = false;
    setResultUrl(null);
    setProgress(0);
    const url = URL.createObjectURL(f);
    setFile(f);
    setVideoUrl(url);
    setMsg('');
    const v = videoRef.current;
    if (!v) return;
    v.src = url;
    v.onloadedmetadata = () => {
      setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
    };
  };

  // 纯 JS 调和插值修复（Laplace 松弛 / Gauss-Seidel 迭代），对字幕带区域填充
  const inpaintBand = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pct: number,
    position: Pos,
    iters: number,
  ) => {
    const bandH = Math.max(2, Math.round(h * pct / 100));
    const regions: Array<[number, number]> = []; // [y0, height]
    if (position === 'bottom' || position === 'both') regions.push([h - bandH, bandH]);
    if (position === 'top' || position === 'both') regions.push([0, bandH]);
    for (const [y0, bh] of regions) {
      if (bh <= 0) continue;
      const img = ctx.getImageData(0, y0, w, bh);
      const d = img.data;
      const N = w * bh;
      const r = new Float32Array(N), g = new Float32Array(N), b = new Float32Array(N);
      for (let i = 0; i < N; i++) { r[i] = d[i * 4]; g[i] = d[i * 4 + 1]; b[i] = d[i * 4 + 2]; }
      for (let s = 0; s < iters; s++) {
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            let sr = 0, sg = 0, sb = 0, n = 0;
            if (y > 0) { const j = idx - w; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (y < bh - 1) { const j = idx + w; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (x > 0) { const j = idx - 1; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (x < w - 1) { const j = idx + 1; sr += r[j]; sg += g[j]; sb += b[j]; n++; }
            if (n) { r[idx] = sr / n; g[idx] = sg / n; b[idx] = sb / n; }
          }
        }
      }
      for (let i = 0; i < N; i++) { d[i * 4] = r[i]; d[i * 4 + 1] = g[i]; d[i * 4 + 2] = b[i]; d[i * 4 + 3] = 255; }
      ctx.putImageData(img, 0, y0);
    }
  };

  const pickCodec = async (w: number, h: number, fr: number): Promise<string | null> => {
    const cands = ['avc1.640028', 'avc1.4d0028', 'avc1.42E028', 'avc1.42001f', 'avc1.42001e'];
    const VE = (window as any).VideoEncoder;
    for (const c of cands) {
      try {
        const s = await VE.isConfigSupported({ codec: c, width: w, height: h, bitrate: 4_000_000, framerate: fr });
        if (s && s.supported) return c;
      } catch (e) { /* ignore */ }
    }
    return null;
  };

  const seekTo = (v: HTMLVideoElement, t: number) =>
    new Promise<void>((resolve) => {
      const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
      v.addEventListener('seeked', onSeeked);
      v.currentTime = t;
    });

  const start = async () => {
    if (!meta || !videoRef.current || !canvasRef.current) {
      setMsg('请先上传视频');
      return;
    }
    const v = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { setMsg('无法获取画布上下文'); return; }

    const scale = res === 'orig' ? 1 : Math.min(1, (res === '720' ? 720 : 480) / meta.w);
    const cw = Math.max(2, Math.round(meta.w * scale));
    const ch = Math.max(2, Math.round(meta.h * scale));
    canvas.width = cw;
    canvas.height = ch;

    const codec = await pickCodec(cw, ch, fps);
    if (!codec) { setMsg('当前浏览器不支持该分辨率视频编码，请尝试更低的处理分辨率或更换 Chrome/Edge'); return; }

    const VE = (window as any).VideoEncoder;
    const VF = (window as any).VideoFrame;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: cw, height: ch },
      fastStart: 'in-memory',
    });
    const encoder = new VE({
      output: (chunk: any, metaData: any) => muxer.addVideoChunk(chunk, metaData),
      error: (e: any) => { console.error(e); setMsg('编码出错：' + (e?.message || e)); },
    });
    encoder.configure({ codec, width: cw, height: ch, bitrate: 4_000_000, framerate: fps });

    setBusy(true);
    setMsg('正在逐帧处理，请稍候（时长越长越慢，建议在本地运行）…');
    stopRef.current = false;
    setProgress(0);

    const total = Math.max(1, Math.round(meta.dur * fps));
    const iters = 35;
    const durUs = Math.round(1_000_000 / fps);

    try {
      for (let i = 0; i < total; i++) {
        if (stopRef.current) { setMsg('已取消'); break; }
        const t = (i / total) * meta.dur;
        await seekTo(v, t);
        ctx.drawImage(v, 0, 0, cw, ch);
        inpaintBand(ctx, cw, ch, bandPct, pos, iters);
        const frame = new VF(canvas, { timestamp: i * durUs, duration: durUs });
        encoder.encode(frame, { keyFrame: i % Math.max(1, Math.round(fps)) === 0 });
        frame.close();
        setProgress(Math.round(((i + 1) / total) * 100));
        if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0)); // 让出主线程更新进度
      }
      await encoder.flush();
      muxer.finalize();
      const { buffer } = (muxer.target as any);
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setMsg(stopRef.current ? '已取消，已生成已处理部分的视频' : '处理完成，可下载');
    } catch (err: any) {
      setMsg('处理失败：' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const stop = () => { stopRef.current = true; };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16, color: '#222' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>视频去字幕</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 16 }}>
        上传视频 → 自动识别<strong>底部/顶部字幕带</strong> → 逐帧纯 JS 调和插值修复 → 浏览器内重新合成 MP4 下载。
        全程在本地浏览器处理，<strong>不上传服务器、零服务器资源、零费用</strong>，打开即用。
      </p>

      {supported === false && (
        <div style={{ background: '#fff4e5', border: '1px solid #ffd8a8', color: '#9a5b00', padding: 12, borderRadius: 8, fontSize: 14, marginBottom: 16 }}>
          当前浏览器不支持视频编码（需要 WebCodecs）。请使用 <strong>Chrome / Edge（桌面版）</strong> 打开本页。手机浏览器与 Safari/Firefox 多数不支持。
        </div>
      )}

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
            点击选择视频，或拖拽到此处
            <input
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>字幕位置</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([['bottom', '底部'], ['top', '顶部'], ['both', '顶部+底部']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setPos(v)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: '1px solid #ccc', background: pos === v ? '#185fa5' : '#fff', color: pos === v ? '#fff' : '#333',
                    }}
                  >{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>字幕带高度：{bandPct}%</div>
              <input type="range" min={4} max={25} value={bandPct} onChange={(e) => setBandPct(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>处理分辨率（越小越快）</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([['orig', '原始'], ['720', '720p'], ['480', '480p']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setRes(v)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: '1px solid #ccc', background: res === v ? '#185fa5' : '#fff', color: res === v ? '#fff' : '#333',
                    }}
                  >{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>帧率（fps）：{fps}</div>
              <input type="range" min={15} max={60} value={fps} onChange={(e) => setFps(Number(e.target.value))} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={start}
                disabled={!meta || busy}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
                  background: meta && !busy ? '#185fa5' : '#b9c7d6', color: '#fff', fontSize: 15,
                  cursor: meta && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? `处理中 ${progress}%` : '开始去字幕'}
              </button>
              {busy && (
                <button onClick={stop} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#333', fontSize: 15, cursor: 'pointer' }}>
                  取消
                </button>
              )}
            </div>

            {busy && (
              <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#185fa5', transition: 'width .2s' }} />
              </div>
            )}

            {meta && (
              <div style={{ fontSize: 12, color: '#999' }}>
                视频信息：{meta.w}×{meta.h} · {meta.dur.toFixed(1)}s
              </div>
            )}
            {msg && <div style={{ fontSize: 13, color: '#185fa5' }}>{msg}</div>}
          </div>

          <p style={{ fontSize: 12, color: '#999', marginTop: 12, lineHeight: 1.6 }}>
            原理：字幕多位于画面固定区域，对字幕带做调和插值（用周围像素平滑填充文字）。适合字幕下方背景较干净的场景；如背景复杂，修复处会略有模糊。仅用于你<strong>自有或已授权</strong>的内容。处理完全在本地，视频不会上传任何服务器。
          </p>
        </section>

        <section style={{ flex: '2 1 460px', minWidth: 320 }}>
          <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', background: '#fafafa' }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
            {!videoUrl && <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontSize: 14 }}>视频预览区</div>}
            {videoUrl && <video src={videoUrl} controls style={{ width: '100%', display: 'block' }} />}
          </div>
          {resultUrl && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>处理结果（已去字幕）</div>
              <video src={resultUrl} controls style={{ width: '100%', borderRadius: 10, border: '1px solid #eee', background: '#000' }} />
              <a href={resultUrl} download="subtitle_removed.mp4" style={{ display: 'inline-block', marginTop: 10, padding: '10px 16px', borderRadius: 8, background: '#1e8e3e', color: '#fff', textDecoration: 'none', fontSize: 15 }}>下载去字幕视频</a>
            </div>
          )}
          <video ref={videoRef} style={{ display: 'none' }} muted playsInline crossOrigin="" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </section>
      </div>
    </main>
  );
}
