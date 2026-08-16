import { NextRequest, NextResponse } from 'next/server';
import { getTask } from '@/lib/taskStore';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const t = getTask(params.id);
  if (!t) return NextResponse.json({ error: 'task not found' }, { status: 404 });
  return NextResponse.json(t);
}
