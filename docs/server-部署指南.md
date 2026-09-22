# 宝塔服务器部署指南 — PostgreSQL + Meilisearch

## 0. 已安装服务（宝塔 Docker 管理）

### PostgreSQL 18
- 宝塔应用名：`postgresql_18_kpJt`
- 反向端口：35432（宿主机）→ 5432（容器内）
- Docker 内部 IP：172.18.0.4:5432
- 用户名：woshizhou
- 密码：dJKHY8aSRMhPhDhD
- 数据库名：需手动创建 `prompthub`

### Meilisearch
- 域名：`https://meili.qiukuzi.com`
- Master Key：见 `.env.meili`

## 1. 创建数据库

```bash
# 通过宝塔终端进入 PG 容器
docker exec -it postgresql_18_kpJt psql -U woshizhou -d postgres
```

```sql
CREATE DATABASE prompthub;
\q
```

## 2. 生成密码和 Key

```bash
# PG 密码
openssl rand -base64 24
# Meilisearch Master Key（如果还没设）
openssl rand -hex 24
```

编辑 `.env.db` 替换 `CHANGE_ME_TO_STRONG_PASSWORD`。
编辑 `.env.meili` 替换 Master Key（如果服务器上已设好可跳过）。

## 3. 启动服务

```bash
cd /www/wwwroot/prompthub
docker compose up -d

# 检查状态
docker compose ps
docker compose logs -f
```

验证：
```bash
curl http://127.0.0.1:5432     # PG 端口在监听
curl http://127.0.0.1:7700/health   # {"status":"available"}
```

## 4. 初始化数据库

```bash
# 创建表结构
docker exec -i prompthub-pg psql -U postgres -d prompthub < schema.sql

# 或者用 Prisma（在本地或服务器上跑）
# DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/prompthub" npx prisma db push
```

## 5. 数据迁移（从本地到服务器）

### 方式 A：pg_dump 导入

```bash
# 本地导出（embedded PG）
pg_dump -h 127.0.0.1 -U postgres prompthub > prompthub-dump.sql

# 上传到服务器后导入
docker exec -i prompthub-pg psql -U postgres -d prompthub < prompthub-dump.sql
```

### 方式 B：只导结构，数据通过 API 重新采集

```bash
# 本地
npx prisma db push --schema=prisma/schema.prisma
# 导出空结构
pg_dump -h 127.0.0.1 -U postgres --schema-only prompthub > schema.sql
# 服务器导入
docker exec -i prompthub-pg psql -U postgres -d prompthub < schema.sql
```

## 6. Meilisearch 索引同步

```bash
# 方式 A：本地 dump → 服务器导入
# 本地导出
curl -X POST http://localhost:7700/dumps
# 等待完成，下载 dump 文件，上传到服务器
# 服务器导入
curl -X POST "https://meili.qiukuzi.com/dumps" -F "file=@dump.sql"

# 方式 B：从 PG 重新同步索引（在服务器跑同步脚本）
```

## 7. 宝塔 Nginx 配置

### Meilisearch 反代
- 域名：`meili.qiukuzi.com`
- 目标 URL：`http://127.0.0.1:7700`
- SSL：Let's Encrypt + 强制 HTTPS

### 前端反代
- 域名：`your-domain.com`
- 目标 URL：`http://127.0.0.1:3000`（Next.js 运行端口）
- SSL：同上

## 8. 项目 .env（服务器版）

```env
DATABASE_URL="postgresql://woshizhou:dJKHY8aSRMhPhDhD@127.0.0.1:35432/prompthub"
JWT_SECRET="生成一个新的随机字符串"
MEILI_HOST="https://meili.qiukuzi.com"
MEILI_MASTER_KEY="4a9f8b2c6d8e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e"
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
```

## 9. 日常维护

```bash
# 备份 PG
docker exec prompthub-pg pg_dump -U postgres prompthub > backup-$(date +%Y%m%d).sql

# 备份 Meilisearch
tar czf meili-backup-$(date +%Y%m%d).tar.gz meili_data/

# 查看日志
docker compose logs --tail 100 postgres
docker compose logs --tail 100 meilisearch

# 重启
docker compose restart

# 升级 PG（改 docker-compose.yml image tag 后）
docker compose pull && docker compose up -d
```
