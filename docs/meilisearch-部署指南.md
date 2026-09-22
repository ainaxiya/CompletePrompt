# Meilisearch 宝塔部署指南

## 1. 准备文件

将以下文件上传到服务器 `/www/wwwroot/meilisearch/`：
- `docker-compose.yml`
- `.env.meili`

## 2. 生成 Master Key

```bash
openssl rand -hex 24
# 输出类似：a3f8b2c1d4e5... 共 48 位
```

编辑 `.env.meili`，替换 `CHANGE_ME_TO_RANDOM_48_CHARS_HEX`。

## 3. 启动

```bash
cd /www/wwwroot/meilisearch
docker compose up -d
docker compose logs -f   # 看启动日志
curl http://127.0.0.1:7700/health  # 应返回 {"status":"available"}
```

## 4. 宝塔 Nginx 反代

1. 宝塔面板 → 网站 → 添加站点 → 域名（如 search.yourdomain.com）
2. 站点设置 → 反向代理：
   - 目标 URL：`http://127.0.0.1:7700`
   - 发送域名：`$host`
3. 申请 SSL 证书（Let's Encrypt）
4. 开启强制 HTTPS

## 5. 防火墙

```bash
# 宝塔安全 → 放行端口只保留 80/443
# 7700 不放行（Nginx 反代即可，无需直接暴露）
```

## 6. 项目对接

项目 `.env` 修改：
```
MEILI_HOST=https://search.yourdomain.com
MEILI_MASTER_KEY=<你生成的48位hex>
```

同步索引数据到服务器：
```bash
# 本地导出
curl -X POST http://localhost:7700/dumps
# 等待完成，下载 dump 文件

# 上传到服务器后导入
curl -X POST https://search.yourdomain.com/dumps/<dump_uid>/wait-for-completion
```

或直接在服务器重新索引（从 PG 数据库同步）。

## 7. 日常维护

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs --tail 100

# 重启
docker compose restart

# 升级版本（改 docker-compose.yml 中 image tag）
docker compose pull && docker compose up -d

# 备份数据
tar czf meili-backup-$(date +%Y%m%d).tar.gz data/
```
