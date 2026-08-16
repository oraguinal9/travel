# syntax=docker/dockerfile:1

# ---------- 依赖（仅用于构建时 tree-shaking，可被缓存） ----------
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# ---------- 构建 ----------
FROM node:18-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* 必须在构建期内联进前端 bundle，用 build-arg 注入
ARG NEXT_PUBLIC_AMAP_JS_KEY
ARG NEXT_PUBLIC_AMAP_JS_SECURITY
ENV NEXT_PUBLIC_AMAP_JS_KEY=$NEXT_PUBLIC_AMAP_JS_KEY
ENV NEXT_PUBLIC_AMAP_JS_SECURITY=$NEXT_PUBLIC_AMAP_JS_SECURITY
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ---------- 运行（standalone 产物，无需 node_modules） ----------
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 复制 standalone 运行时（含精简后的 node_modules）
COPY --from=builder /app/.next/standalone ./
# 复制静态资源到 standalone 根目录下的 .next/static
COPY --from=builder /app/.next/static ./.next/static
# 若日后新增 public 静态资源，取消下行注释
# COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
