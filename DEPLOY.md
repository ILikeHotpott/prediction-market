# Web3Gambling 部署指南

## 架构

```
Nginx (:80) → Frontend (:3000) + Backend (:8000)
                                      ↓
                              Redis + Meilisearch + Supabase
```

## 部署步骤

### 1. 配置环境变量

编辑 `backend/.env`，确保包含以下配置：

```bash
# Django
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=monofuture.com,www.monofuture.com

# Database
SUPABASE_DB_URL=postgresql://...

# Redis & Meilisearch
REDIS_URL=redis://redis:6379/0
MEILI_URL=http://meilisearch:7700
MEILI_MASTER_KEY=your-meili-key
```

编辑根目录 `.env`（用于 docker-compose）：

```bash
NEXT_PUBLIC_API_URL=https://monofuture.com/api
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
MEILI_MASTER_KEY=your-meili-key
```

### 2. 启动服务

```bash
docker-compose up -d --build
```

### 3. 查看日志

```bash
docker-compose logs -f
```

## 常用命令

```bash
docker-compose up -d          # 启动
docker-compose down           # 停止
docker-compose ps             # 状态
docker-compose logs -f        # 日志
docker-compose up -d --build backend  # 重建后端
```

## SSL 配置

1. 将证书放入 `nginx/ssl/`
2. 编辑 `nginx/nginx.conf` 取消 SSL 注释
3. 重启 nginx: `docker-compose restart nginx`
