import { NextResponse } from 'next/server';
import { getTask } from '@/lib/taskStore';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const task = getTask(params.id);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(task);
}
