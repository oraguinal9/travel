'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: '行程规划' },
  { href: '/cook', label: '家常菜谱' },
  { href: '/learn', label: '学习助手' },
  { href: '/name', label: '起名助手' },
  { href: '/resume', label: '简历优化' },
  { href: '/renovation', label: '装修预算' },
  { href: '/watermark', label: '图片去水印' },
  { href: '/subtitle', label: '视频去字幕' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: '#fff',
        borderBottom: '1px solid #eee',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 1100,
        margin: '0 auto',
        padding: '12px 16px',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 16, color: '#185fa5', marginRight: 12 }}>AI 生活助手</span>
      {tabs.map((t) => {
        const active = path === t.href || (t.href !== '/' && path.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 14,
              textDecoration: 'none',
              background: active ? '#185fa5' : 'transparent',
              color: active ? '#fff' : '#333',
              border: active ? 'none' : '1px solid #ddd',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
