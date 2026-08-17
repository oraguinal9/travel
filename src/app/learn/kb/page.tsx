import type { ReactNode } from 'react';

export const metadata = { title: '初二全科知识库 · 学习助手' };

export default function KbPage(): ReactNode {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: 46,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 14px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          fontSize: 14,
        }}
      >
        <a href="/learn" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
          ← 学习助手
        </a>
        <span style={{ color: '#9ca3af' }}>/</span>
        <span style={{ fontWeight: 600, color: '#1f2a44' }}>初二全科知识库</span>
        <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: 12 }}>
          含搜索 · 错题本 · 方法工具
        </span>
      </div>
      <iframe
        src="/learn/kb/index.html"
        title="初二全科知识库"
        style={{ flex: 1, width: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}
