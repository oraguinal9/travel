# 部署到阿里云（travel.zbjh.top）

本指南把旅行规划智能体部署到你的阿里云服务器（已托管 zbjh.top），并通过子域名
`travel.zbjh.top` 对外提供服务。部署形态：**Docker 容器（Next.js standalone） + 服务器 nginx 反代**。

---

## 一、前置条件（服务器上）
- 一台阿里云 ECS（CentOS 7+/Ubuntu 20.04+ 均可），已解析 `zbjh.top`。
- 已安装 **Docker** 与 **Docker Compose v2**。未安装则执行：
  ```bash
  # CentOS
  sudo yum install -y docker && sudo systemctl enable --now docker
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose

  # Ubuntu
  sudo apt update && sudo apt install -y docker.io && sudo systemctl enable --now docker
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  ```
- 服务器已装 **nginx**（zbjh.top 现就在跑，一般已具备）。

---

## 二、把代码传到服务器
任选一种：

**方式 A：从 Git 拉取（推荐，若已推到 GitHub 新仓）**
```bash
cd /opt && git clone <你的仓库地址> travel-agent && cd travel-agent
```

**方式 B：用 scp 直接传本地构建产物**
本地执行（把本机 build 好的 standalone 传上去，省去服务器再 build）：
```bash
# 本地：打包
cd C:\Users\admin\WorkBuddy\2026-07-30-22-48-46\travel-agent
tar czf travel-agent-standalone.tar.gz .next/standalone .next/static Dockerfile docker-compose.yml deploy .env.production.example
scp travel-agent-standalone.tar.gz root@<服务器IP>:/opt/
# 服务器：
mkdir -p /opt/travel-agent && cd /opt/travel-agent && tar xzf /opt/travel-agent-standalone.tar.gz
```
> 注意：用方式 B 时，因 `NEXT_PUBLIC_AMAP_JS_KEY` 已在本地 build 时内联，**无需再传 `.env` 的 JS Key**，
> 但服务端 `AMAP_KEY` / `DEEPSEEK_API_KEY` 仍需 `.env`（见下一步）。

---

## 三、配置环境变量
```bash
cd /opt/travel-agent
cp .env.production.example .env
vim .env        # 填入真实 Key（值见你本地 travel-agent/.env.local）
```
四个变量含义见 `.env.production.example` 注释。**关键**：`NEXT_PUBLIC_AMAP_JS_KEY` 必须正确，
否则网页地图加载不出（它是构建期内联的）。

---

## 四、启动容器
```bash
cd /opt/travel-agent
docker compose up -d --build     # 首次会构建镜像，约 1~2 分钟
docker compose ps                # 确认状态为 Up
docker compose logs -f           # 看日志；Ctrl+C 退出
```
启动后服务监听在 **本机 127.0.0.1:3000**（不对外网直接暴露，由 nginx 反代）。
本地自测：`curl -I http://127.0.0.1:3000` 应返回 200。

---

## 五、配置 nginx 子域名
```bash
# 复制我们准备的配置
cp /opt/travel-agent/deploy/nginx/travel.zbjh.top.conf /etc/nginx/conf.d/
nginx -t && systemctl reload nginx
```

---

## 六、DNS：给 travel.zbjh.top 加解析
在 **阿里云 DNS 控制台**（域名 zbjh.top）：
- 添加记录：**主机记录** `travel`，**记录类型** `A`，**记录值** = 你的 ECS 公网 IP，`TTL` 默认。
- 等待 1~5 分钟生效，命令行验证：`ping travel.zbjh.top` 应解析到该 IP。

---

## 七、HTTPS（强烈推荐，Let's Encrypt 免费证书）
```bash
# CentOS: yum install -y certbot python3-certbot-nginx
# Ubuntu: apt install -y certbot python3-certbot-nginx
certbot --nginx -d travel.zbjh.top
# 按提示选 “2) Redirect”（自动 80→443 跳转）。证书 90 天，crontab 自动续期。
```

---

## 八、验证
浏览器打开 `https://travel.zbjh.top`：
1. 首页表单填「北京 / 3 天」→ 提交；
2. 进入行程页，应看到真实景点 + 高德地图打点 + 预算面板；
3. 若未配 `DEEPSEEK_API_KEY`，页面顶部会出现黄色「预览模式」提示（用高德真实 POI 拼装，非 AI 规划）；
   配了则自动走真 LLM 规划、无提示条。

---

## 九、日常运维
```bash
docker compose pull && docker compose up -d   # 更新镜像（若用远程镜像）
docker compose restart                        # 重启
docker compose down                           # 停止
docker compose logs -f --tail=100             # 查日志
```
升级代码（Git 方式）：`git pull && docker compose up -d --build`

---

## 排错
- **地图空白**：几乎都是 `NEXT_PUBLIC_AMAP_JS_KEY` 填错 / 构建时未注入。重建镜像并确保 build-arg 生效（`docker compose config` 可见 args）。
- **nginx 502**：容器没起来或端口不对。查 `docker compose ps` 与 `docker compose logs`。
- **DNS 不生效**：确认阿里云解析记录已添加且 ECS 安全组放行 80/443 入站。
- **TTS 在 iframe 不出声**：浏览器语音合成在部分嵌入式环境被抑制，用真实浏览器打开域名即可（localhost/https 正常）。
