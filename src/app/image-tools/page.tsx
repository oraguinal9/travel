'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// —— 图片工具箱：证件照 / 压缩 / 九宫格 / 格式转换（纯前端，零上传零费用）——

type TabKey = 'idphoto' | 'compress' | 'grid' | 'convert';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'idphoto', label: '证件照' },
  { key: 'compress', label: '图片压缩' },
  { key: 'grid', label: '九宫格切图' },
  { key: 'convert', label: '格式转换' },
];

// 证件照标准尺寸（px @300dpi）
const PHOTO_SIZES: Record<string, { w: number; h: number; label: string }> = {
  '1cun': { w: 295, h: 413, label: '一寸 295×413' },
  '2cun': { w: 413, h: 579, label: '二寸 413×579' },
  '3cun': { w: 649, h: 898, label: '小二寸 649×898' },
};

const BG_COLORS: Record<string, { r: number; g: number; b: number; label: string }> = {
  white: { r: 255, g: 255, b: 255, label: '白底' },
  blue: { r: 68, g: 142, b: 228, label: '蓝底' },
  red: { r: 220, g: 40, b: 48, label: '红底' },
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

function drawToCanvas(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function downloadCanvas(c: HTMLCanvasElement, filename: string, type = 'image/png') {
  const a = document.createElement('a');
  a.href = c.toDataURL(type);
  a.download = filename;
  a.click();
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export default function ImageToolsPage(): ReactNode {
  const [tab, setTab] = useState<TabKey>('idphoto');
  const [err, setErr] = useState('');

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 20px 56px' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 6px', color: '#1f2a44' }}>图片工具箱 🖼</h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, marginTop: 0, lineHeight: 1.7 }}>
        证件照换底 / 裁剪排版、图片压缩、九宫格切图、格式转换——全部在浏览器本地处理，图片不上传、零费用。
      </p>

      {/* Tab */}
      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setErr('');
            }}
            style={{
              padding: '7px 16px',
              fontSize: 13.5,
              fontWeight: 600,
              border: '1px solid #e2e8f0',
              borderRadius: 999,
              cursor: 'pointer',
              color: tab === t.key ? '#fff' : '#64748b',
              background: tab === t.key ? '#2563eb' : '#fff',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>⚠ {err}</div>
      )}

      {tab === 'idphoto' && <IdPhoto onErr={setErr} />}
      {tab === 'compress' && <Compress onErr={setErr} />}
      {tab === 'grid' && <GridCut onErr={setErr} />}
      {tab === 'convert' && <Convert onErr={setErr} />}
    </div>
  );
}

