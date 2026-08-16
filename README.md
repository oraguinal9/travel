# 旅行规划 Agent（MVP 骨架）

说一句话，AI 帮你排好带地图和预算的旅行行程。可上架 aizaow.com（分类：效率工具）。

技术栈：Next.js 14（App Router）+ LangGraph 单 React Agent + DeepSeek（复用 jarvis 的 Key）
+ Open-Meteo（天气，免 Key）+ 高德（POI/路线/地图）+ 本地预算/打包启发式。

## 目录结构
```
src/
├─ app/
│  ├─ page.tsx                 # 首页/输入
│  ├─ plan/[id]/page.tsx       # 结果页（轮询 + 渲染）
│  └─ api/plan/route.ts        # POST 创建任务（返回 task_id）
│  └─ api/plan/[id]/route.ts   # GET 轮询任务状态
├─ lib/
│  ├─ agent.ts                 # 单 React Agent + DeepSeek + 系统提示
│  ├─ jsonRepair.ts            # 移植 TripStar 的 JSON 容错
│  ├─ taskStore.ts             # 异步任务存储（进程内 Map）
│  ├─ tts.ts                   # 复用 jarvis 的豆包 TTS（占位）
│  └─ tools/                   # 天气/POI/路线/预算/打包 5 个工具
├─ types/itinerary.ts          # TripPlan 数据模型
└─ components/                 # PlanForm / DayCard / BudgetPanel / MapView
```

## 运行
```bash
cp .env.local.example .env.local   # 填入 DEEPSEEK_API_KEY / AMAP_KEY 等
npm install
npm run dev                        # http://localhost:3000
```

## 关键设计
- **异步任务 + 轮询**：POST 立即返回 task_id，前端每 3s 轮询 GET，避免长生成 504。
- **JSON 容错**：LLM 输出一定会脏，jsonRepair.ts 做了去包裹/修逗号/中文引号/算术表达式/截断修复四层兜底。
- **数据模型**：严格遵循 TripStar 的 TripPlan 结构，前端渲染成行程卡 + 高德地图 + 预算面板三件套。

## 待接入
- [ ] 高德 Key（Web 服务 + JS 地图）
- [ ] TTS：把 jarvis 的豆包 TTS 实现搬进 lib/tts.ts，并加 /api/tts 路由
- [ ] 生产级任务存储（Redis/DB，替换进程内 Map）
- [ ] 多城市城际交通真实票价
- [ ] 移动端适配细化
