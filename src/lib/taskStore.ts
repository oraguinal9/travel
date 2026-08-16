// 异步任务存储（MVP 用进程内 Map；生产环境换 Redis/DB）

import type { TokenUsage } from '../types/itinerary';

export type TaskStatus = 'processing' | 'completed' | 'failed';

export interface Task {
  id: string;
  status: TaskStatus;
  progress: number;
  stage: string;
  message: string;
  result?: unknown;
  error?: string;
  demo?: boolean; // 预览模式：未接入 DeepSeek，用高德真实 POI 拼行程
  usage?: TokenUsage; // AI 模式下的 token 用量与费用估算
}

// 用 globalThis 持久化，避免 Next dev 每个 route 独立打包导致模块级 Map 不共享（GET 轮询读不到 POST 写入的任务）
const store: Map<string, Task> =
  (globalThis as unknown as { __travelTaskStore?: Map<string, Task> }).__travelTaskStore ||
  ((globalThis as unknown as { __travelTaskStore?: Map<string, Task> }).__travelTaskStore = new Map<string, Task>());

export function createTask(): Task {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const task: Task = { id, status: 'processing', progress: 0, stage: 'submitted', message: '已提交' };
  store.set(id, task);
  return task;
}

export function getTask(id: string): Task | undefined {
  return store.get(id);
}

export function updateTask(id: string, patch: Partial<Task>): void {
  const t = store.get(id);
  if (t) store.set(id, { ...t, ...patch });
}
