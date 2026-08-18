import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = {
  title: '学习助手 · AI 生活助手',
  description: '互动学习：苏科版八年级上册物理 / 数学（含可动手实验与期末闯关，无需联网登录）',
};

const subjects = [
  {
    href: '/learn/kb',
    emoji: '📚',
    name: '初二全科知识库',
    desc: '语文 / 数学 / 英语 / 物理 / 生物 / 地理 / 历史 / 道法 / 体育 全科核心知识 + 真题试卷 + 方法工具，自带搜索、错题本与掌握看板。',
    tag: '全科 · 错题本',
  },
  {
    href: '/learn/physics',
    emoji: '📘',
    name: '物理 · 八年级上册',
    desc: '苏科版：声现象 / 物态变化 / 光现象 / 光的折射 / 凸透镜成像 / 物体的运动。13 个可动手实验 + 期末闯关。',
    tag: '6 章 · 13 实验',
  },
  {
    href: '/learn/math',
    emoji: '📗',
    name: '数学 · 八年级上册',
    desc: '苏科版：核心知识点互动讲解、易错点梳理、随堂例题与闯关练习，边做边巩固。',
    tag: '互动练习 · 易错点',
  },
  {
    href: '/learn/mistakes',
    emoji: '🔍',
    name: '错题本分析器',
    desc: '粘贴错题自动归类：科目 × 错因 × 薄弱知识点排名 + 间隔复习计划（第 1/2/4/7/15/30 天），AI 模式可生成变式练习卷，联动知识库复习。',
    tag: '分析 · 复习计划',
  },
  {
    href: '/learn/memorize',
    emoji: '🧠',
    name: '背诵计划助手',
    desc: '粘贴要背的内容 → 按艾宾浩斯记忆曲线自动排期（1/2/4/7/15/30 天复习）→ 打卡日历 + 进度看板，本地保存可导出。',
    tag: '艾宾浩斯 · 打卡',
  },
];

export default function LearnPage(): ReactNode {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 48px' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 4px', color: '#1f2a44' }}>学习助手</h1>
      <p style={{ color: '#6b7280', marginTop: 0, fontSize: 14 }}>
        选自苏科版八年级上册 · 可动手互动学习（无需联网、无需登录）
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 22,
        }}
      >
        {subjects.map((s) => (
          <Link key={s.href} href={s.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 18,
                background: '#fff',
                height: '100%',
                boxShadow: '0 1px 6px rgba(0,0,0,.04)',
              }}
            >
              <div style={{ fontSize: 30 }}>{s.emoji}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a44', marginTop: 8 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 12, color: '#2563eb', margin: '6px 0' }}>{s.tag}</div>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              <div style={{ marginTop: 14, color: '#2563eb', fontWeight: 600, fontSize: 13 }}>
                开始学习 →
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