// ============ 证件照 ============
function IdPhoto({ onErr }: { onErr: (s: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sizeKey, setSizeKey] = useState('1cun');
  const [bgKey, setBgKey] = useState('blue');
  const [threshold, setThreshold] = useState(70);
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      try {
        const im = await loadImage(f);
        setImg(im);
        setPreview(null);
        setDone(null);
      } catch (e) {
        onErr(e instanceof Error ? e.message : '读取图片失败');
      }
    },
    [onErr],
  );

  // 换底色：基于与背景参考色（四角平均）的色彩距离 + 羽化
  const process = useCallback(() => {
    if (!img) return;
    const size = PHOTO_SIZES[sizeKey];
    const bg = BG_COLORS[bgKey];
    const src = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    const sctx = src.getContext('2d');
    if (!sctx) return;
    const { width: sw, height: sh } = src;
    const sdata = sctx.getImageData(0, 0, sw, sh).data;

    // 四角平均作为背景参考色
    const corners = [0, sw - 1, (sh - 1) * sw, (sh - 1) * sw + sw - 1];
    let br = 0, bg2 = 0, bb = 0;
    for (const c of corners) {
      br += sdata[c * 4];
      bg2 += sdata[c * 4 + 1];
      bb += sdata[c * 4 + 2];
    }
    br /= 4; bg2 /= 4; bb /= 4;

    const out = drawToCanvas(img, size.w, size.h);
    const octx = out.getContext('2d');
    if (!octx) return;
    // 先画缩放到目标尺寸
    octx.drawImage(img, 0, 0, size.w, size.h);
    const odata = octx.getImageData(0, 0, size.w, size.h);
    const d = odata.data;
    const t1 = threshold;
    const t2 = threshold * 1.8;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i], dg = d[i + 1], db = d[i + 2];
      const dist = Math.sqrt((dr - br) ** 2 + (dg - bg2) ** 2 + (db - bb) ** 2);
      if (dist < t1) {
        // 完全替换（保留原 alpha）
        d[i] = bg.r; d[i + 1] = bg.g; d[i + 2] = bg.b;
      } else if (dist < t2) {
        // 羽化过渡
        const a = (dist - t1) / (t2 - t1);
        d[i] = Math.round(bg.r * (1 - a) + dr * a);
        d[i + 1] = Math.round(bg.g * (1 - a) + dg * a);
        d[i + 2] = Math.round(bg.b * (1 - a) + db * a);
      }
    }
    octx.putImageData(odata, 0, 0);
    setDone(out);
    setPreview(out.toDataURL('image/png'));
  }, [img, sizeKey, bgKey, threshold]);

  // 6 寸照片纸排版（3×2）
  const layout = useCallback(() => {
    if (!done) return;
    const PW = 1795, PH = 1205; // 6 寸 @300dpi
    const pad = 30;
    const cellW = (PW - pad * 4) / 3;
    const cellH = (PH - pad * 3) / 2;
    const scale = Math.min(cellW / done.width, cellH / done.height) * 0.92;
    const dw = done.width * scale;
    const dh = done.height * scale;
    const paper = document.createElement('canvas');
    paper.width = PW;
    paper.height = PH;
    const ctx = paper.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PW, PH);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = pad + c * (cellW + pad) + (cellW - dw) / 2;
        const y = pad + r * (cellH + pad) + (cellH - dh) / 2;
        ctx.drawImage(done, x, y, dw, dh);
      }
    }
    downloadCanvas(paper, '证件照_6寸排版.jpg', 'image/jpeg');
  }, [done]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ padding: '8px 18px', fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer' }}
        >
          上传照片
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <select
          value={sizeKey}
          onChange={(e) => setSizeKey(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#1f2a44', background: '#fafbfc' }}
        >
          {Object.entries(PHOTO_SIZES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={bgKey}
          onChange={(e) => setBgKey(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#1f2a44', background: '#fafbfc' }}
        >
          {Object.entries(BG_COLORS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          换底强度
          <input
            type="range"
            min={30}
            max={140}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: 100 }}
          />
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{threshold}</span>
        </label>
        <button
          onClick={process}
          disabled={!img}
          style={{ marginLeft: 'auto', padding: '8px 18px', fontSize: 13.5, fontWeight: 700, color: '#fff', background: img ? '#059669' : '#cbd5e1', border: 'none', borderRadius: 10, cursor: img ? 'pointer' : 'not-allowed' }}
        >
          换底 + 裁剪
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 12px' }}>
        建议上传<b>纯色背景</b>（白/蓝）正面照；换底强度按背景与头发的接近程度调节，过大可能误伤头发边缘。
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {img && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 6 }}>原图（{img.naturalWidth}×{img.naturalHeight}）</div>
            <img src={img.src} alt="原图" style={{ maxWidth: '100%', maxHeight: 300, border: '1px solid #e2e8f0', borderRadius: 10 }} />
          </div>
        )}
        {preview && done && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: '#059669', marginBottom: 6 }}>
              处理后（{done.width}×{done.height}，{BG_COLORS[bgKey].label}）
            </div>
            <img src={preview} alt="处理后" style={{ maxWidth: '100%', maxHeight: 300, border: '1px solid #a7f3d0', borderRadius: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => downloadCanvas(done, '证件照.png', 'image/png')} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>
                下载单张
              </button>
              <button onClick={layout} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>
                6寸纸排版（3×2）
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ 图片压缩 ============
function Compress({ onErr }: { onErr: (s: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [quality, setQuality] = useState(70);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [outSize, setOutSize] = useState(0);
  const [origSize, setOrigSize] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('image');

  // 压缩：图片或质量变化时自动重算（避免闭包旧值问题）
  useEffect(() => {
    if (!img) return;
    const maxW = 2000;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        setOutSize(blob.size);
        setOutUrl(URL.createObjectURL(blob));
      },
      'image/jpeg',
      quality / 100,
    );
  }, [img, quality]);

  const onFile = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      try {
        const im = await loadImage(f);
        setImg(im);
        setOrigSize(f.size);
        setName(f.name.replace(/\.[^.]+$/, ''));
      } catch (e) {
        onErr(e instanceof Error ? e.message : '读取图片失败');
      }
    },
    [onErr],
  );

  const download = useCallback(() => {
    if (outUrl) {
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = `${name}_压缩.jpg`;
      a.click();
    }
  }, [outUrl, name]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 18px', fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          上传图片
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
        <label style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          压缩质量
          <input type="range" min={10} max={95} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ width: 140 }} />
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{quality}%</span>
        </label>
      </div>
      {img && (
        <div>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
            原图 {fmtSize(origSize)}
            {outSize > 0 && (
              <span style={{ color: '#059669', fontWeight: 700 }}>
                {' '}→ 压缩后 {fmtSize(outSize)}（省 {Math.max(0, Math.round((1 - outSize / Math.max(1, origSize)) * 100))}%）
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <img src={img.src} alt="原图" style={{ maxWidth: '45%', maxHeight: 260, border: '1px solid #e2e8f0', borderRadius: 10 }} />
            {outUrl && (
              <img src={outUrl} alt="压缩后" style={{ maxWidth: '45%', maxHeight: 260, border: '1px solid #a7f3d0', borderRadius: 10 }} />
            )}
          </div>
          {outUrl && (
            <button onClick={download} style={{ marginTop: 12, padding: '7px 16px', fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>
              下载压缩图
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============ 九宫格切图 ============
function GridCut({ onErr }: { onErr: (s: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [pieces, setPieces] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('image');

  const onFile = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      try {
        const im = await loadImage(f);
        setImg(im);
        setName(f.name.replace(/\.[^.]+$/, ''));
        // 居中正方形裁剪后切 3×3
        const side = Math.min(im.naturalWidth, im.naturalHeight);
        const srcC = document.createElement('canvas');
        srcC.width = side;
        srcC.height = side;
        const ctx = srcC.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, 0, 0, side, side);
        const urls: string[] = [];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const pc = document.createElement('canvas');
            pc.width = Math.round(side / 3);
            pc.height = Math.round(side / 3);
            const pctx = pc.getContext('2d');
            if (!pctx) continue;
            pctx.drawImage(srcC, (c * side) / 3, (r * side) / 3, side / 3, side / 3, 0, 0, pc.width, pc.height);
            urls.push(pc.toDataURL('image/png'));
          }
        }
        setPieces(urls);
      } catch (e) {
        onErr(e instanceof Error ? e.message : '读取图片失败');
      }
    },
    [onErr],
  );

  const downloadAll = useCallback(() => {
    pieces.forEach((url, i) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_九宫格_${i + 1}.png`;
      // 逐个触发，浏览器会依次弹出下载
      setTimeout(() => a.click(), i * 150);
    });
  }, [pieces, name]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 18px', fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          上传图片
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
        <span style={{ fontSize: 12.5, color: '#9ca3af' }}>自动居中裁剪为正方形后切成 3×3，共 9 张（发朋友圈九宫格）</span>
      </div>
      {pieces.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 420, marginBottom: 12 }}>
            {pieces.map((u, i) => (
              <img key={i} src={u} alt={`切图${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', border: '1px solid #e2e8f0', borderRadius: 6 }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={downloadAll} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer' }}>
              下载全部 9 张
            </button>
            <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>浏览器可能询问是否允许批量下载</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 格式转换 ============
function Convert({ onErr }: { onErr: (s: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fmt, setFmt] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/webp');
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('image');
  const [ext, setExt] = useState('webp');

  const onFile = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      try {
        const im = await loadImage(f);
        setImg(im);
        setName(f.name.replace(/\.[^.]+$/, ''));
      } catch (e) {
        onErr(e instanceof Error ? e.message : '读取图片失败');
      }
    },
    [onErr],
  );

  const download = useCallback(() => {
    if (!img) return;
    const c = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    const type = fmt;
    const e = ext;
    const a = document.createElement('a');
    a.href = c.toDataURL(type);
    a.download = `${name}_转换.${e}`;
    a.click();
  }, [img, fmt, ext, name]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 18px', fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          上传图片
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
        <select
          value={fmt}
          onChange={(e) => {
            setFmt(e.target.value as 'image/png' | 'image/jpeg' | 'image/webp');
            setExt(e.target.value === 'image/png' ? 'png' : e.target.value === 'image/jpeg' ? 'jpg' : 'webp');
          }}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#1f2a44', background: '#fafbfc' }}
        >
          <option value="image/webp">WebP（体积小）</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG（无损）</option>
        </select>
        <button
          onClick={download}
          disabled={!img}
          style={{ padding: '8px 18px', fontSize: 13.5, fontWeight: 700, color: '#fff', background: img ? '#059669' : '#cbd5e1', border: 'none', borderRadius: 10, cursor: img ? 'pointer' : 'not-allowed' }}
        >
          转换并下载
        </button>
      </div>
      {img && (
        <img src={img.src} alt="原图" style={{ maxWidth: '100%', maxHeight: 280, border: '1px solid #e2e8f0', borderRadius: 10 }} />
      )}
    </div>
  );
}
