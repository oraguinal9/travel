import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 上报后端当前运行模式：是否已配置 DeepSeek（AI 规划）还是预览模式。
 * 仅返回布尔，不暴露任何密钥。
 */
export async function GET() {
  const llmEnabled = !!process.env.DEEPSEEK_API_KEY;
  return NextResponse.json({ llmEnabled });
}
