import type { ReactNode } from 'react';

export const metadata = {
  title: '学习助手 · AI 生活助手',
  description: '互动学习：苏科版八年级上册物理（含可动手实验与期末闯关）',
};

export default function LearnPage(): ReactNode {
  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <iframe
        src="/learn/physics/index.html"
        title="学习助手"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}
