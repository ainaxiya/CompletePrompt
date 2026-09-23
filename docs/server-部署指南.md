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

## 10. Nginx alias 直读用户上传媒体（必须配置）

**背景**：Next.js 生产模式只服务 build 时已存在于 `public/` 的文件，运行时由 `/api/upload`、`/api/user/avatar/upload` 写入 `public/uploads/` 的图片/头像/视频，直接访问会 404（dev 模式无此问题）。品牌小图标已用 `/site-assets` 动态路由解决；用户媒体可能是 100MB 视频，不能走 Node 进程，必须由 Nginx 直接读盘。

### 10.1 目录与权限（一次性）

```bash
mkdir -p /www/wwwroot/CompletePrompt/public/uploads
chown -R www:www /www/wwwroot/CompletePrompt/public/uploads
chmod -R 755 /www/wwwroot/CompletePrompt/public/uploads
```

### 10.2 站点配置

宝塔面板 → 网站 → www.wango8.com → 配置文件（等价文件 `/www/server/panel/vhost/nginx/www.wango8.com.conf`），
在 **443 的 server { } 块内、`location / {` 之前**插入：

```nginx
# 上传媒体由 Nginx 直接读盘，绕过 Next.js（运行时写入 public 的文件 Next 不提供服务）
# ^~ 必须保留：优先级高于宝塔自带的静态文件正则 location
location ^~ /uploads/ {
    alias /www/wwwroot/CompletePrompt/public/uploads/;   # location 与 alias 末尾斜杠必须同时有/同时无
    try_files $uri =404;
    access_log off;

    # 与 next.config.ts 中 /uploads/:path* 的安全头保持一致（Nginx 接管后 Next 的头不再生效）
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox" always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

同文件 server 块内（或 http 块）确认放开上传体积，否则视频上传被 413（应用限额是 100MB）：

```nginx
client_max_body_size 100m;
```

注意：
- 不要同时写 `expires 1y;`，否则会与上面的 Cache-Control 重复发两个头。
- `location ^~` 的 `^~` 不能省：宝塔默认配置里有 `\. (png|jpg|mp4...)` 之类正则 location，普通前缀 location 优先级低于它，会被抢走导致 404。
- 80 端口的 server 块只做跳转 HTTPS，无需加。

### 10.3 校验并重载

```bash
nginx -t && nginx -s reload      # 或宝塔：/etc/init.d/nginx reload
```

验证（先在网站上真实上传一张图，拿到形如 /uploads/2026/09/xxxx.png 的地址）：

```bash
curl -I https://www.wango8.com/uploads/2026/09/xxxx.png
# 期望：HTTP/2 200
#   cache-control: public, max-age=31536000, immutable
#   content-security-policy: default-src 'none'; ...
#   x-content-type-options: nosniff
```

覆盖范围：投稿图片/视频 `uploads/YYYY/MM/`、头像 `uploads/avatars/`，全部在 `/uploads/` 前缀内。
排障：403 查目录属主/父目录 x 权限；404 查 alias 末尾斜杠与磁盘真实路径；仍是 Next 响应（响应头含 x-powered-by）说明 location 没命中，检查 `^~` 与插入位置。
