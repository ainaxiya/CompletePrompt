# 完整提示词版本号 0.2 / CompletePrompt

收集、分享、发现优质 AI 提示词的社区网站。内置 8400+ 条真实创作过程提示词（图片/视频/音频/文本），其中 4650 条含与提示词分段精确对应的实拍效果图与视频截图，全部本地化存储。
PC
[image](https://github.com/ainaxiya/CompletePrompt/blob/214691d3282ec41f3aa231b9f841b8d1050e0445/PC.png)

mobile
[image](https://github.com/ainaxiya/CompletePrompt/blob/214691d3282ec41f3aa231b9f841b8d1050e0445/mobile.png)
## 功能总览

### 前台
- **提示词浏览**：首页精选 / 热门推荐 / 分类浏览 / 全文搜索（Meilisearch）/ 标签筛选
- **详情页**：分段提示词（`[N] 标签｜…｜节点名`）+ 对应图片/视频截图展示、一键复制、自动中英翻译
- **用户系统**：注册登录（JWT）、个人中心（昵称/头像上传/简介）、点赞、收藏、发布提示词
- **评论系统**：嵌套回复（2 级）、点赞、删除自己的评论
- **会员体系**：free / Pro / VIP 分级，可配置权益

### 后台管理（隐蔽入口 `/guanli-7k2m9x`）
- **仪表盘**：内容/用户/流量概览
- **提示词管理**：增删改查、批量操作（加精 / 热门推荐 / 发布 / 下线 / 删除）、发布时间与更新时间分离
- **用户管理**：会员增删改查、状态控制
- **角色权限（RBAC）**：多管理员多角色，19 项细粒度权限按组勾选，角色增删改查
- **操作日志**：所有管理员操作自动落日志，**只增不可改删**，支持按管理员/操作/对象过滤
- **分类管理**：中英双语分类增删改查排序
- **网站设置**：站点名称/介绍/搜索关键字/页脚、LOGO / Favicon / PWA 图标上传

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript |
| 样式 | Tailwind CSS v4（黑曜石 + 靛蓝紫罗兰 + 琥珀金主题） |
| 数据库 | PostgreSQL 16+ / Prisma ORM |
| 搜索 | Meilisearch |
| 认证 | 自建 JWT（jose，HttpOnly Cookie，30 天） |
| 媒体处理 | sharp（图片压缩 webp）+ ffmpeg（视频截帧） |

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── (site)/          # 前台：首页/详情/分类/搜索/登录/注册/会员/个人中心
│   │   ├── (admin)/guanli-7k2m9x/  # 后台（隐蔽路径，见 src/lib/admin-path.ts）
│   │   └── api/             # REST API（前台 + admin + 评论 + 上传）
│   ├── components/          # UI 组件（前台 + admin/）
│   └── lib/                 # auth / rbac / settings / db / i18n
├── prisma/schema.prisma     # 数据模型
├── scripts/                 # 运维与采集脚本（见下）
├── database/prompthub-dump.dump  # 全量数据库备份（pg_restore 可恢复）
├── docker-compose.yml       # 服务器版 PG18 + Meilisearch 编排
├── docs/                    # 部署指南
└── public/uploads/          # 媒体文件（4GB，不入 git，另行传输）
```

## 快速开始（本地开发）

```bash
npm install                 # 安装依赖（自动 prisma generate）
cp .env.example .env        # 复制环境变量并修改
npm run db:up               # 启动内嵌 PostgreSQL（端口 5432）
npm run db:push             # 同步表结构
npm run seed                # 可选：导入示例数据
node scripts/create-admin.mjs admin 用户名 密码   # 创建管理员
npm run dev                 # 启动 http://localhost:3000
```

> 本地搜索：下载 meilisearch.exe 后执行
> `bin\meilisearch.exe --db-path meili_data --http-addr 127.0.0.1:7700 --master-key dev-xxx`

## 服务器部署（宝塔 + Docker）

详细步骤见 [docs/server-部署指南.md](docs/server-部署指南.md)，概要：

```bash
# 1. 启动数据库与搜索（PG 反代端口 35432 / Meili 7700）
docker compose up -d

# 2. 建库并恢复数据
docker exec -it postgresql_18_kpJt psql -U woshizhou -d postgres -c "CREATE DATABASE prompthub;"
# 方式 A：pg_restore（推荐，custom 格式）
pg_restore --host 127.0.0.1 --port 35432 --username woshizhou --dbname prompthub --no-owner --role=woshizhou database/prompthub-dump.dump
# 方式 B：进入容器内恢复
docker exec -i postgresql_18_kpJt pg_restore -U woshizhou -d prompthub --no-owner < database/prompthub-dump.dump

# 3. 配置 .env（数据库/Meili/JWT_SECRET/站点 URL）
# 4. 安装依赖并构建
npm install && npm run build && npm run start   # 或 pm2 托管
# 5. 宝塔 Nginx 反代 3000 端口 + SSL；Meili 反代 meili.域名.com
```

### 媒体文件传输（重要）
`public/uploads/` 约 4GB / 7 万文件，**不在 git 内**。部署时需单独传输到服务器同路径：
- 打包 zip 后通过宝塔文件管理上传解压；或 `scp -r public/uploads root@服务器:/www/wwwroot/CompletePrompt/public/`

## 运维脚本（scripts/）

| 脚本 | 用途 |
|---|---|
| `create-admin.mjs` | 创建管理员账号 |
| `reindex-meili.mjs` | 重建 Meilisearch 搜索索引 |
| `db-manual.mjs` | 启停内嵌 PostgreSQL（本地开发用） |
| `liblib-enumerate-feed.mjs` | 采集：枚举 liblib.tv 全站作品清单 |
| `liblib-fetch-nodes.mjs` | 采集：拉取作品节点快照 |
| `liblib-import-media.mjs` | 采集：下载图片/视频截帧并入库（支持 --dry-run/--limit/--force） |
| `liblib-fix-darkframes.mjs` | 采集：扫描修复过暗视频帧 |
| `liblib-verify-media.mjs` | 采集：校验图片与提示词分段对应关系 |

## 环境变量说明

见 [.env.example](.env.example)。上线前必须更换 `JWT_SECRET` 与 `MEILI_MASTER_KEY`。

## 版权说明

目前正在开发阶段
