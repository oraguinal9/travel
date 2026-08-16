import './globals.css';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';

export const metadata = {
  title: '旅行规划 Agent',
  description: '说一句话，AI 帮你排好带地图和预算的旅行行程',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
