# AGENTS.md — CompletePrompt（完整提示词）AI 项目记忆索引

> 本文件是给 AI 编程助手看的项目地图，所有内容均依据仓库真实代码整理，无臆测。
> 改代码前先读这里；新增模块/路由后请回填本文件对应章节，保持「文档=代码事实」。
> 最后核对日期：2026-09-23。

---

## 0. 给 AI 的硬性工作规则（最重要）

1. **用中文与用户交流**，答复简洁直接；用户喜欢现代科技感深色 UI。
2. **最小差异编辑**，优先 Edit 现有文件，不要整文件重写，防止代码漂移。
3. **任何写操作 API 必须保证所有分支都返回 JSON**（含 catch 兜底）——历史上因空响应体导致前端 `Unexpected end of JSON input`。
4. **上传类接口必须做 magic-byte 文件头校验**，不信任浏览器 Content-Type；写文件用随机文件名 + `public/uploads/年/月/`。
5. **富文本入库前必须经 `sanitizeRich()` 清洗**；iframe 仅限 YouTube/Bilibili 白名单。
6. **后台路径是随机隐蔽路径** `/guanli-7k2m9x`（常量 `ADMIN_BASE`，见 `src/lib/admin-path.ts`），禁止在前台页面出现链接、禁止改成明显的 `/admin`。
7. Tailwind class 颜色是**重映射**的（见第 11 节），写 `emerald-*` 实际渲染靛蓝色，不要被类名迷惑。
8. **不要把生产密钥/密码写进本文件或代码**；凭据只存在于服务器 `.env`（gitignore）。
9. 本地开发数据库用 embedded-postgres（`npm run db:up`）；服务器用 Docker PG，两套连接串见 `.env.example`。
10. 采集导入的数据必须保证 `status="published"` 且 `publishedAt` 有值（回填 `createdAt`），否则前台/排序不显示。
11. **开发任何功能前，必须先读第二部分（第 18–21 节）与 `docs/ai/` 专题手册**：01 通用流程、02 API 契约、03 前端契约、04 功能原型矩阵、05 陷阱清单。涉及 schema 变更严格按第 19 节操作，禁止用 migrate、禁止生产盲目 --accept-data-loss。

---

## 1. 项目概述

- **名称**：完整提示词 / CompletePrompt —— AI 提示词社区站（收集、分享、发现优质 prompt）
- **内容类型**：text / image / video / audio 四类提示词，支持多语言（中/英为主）、标签、分类、封面、媒体画廊、点赞、收藏、评论、自动翻译。
- **线上**：https://www.wango8.com （Nginx 反代 127.0.0.1:3000，强制 HTTPS，PM2 应用名 `CompletePrompt`，服务器项目目录 `/www/wwwroot/CompletePrompt`）
- **搜索**：独立 Meilisearch 实例，线上 `https://meili.qiukuzi.com`，索引名 `prompts`。
- **数据规模**（2026-09）：约 1 万+ 条提示词，主要来自 liblib 采集。

## 2. 技术栈

| 层 | 技术 | 备注 |
|---|---|---|
| 框架 | Next.js **15.5** App Router + React **19.1** | Server Components 为主，交互部分 Client Component |
| 语言 | TypeScript 5.7 | 严格模式，路径别名 `@/*` → `src/*` |
| 样式 | Tailwind CSS **v4**（`@theme` 令牌，见 globals.css）+ PostCSS | 无 UI 组件库，全部手写组件 |
| 数据库 | PostgreSQL，Prisma **6.16** | 本地 embedded-postgres 18.4；服务器 Docker PG |
| 搜索 | Meilisearch（`meilisearch` SDK 0.50） | 索引与 DB 双写同步 |
| 认证 | jose（JWT HS256，cookie `token`，30 天）+ bcryptjs | 无 NextAuth |
| 校验 | zod 3.25 | API 入参 |
| 上传 | react-dropzone 14（MIT） | 拖拽/多选/批量，通用组件 UniversalUploader |
| 安全 | sanitize-html | 富文本白名单清洗 |
| 进程 | PM2（fork 单实例，`max_memory_restart: 1G`） | 配置 `ecosystem.config.cjs` |
| 无 | 没有 middleware.ts、没有状态管理库、没有测试框架 | 鉴权在每个路由内调用 |

## 3. 目录结构地图

```
CompletePrompt/
├── prisma/schema.prisma        # 唯一数据模型真相（10 个模型）
├── scripts/                    # 运维/采集脚本（见第 13 节）
├── docs/                       # server-部署指南.md、meilisearch-部署指南.md
├── public/
│   ├── uploads/YYYY/MM/        # 用户上传媒体（CSP sandbox，禁脚本执行）
│   ├── logo/icon.png           # 品牌灯泡图标（页眉/页脚/后台默认 LOGO）
│   ├── favicon.ico / favicon-32.png / apple-touch-icon.png
│   ├── icon-192.png / icon-512.png / app-icon.png / og-image.png
├── src/
│   ├── app/
│   │   ├── layout.tsx          # 根 layout：generateMetadata 动态读 getPublicSite()
│   │   ├── globals.css         # 设计令牌（颜色重映射）
│   │   ├── robots.ts / sitemap.ts
│   │   ├── (site)/             # 前台路由组（见第 5 节）
│   │   ├── (admin)/guanli-7k2m9x/  # 后台路由组（见第 6 节）
│   │   └── api/                # 全部 API 路由（见第 7 节）
│   ├── components/             # 前台 + admin/ 子目录（见第 8 节）
│   └── lib/                    # 业务基础库（见第 9 节）
├── next.config.ts              # 安全响应头 + serverActions 4mb
├── ecosystem.config.cjs        # PM2
└── docker-compose.yml          # 服务器 PG
```

## 4. 数据模型（prisma/schema.prisma）

| 模型 | 作用 | 关键字段/注意 |
|---|---|---|
| **AdminAccount** | **独立管理员体系（2026-06 九大改造第 1 期）** | username 唯一（与 User 表双表查重）、passwordHash、status active/disabled、isSuper、adminRoleId；createdIp/lastLoginAt/lastLoginIp；迁移自旧 User(role=admin)，旧行 role 改 `admin_legacy` |
| User | 前台会员 | `role`: user/importer/admin_legacy（**不再做后台鉴权**）；新增 phone 唯一、allowPublish、registerIp、lastLoginAt/lastLoginIp；`membershipLevel` 列保留但界面已全删；`adminRoleId` 历史遗留不用于鉴权；封禁 status=banned |
| Category | 分类 | name 唯一、`slug` 唯一、sort；注意 Prompt.category 存的是**分类名字符串**不是外键 |
| Prompt | 提示词（核心） | 见下；新增 `adminAuthorId`（后台管理员发布的真实作者），此时 `userId` 挂系统账号 `system`(role=importer)，见 lib/system-user.ts |
| Like / Favorite | 点赞/收藏 | 复合主键 `(userId, promptId)`，切换式（再点取消） |
| Comment | 评论 | 自关联 `parentId` 支持回复；status: published/hidden/deleted |
| SiteSetting | 站点配置 | **键值表**，key 为 `site`/`basic`/`publish`/`membership`/`register`，value 是 JSON 字符串；site.meiliSyncSeconds（0=关自动同步）、register.fields.{email,nickname,phone}=off/optional/required |
| TranslationCache | 翻译缓存 | 主键 `(hash, sourceLang, targetLang)` |
| AdminRole | 后台角色 | permissions 字符串数组，`["*"]` = 全部；默认 4 个角色见 rbac.ts；同时关联 users（历史）与 admins |
| AdminLog | 管理员日志 | 只增不删；action: create/update/delete/batch_update/login/logout；**新日志挂 adminId**（userId 仅历史数据），查询按 AdminAccount.username 模糊 |

**Prompt 模型重点**：
- `type`: text/image/video/audio（默认 text）；`status`: draft/pending/published/rejected（默认 published）
- `content` Text：**两种形态并存**——历史纯文本（含 `[1] [2]` 分段标记，走旧分段渲染）与新富文本 HTML（`isHtmlContent()` 判断，走 sanitize 渲染）
- `media` Json（默认 `[]`）：MediaItem 数组（见 lib/media.ts），项含 type(image/video/embed)、url、poster、role(cover/node)、section、nodeNo、sourceUrl
- `tags` 原生 `String[]`；`sourceSite/sourceAuthor/sourceUrl` 为采集溯源字段
- 冗余计数：likeCount/favoriteCount/viewCount/commentCount
- 时间：`createdAt`、`updatedAt`、`publishedAt`（首次上线时间，**与 updatedAt 独立**，列表/Meili 排序用）
- 索引：status+createdAt、type、category、language、featured、hot、sourceUrl

## 5. 前台页面（src/app/(site)/）

| 路由 | 文件 | 说明 |
|---|---|---|
| `/` | page.tsx | 首页（精选/最新，select 含 description 供文字封面） |
| `/hot` | hot/page.tsx | 热门榜 |
| `/categories` | categories/page.tsx | 分类总览 |
| `/category/[slug]` | category/[slug]/page.tsx | 分类详情（slug 来自 Category 表，30s 内存缓存） |
| `/p/[id]` | p/[id]/page.tsx | 提示词详情（含相关推荐；浏览量在此累加） |
| `/search` | search/page.tsx | 搜索（走 **Meilisearch**，非 DB；hits 为 any[] 手动映射） |
| `/publish` | publish/page.tsx | 投稿/发布（RichEditor + CoverUploader + MediaUploader） |
| `/login` `/register` | login/register page.tsx | AuthForm 组件 |
| `/member` | member/page.tsx | 个人中心（收藏/点赞/我的发布） |
| `/user/profile` | user/profile/ | ProfileForm 改资料/头像 |

`(site)/layout.tsx`：SiteHeader + 页脚（站点名/LOGO/版权/Telegram 链接/统计脚本均来自动态配置）。

## 6. 后台页面（src/app/(admin)/guanli-7k2m9x/）

隐蔽路径常量在 `src/lib/admin-path.ts`，页面自身不做重定向保护，**真正的鉴权在 API 层**（requireAdmin + requirePerm）。

| 路径（去掉 ADMIN_BASE 前缀） | 功能 | 主要客户端组件 |
|---|---|---|
| `/` | 仪表盘 | page.tsx |
| `/prompts` | 提示词列表/批量操作 | PromptManager.tsx |
| `/prompts/new`、`/prompts/[id]/edit` | 新建/编辑 | PromptForm.tsx |
| `/categories` | 分类管理 | CategoryManager.tsx |
| `/users` | 用户管理（仅 role=user；搜索/新建/详情/重置密码/封禁/发布权限/删除） | UserManager.tsx |
| `/admins` | **管理员设置（仅 isSuper 可见）**：管理员 CRUD/禁启用/重置密码 | AdminManager.tsx |
| `/roles` | 角色权限 | RoleManager.tsx |
| `/logs` | 操作日志（按管理员**账号名**模糊查询，彩色查询按钮） | page.tsx |
| `/settings/site` | **网站设置**（标题/关键字/描述/favicon/LOGO/appIcon + **Meili 同步间隔秒数**） | SiteSettingsForm.tsx |
| `/settings/publish` | 发布策略（auto/review、上传开关与限额） | SettingsForms.tsx |
| `/settings/membership` | **注册设置**（注册总开关 + 邮箱/昵称/手机号 off/optional/required，OptionDropdown） | SettingsForms.tsx RegisterSettingsForm |

> 基本设置页已删除（内容并入网站设置）；独立管理员登录页在路由组 `(admin-auth)`：`/guanli-7k2m9x/login`，与会员登录完全分离（Cookie：前台 `token` / 后台 `admin_token`）。

## 7. API 路由索引（src/app/api/）

全部 `force-dynamic`（无缓存）。返回统一 `NextResponse.json`，错误体形如 `{ error }`。

### 认证 / 用户
- `POST /api/auth/login`、`POST /api/auth/logout`、`POST /api/auth/register`（注册是否开放读 `getPublicSite().allowRegister`，并有限流）
- `GET /api/me`：当前登录用户
- `GET/PUT /api/user/profile`；`POST /api/user/avatar/upload`
- `GET /api/lang?next=`：切换 zh/en，写 locale cookie，回跳经 `safeNextPath` 校验（防开放重定向，URL 用请求头 host 拼绝对地址）

### 提示词
- `GET /api/prompts?page=&type=`：已发布分页（每页 24，createdAt desc）；`POST` 投稿（zod 校验 + sanitizeRich + 语言检测 + 按 publish.mode 决定直接上线/待审 + 同步 Meili）
- `POST /api/prompts/[id]/[kind]`：kind 仅 `like`/`favorite`，切换式，需登录且内容已发布
- `GET /api/categories`：公开分类
- `GET /api/comments`、`POST /api/comments`、`/api/comments/[id]`（审核隐藏/删除）
- `POST /api/translate`：自动翻译（分段 + TranslationCache）
- `POST /api/extract-meta`：粘贴链接时抓取媒体元信息
- `GET /api/settings`：公开配置（只回 siteName、allowRegister 等安全字段）
- `POST /api/upload`：**用户**媒体上传，登录 + IP 限流（30 次/分）+ publish.allowUpload 开关 + magic-byte 校验，存 `public/uploads/YYYY/MM/`

### 后台（均 requireAdmin + requirePerm）
- `/api/admin/prompts`（列表/创建）、`/[id]`（改/删/审核）、`/batch`（批量：分类/精选/热门/状态/删除）
- `/api/admin/categories`、`/api/admin/categories/[id]`（变更后 `invalidateCategoryCache()`）
- `/api/admin/users`、`/api/admin/users/[id]`
- `/api/admin/roles`、`/api/admin/roles/[id]`
- `/api/admin/logs`
- `/api/admin/settings`（GET 全部 / PUT basic/publish/membership）
- `PUT /api/admin/settings/site`（网站设置，存 **site 键**，saveSetting 自动清缓存即时生效）
- `POST /api/admin/settings/upload`：站点 LOGO/favicon/appIcon 上传；固定文件名白名单（logo-icon-120.png / favicon.ico / app-icon.png），2MB 限制，magic-byte 校验，写入 `public/site-assets/`，由 `/site-assets/[...path]` 动态路由读盘返回（Next.js 不服务运行时新增的 public 文件），返回 URL 带 `?v=时间戳` 破缓存；写失败返回中文权限提示

## 8. 组件索引（src/components/）

**前台**：SiteHeader、PromptCard（列表卡片，含封面降级链）、CardCover（封面 + TextCover 文字封面 + Placeholder）、CategoryIcon、CommentSection、RichEditor（富文本编辑器）、MediaUploader/MediaGallery/CoverUploader（上传/画廊/封面）、AutoTranslate、LanguageSwitcher、UserMenu/UserAvatar、AuthForm、Buttons、LogoutButton。

**后台**（components/admin/）：PromptManager、PromptForm、CategoryManager、UserManager、RoleManager、SettingsForms（basic/publish/membership）、SiteSettingsForm（site 页，含上传容错）。

**卡片封面降级链（PromptCard 已实现）**：
`coverUrl 有效图` →（图片 onError）→ `TextCover 文字摘要`；无 coverUrl 但有摘要 → `TextCover`（按类型配色：video 蓝/image 玫红/audio 琥珀/text 绿，引号水印 + line-clamp-3）；都没有 → 占位 Placeholder。摘要来源 `excerpt || description || plainExcerpt(content, 90)`。

## 9. lib 模块职责速查

| 文件 | 职责 | 关键约定 |
|---|---|---|
| db.ts | Prisma client 单例 | 所有 DB 访问走它 |
| auth.ts | JWT 签发/校验、cookie、getCurrentUser、requireAdmin | cookie 名 `token`；requireAdmin 要求 role=admin 且 status=active |
| rbac.ts | 服务端权限：getUserPermissions/hasPermission/requirePerm、logAdminAction、getClientIp、ensureDefaultRoles | **admin 未分配角色 = 超管（全部权限）**；支持 `*` |
| permissions.ts | 权限常量（**客户端组件只许 import 这个**，因 rbac 依赖 next/headers） | 19 个权限点，7 个分组 |
| settings.ts | 站点配置：DEFAULT_SETTINGS / getSettings（30s 缓存）/ saveSetting（清缓存）/ **getPublicSite()** | 见第 10 节 |
| meili.ts | Meili：searchPrompts、syncPromptToMeili、removePromptFromMeili | content 入库截 15000 字、description 截 2000；含 createdAtTs 排序字段 |
| media.ts | 纯函数：MediaItem 类型、链接识别为 image/video/embed | 支持 YouTube/Bilibili embed 转换 |
| rich.ts | 富文本工具：isHtmlContent、stripHtml、extractFirstImage、makeExcerpt | 判断新旧正文形态 |
| excerpt.ts | `plainExcerpt(text, max=90)` | 剥离标签/代码块/图片/`[N]`标记/实体后取纯文本摘要 |
| sanitize.server.ts | `sanitizeRich()`，`import "server-only"` | 纯文本原样返回；HTML 走白名单 |
| rate-limit.ts | 内存滑动窗口限流、clientIp、safeNextPath | 单实例适用，多实例需换 Redis |
| categories.ts | getCategorySlugs（30s 缓存）、invalidateCategoryCache | 分类页 generateStaticParams 用 |
| category-meta.ts | 分类展示元信息（图标/配色） | |
| dict.ts | 中英文字典 DICT + Locale 类型 + translate() + LOCALE_COOKIE | 文案改这里 |
| i18n.ts / i18n-client.ts | 服务端/客户端取当前语言（zh 默认，仅 zh/en） | |
| langdetect.ts | detectLang 语言检测 | 投稿时自动识别 |
| translate.ts | MyMemory 主 + Google gtx 备，700 字分块，落 TranslationCache | 免费无 Key 通道 |
| translateQueue.ts | 翻译并发队列 | |
| tag-vocab.server.ts | 标签词表（服务端） | |

## 10. 站点配置系统（重点，曾踩坑）

配置存 `SiteSetting` 表四个键：

- **site**：后台「网站设置」页数据（siteName/siteNameEn/siteDescription/searchKeywords/footerText/allowRegister(默认 null)/logoIcon/favicon/appIcon）
- **basic**：基本设置（站点名默认值、默认 allowRegister=true、defaultLocale）
- **publish**：mode(auto/review)、allowedTypes、字数限制、allowUpload/allowEmbed、maxImageMB(10)/maxVideoMB(100)/maxMediaPerPrompt(9)
- **membership**：free/pro/vip 三档

**前台只读 `getPublicSite()`**（settings.ts）：site 键非空值覆盖 basic 默认值；searchKeywords 按 `, ， 、 ； ; 换行/Tab/多空格` 拆成数组，空则用内置 DEFAULT_KEYWORDS；图标未配置时回退内置品牌文件。根 layout 的 generateMetadata（title/description/keywords/favicon/og）、SiteHeader、页脚、注册接口全部经它取数。
**历史坑**：曾出现后台存 site 键、前台只读 basic 键导致「改了完全不生效」，已统一；改配置相关代码务必沿用 getPublicSite，不要再造读取入口。saveSetting 会立即清缓存。

## 11. 视觉设计系统（src/app/globals.css，Tailwind v4 @theme）

深色科技风，全站 `color-scheme: dark`。**类名与实际颜色是重映射的，极易误判**：

- 页面底 `#0c0d18`；header/footer 用 zinc-950=`#0a0b14`；卡片 zinc-900=`#12141f`；描边 zinc-800/700
- **`emerald-*` 类名实际是靛蓝/紫罗兰**：emerald-500=`#6366f1`（Indigo）、400=`#818cf8`、600=`#4f46e5`。这是品牌主色
- **`royal-*` 是自定义琥珀金**（Tailwind 默认无此色）：royal-400=`#f59e0b`、300=`#fbbf24`，用于 CTA/热门/精选
- 品牌渐变文字工具类 `text-gold-gradient` / 绿紫渐变用于 LOGO 与标题点缀
- 内容类型配色（TextCover 等）：video 天蓝、image 玫红、audio 琥珀、text 绿色系
- 品牌图标：灯泡（绿→紫渐变丝带轮廓 + 金色四芒星灯丝 + 海军蓝底），母版在仓库外 `../LOGO/ai-logo-4-flat.png`，切图脚本 `../LOGO/build-kit.cjs`（依赖 sharp，借用旧项目 node_modules）

## 12. 环境变量（.env，勿提交真实值）

| 变量 | 用途 |
|---|---|
| DATABASE_URL | PG 连接串。本地 embedded：`postgresql://postgres:postgres@localhost:5432/prompthub`；服务器 Docker：`127.0.0.1:35432/prompthub`（带 connection_limit=20&pool_timeout=10） |
| JWT_SECRET | 32 字节随机 hex（`openssl rand -hex 32`） |
| MEILI_HOST / MEILI_MASTER_KEY | Meili 地址与 Master Key |
| NEXT_PUBLIC_SITE_URL | 站点绝对 URL（线上 https://www.wango8.com），sitemap/og/语言回跳用 |

注意：Trae 聊天复制 URL 可能带入 Markdown 反引号，粘贴进 `.env` 前要清掉。

## 13. scripts/ 脚本

| 脚本 | 作用 |
|---|---|
| db-manual.mjs | 启动本地 embedded-postgres（`npm run db:up`） |
| seed.mjs | 种子数据 |
| create-admin.mjs | 创建管理员账号（旧体系，新体系直接后台管理员设置里加，或用 migrate-admins.mjs 平移） |
| migrate-admins.mjs | **第 1 期管理员迁移**：User(role=admin) 按原 ID 平移 AdminAccount（无角色→isSuper），回填 AdminLog.adminId，旧行置 admin_legacy；幂等；**先 `prisma db push`**（`npm run migrate:admins`） |
| reindex-meili.mjs | 全量重建 Meili 索引（数据修复/换索引后跑） |
| **meili-sync-daemon.mjs** | **Meili 秒级增量同步守护**（PM2 常驻）：读 site.meiliSyncSeconds 轮询 updatedAt 水位（.meili-sync-state.json），增量 upsert/delete，每 10 分钟硬删除对账；0=空转；启动 `pm2 start scripts/meili-sync-daemon.mjs --name CompletePrompt-MeiliSync && pm2 save`（`npm run meili:sync`） |
| migrate-categories.mjs / migrate-cats-v2.mjs | 分类迁移 |
| parse_lib.py / parse_packs.py / seed_packs.mjs | 早期解析导入（`npm run parse`） |
| liblib-enumerate-feed.mjs | 枚举 liblib 作品 feed |
| liblib-fetch-nodes.mjs | 抓取画布节点产物（图片/视频） |
| liblib-import-media.mjs | 媒体下载入库 |
| liblib-map.mjs / liblib-validate-map.mjs | 作品映射表生成/校验 |
| liblib-verify-media.mjs / liblib-fix-darkframes.mjs | 媒体可用性校验、坏帧修复 |

liblib 系列是采集系统雏形，未来规划改造为 Crawlee connector（见第 16 节）。

## 14. 构建与部署

- 本地：`npm run db:up` → `npm run dev`（3000）。改 schema 后 `npm run db:push`（postinstall 自动 `prisma generate`）。
- 服务器发布：上传 `src/`、`public/`、`prisma/`、配置文件后
  `NEXT_TELEMETRY_DISABLED=1 npm run build && pm2 restart CompletePrompt`
  （8G 内存机无需 --max-old-space-size；`NODE_OPTIONS=` 等号后不能有空格）
- public 静态资源（favicon/LOGO）改动要注意浏览器/CDN 缓存；上传接口已用 `?v=时间戳`。
- 服务器目录权限：PM2 以 `www` 用户跑，上传功能需要
  `chown -R www:www /www/wwwroot/CompletePrompt/public`（历史上 EACCES 导致上传空响应）。
- Nginx 反代需放开 `client_max_body_size`（视频上传 100MB，建议 20m 以上按实际调）。
- 数据修复常用：导入后回填 `UPDATE "Prompt" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL AND status='published';`

## 15. 安全机制清单（改动时勿绕过）

1. 后台随机隐蔽路径 + 每个 API 独立 requireAdmin/requirePerm（无全局 middleware）。
2. JWT httpOnly cookie，sameSite=lax，生产 secure。
3. 上传：登录态 + 限流 + magic-byte 文件头 + Content-Type 交叉校验 + 随机文件名 + 类型大小限额；`/uploads/*` 响应 CSP `default-src 'none'; sandbox`、`X-Content-Type-Options: nosniff`、长缓存 immutable。
4. 富文本 sanitize-html 白名单；iframe host 白名单（YouTube/Bilibili）；链接强制 noopener nofollow。
5. 全局安全头：nosniff、X-Frame-Options SAMEORIGIN、Referrer-Policy。
6. 登录/注册/上传限流（内存滑窗，见 rate-limit.ts）。
7. open redirect 防护 safeNextPath；登录后台所有写操作落 AdminLog。
8. zod 校验所有公开 API 入参；media URL 只允许相对路径或 http/https。

## 16. 路线图（九大功能改造，分 4 期 —— AI 动相关代码前先与用户确认现状）

- **第 1 期（✅ 2026-09-24 已上线）**：①独立 AdminAccount 管理员体系+独立登录页；②会员表扩展（phone/allowPublish/IP/登录时间，用户管理 CRUD）；③删基本设置、网站设置加 Meili 同步间隔；⑥注册字段配置；⑦日志账号模糊查询；⑨OptionDropdown 全站少量选项统一；Meili PM2 守护进程。
- **第 2 期（✅ 2026-09-24 与第 1 期一起上线）**：⑤原作品链接 `Prompt.sourceUrl` 前后台输入框（dict 键 `publish.field.sourceUrl`；三处 zod 用独立 sourceUrl 规则，空串=清空）+ TipTap v3 富文本替换（见 17.1）；⑧详情页点赞收藏按钮美化（components/Buttons.tsx ActionButtons：胶囊+SVG+btn-pop 动画，API 契约 `{count,active}`/`{active}` 不变）；后台提示词列表/仪表盘待审核展示 adminAuthor 真实管理员作者（靛蓝「管理员发布」徽章）。
  - **17.1 TipTap 编辑器架构**：`components/editor/TiptapVideo.ts`（自定义块级 video 原子节点）+ `components/RichEditor.tsx`（useEditor `immediatelyRender:false`；StarterKit heading [2,3] + Underline/Link/Image/Placeholder；工具栏图片/视频复用 UniversalUploader compact 单文件；Props 契约 `{value,onChange,placeholder,minHeight,maxImageMB,maxVideoMB}` 不变；外部 value 用 lastEmitted ref + setContent(emitUpdate:false) 防光标回灌）；样式 `.tiptap-prose` 在 globals.css；sanitize.server.ts 已放 pre/code；输出仍为 HTML 字符串，富文本/纯文本双形态判断走 lib/rich.ts isHtmlContent，历史数据 plainToHtml 且剥 `^\[\d+\]` 标记。
- **第 3 期（✅ 2026-09-24 已上线）**：④站内自研评论系统（PG 原生于现有 Comment 半成品上加固）。设计文档 `docs/ai/06-comment-system-design.md`。
  - **安全注意**：公开 GET/POST /api/comments 必须经 `presentComment()` 视图投影，**ip/ua 只允许出现在后台 /api/admin/comments**（首次上线漏投影曾把 ip/ua 下发给游客，已当日修复重部署）。
  - **18.1 评论架构**：仅登录会员可评、游客只读；两级嵌套（顶级+一级回复，parentId 自关联，回复只能挂顶级）；顶级 20 条/页（`COMMENT.PAGE_SIZE`，lib/comment-policy.ts）。
  - **18.2 防刷链**（POST /api/comments 顺序）：401 → User.commentBanned 403 → zod(≤1000字) → comment.enabled 全站开关 → prompt 存在/published/未 commentsClosed → 父评论合法 → DB count 限频：60s 内 ≥6 硬拒 429、≥4（即第4条起）或 10min 内已触发则要求算术验证码（lib/captcha.ts 内存一次性 5 分钟，GET /api/captcha；前端 429 `captchaRequired` 内联展开）→ 敏感词星号替换直发（maskSensitive，词库存 SiteSetting `comment.sensitiveWords`）→ 写库带 ip/ua + commentCount+1。
  - **18.3 数据/接口**：新表 CommentLike（@@unique([commentId,userId])，onDelete:Cascade）；User.commentBanned、Prompt.commentsClosed、Comment.ip/ua；状态 published/hidden/deleted，计数只随 published↔其他迁移；有公开回复的已删顶级评论返回 deleted 占位（GET where OR：published 或 deleted 且有 published replies）。接口：GET/POST /api/comments（**返回 `{list,...}` 不是 comments**）、POST /api/comments/[id]/like（`{active,count}`，修旧版 404）、PATCH/DELETE /api/comments/[id]、后台 GET /api/admin/comments + POST /api/admin/comments/batch、PUT /api/admin/settings/comment（独立接口不走通用 settings 白名单）。
  - **18.4 前端/后台**：CommentSection props 扩展 `{closed, initialTotal}`，CommentData 加 `liked/deleted`，详情页服务端带当前用户已赞 likes 集合；后台「评论管理」CommentManager（状态 Tab+筛选+单条/批量+敏感词库与全站开关），用户管理 OptionDropdown 评论禁言，PromptForm 关评勾选。导航插入评论后超管 splice 索引改 6。
- **第 4 期（✅ 2026-09-24 已上线）**：全站手机/平板响应式（前台精适配、后台保底，纯样式零接口/零 schema 变更）。设计文档 `docs/ai/07-responsive-design.md`。
  - **断点策略**：Tailwind 默认断点，基础=手机，`md`(768) 为导航形态分界；硬规则：360px 零页面级横向滚动（仅后台宽表/富文本代码块允许内部横滑）、主操作触控 ≥38–40px、Tab 栏 ≥48px。
  - **手机导航**：新增 `components/MobileTabBar.tsx`（client；`md:hidden fixed bottom-0 z-30`，4 标签 首页/热门/分类/我的，52px 高+`env(safe-area-inset-bottom)`，无凸起发布键；发布入口保留在会员中心/空状态）；SiteHeader `<nav>` 改 `hidden md:flex`（<md 整块隐藏，发布键随之不在顶栏）；`(site)/layout.tsx` main `pb-24 md:pb-8`、footer `pb-16 md:pb-0` 防遮挡。
  - **前台微调**：首页 hero `px-5 py-8 sm:px-6 sm:py-10`；详情正文卡 `p-3 sm:p-4`；评论区卡 padding/回复缩进 ml-8→sm:ml-12/操作行 flex-wrap/发送键 min-h-40；会员中心统计卡收紧、操作按钮 `flex-1 sm:flex-none`（LogoutButton 外包 `[&>button]:w-full`）；CopyButton 加 `shrink-0 whitespace-nowrap`（修标签占满行时按钮被压竖排）。
  - **后台保底**：内容区 `p-4 lg:p-7`；筛选输入 `min-w-[160px] sm:min-w-[220px]`（评论搜索手机 w-full）；UserManager/AdminManager 弹窗 `p-4 sm:p-6`，双列表单 `grid-cols-1 min-[380px]:grid-cols-2`；宽表 overflow-x-auto/导航横滑/角色弹窗均维持原样。
  - **验收方式**：playwright-core（临时目录、channel=msedge，不进项目依赖）四档视口 360/390/768/1280 逐页测 scrollWidth==clientWidth + 截图；全页截图里 fixed Tab 栏会被拼接在页面中段，属工具伪影不是 bug。
- **v0.3（✅ 2026-09-27 已上线）**：前台零后台入口——member 页删除「后台管理」按钮与管理员徽章（两套用户体系完全隔离；唯一保留的管理员态是详情页不可见的未发布预览放行 canSee）。规则见 gotchas #93。
- **v0.4（✅ 2026-09-27 已上线）**：后台采集管理（LibLib TV 首发）+ 后台导航重排改名。设计文档 `docs/ai/08-crawl-admin-design.md`。
  - **采集架构**：新表 CrawlItem（`@@unique([source,remoteId])` 去重、status new/collected/failed、promptId 关联）、CrawlJob（异步任务进度）；权限点 `crawl:manage`。
  - **源注册**：`lib/crawl-sources.ts`（目前仅 libtv）；`lib/crawl-libtv.ts` 负责 feed 流（热门前 N 页，页隔 250ms/429 退避）、detail、extractNodes、分节内容构建（`[N] 图片生成｜｜节点名`，媒体 section=N）；`lib/crawl-worker.ts` 在 Next 进程内异步入库（建 Prompt → sharp 下载封面+≤12 节点图+ffmpeg 截≤6 视频帧到 public/uploads/liblib/<id>/ → 回写 media → 双写 Meili），importer 账号 username=`libtv`。
  - **边界/媒体**：图片≤12 张/作品，视频截帧≤6 段（ffmpeg 8.0.1 已 apt 安装，三时间点亮帧策略，详见 gotchas #97），音频节点只留文字；「全部采集」单次上限 100；同时只允许一个 running 任务（45 分钟超时 reapStaleJobs 回收）；已采集作品远端有更新只计数提示不覆盖。
  - **v0.4 补丁（2026-09-28）**：① fetch 拉 feed 后并发探测 detail，未公开提示词画布的作品（短片/获奖作，nodes 为空、已删除 10051、私有）在获取阶段即剔除不进列表，已存在的 new/failed 死条目同步清除，探测临时失败保守保留（`filterCollectableItems`，一次 fetch 60 条约 20-40s）；② `CrawlJob.lastError` 只记录最后一条失败（《标题》：原因），进度卡片红字单行显示；③ 采集管理 UI 去掉「访问源站 ↗」。详见 gotchas #99/#100。
  - **接口**：GET /api/admin/collect/sources、GET items、POST fetch、POST import（all 或 ids）、GET jobs/[id]；页面 `(admin)/.../collect` + components/admin/CollectManager.tsx。
  - **导航新序**：仪表盘/网站设置/提示词管理/提示词分类/采集管理/发布设置/用户管理/注册设置/评论管理/管理员设置(超管)/权限角色/后台操作日志；侧栏底标 `FULL PROMPT v0.4`。
- 部署第 1 期顺序：`npx prisma db push`（只加可空列/新表）→ `node scripts/migrate-admins.mjs` → `npm run build` → `pm2 restart CompletePrompt` → `pm2 start scripts/meili-sync-daemon.mjs --name CompletePrompt-MeiliSync`。
- 另一条长期规划：**后台集成 AI 能力**：经 llm-api.net（Key 仅放服务端 `.env`，绝不下发浏览器），新建 `/api/admin/ai/*` 服务端代理；功能：自动打标签、生成简介、中英翻译、润色。
- 多站点采集已在 v0.4 落地首站（LIBTV），后续加站：在 crawl-sources.ts 注册 + 实现同形 feed/detail 适配；Crawlee 化暂未做（当前直连官方 API，无需浏览器渲染）。

## 17. 关键文件速查（改需求时从这里进）

| 想改什么 | 先看哪个文件 |
|---|---|
| 浏览器标题/关键字/favicon/OG/站点名 | src/app/layout.tsx + src/lib/settings.ts(getPublicSite) |
| 页眉页脚 LOGO/文案 | src/components/SiteHeader.tsx、src/app/(site)/layout.tsx |
| 后台网站设置表单/上传 | src/components/admin/SiteSettingsForm.tsx + api/admin/settings/site、upload |
| 卡片封面/无封面文字摘要 | src/components/PromptCard.tsx、CardCover.tsx、src/lib/excerpt.ts |
| 投稿校验与发布流转 | src/app/api/prompts/route.ts |
| 搜索/筛选/排序 | src/lib/meili.ts + src/app/(site)/search/page.tsx |
| 权限点/角色 | src/lib/permissions.ts、rbac.ts |
| 采集管理（LIBTV） | src/lib/crawl-sources.ts、crawl-libtv.ts、crawl-worker.ts；api/admin/collect/*；components/admin/CollectManager.tsx |
| 正文渲染/清洗（TipTap） | src/lib/rich.ts、sanitize.server.ts、components/RichEditor.tsx、components/editor/TiptapVideo.ts |
| 原作品链接字段 | Prompt.sourceUrl；publish/page.tsx、admin/PromptForm.tsx、api/prompts、api/admin/prompts（POST+PATCH） |
| 上传安全 | src/app/api/upload/route.ts、api/admin/settings/upload/route.ts |
| 文案/中英翻译 | src/lib/dict.ts、translate.ts |
| 颜色/样式令牌 | src/app/globals.css |
| 数据表 | prisma/schema.prisma |
| 部署 | docs/server-部署指南.md、ecosystem.config.cjs、.env.example |

---

# 第二部分：开发手册（新 AI 必读）

> 以下章节回答「一个新功能从数据库到界面具体怎么动手」。第 18 节是流程，第 19 节专讲数据库变更，第 20 节是可直接照抄的代码骨架，第 21 节用「用户推荐奖励系统」做了一份完整施工蓝图。

## 18. 新功能标准开发 SOP（按顺序执行，不要跳步）

1. **需求确认**：涉及哪些角色（游客/登录用户/管理员）、是否需要新数据表或字段、奖励/金额类规则先与用户确认数值。
2. **设计数据层**：改 `prisma/schema.prisma`（规则见第 19 节），想清楚关系两端字段、索引、默认值。**先在纸上写出新模型/字段再动手。**
3. **本地同步 DB**：`npm run db:up`（库已在跑则跳过）→ `npx prisma db push` → 自动生成新的 Prisma 类型。
4. **写服务端逻辑**：lib/ 放可复用纯逻辑/数据访问；API 路由只做鉴权、参数校验、调 lib、返回 JSON。
5. **写页面/组件**：能在 Server Component 查的就不要新建 API（项目惯例：前台页面直接 `db` 查询，只有客户端交互才走 fetch API）。
6. **接线**：后台功能记得加 NAV 菜单 + 权限点 + AdminLog；有中英文案加 dict.ts；有新设置项走 settings 键（不要新建配置表）。
7. **自检**：GetDiagnostics 零错误；全局搜旧引用；手动走一遍主流程和异常流程（未登录/无权限/参数错误/重复提交）。
8. **数据回填**：新字段对老数据有要求时，写 `scripts/xxx.mjs` 一次性脚本（参照现有脚本写法，顶部 `import { PrismaClient } from "@prisma/client"`）。
9. **部署**：第 19.5 的生产变更顺序；更新本 AGENTS.md 的路由表/速查表。

**判断功能落点的决策树**：
- 只是展示数据、无交互 → Server Component 里直接查库（如 member/page.tsx）。
- 用户点击触发变化（点赞/保存/上传） → 新建/复用 API + Client Component fetch。
- 管理员后台 CRUD → `api/admin/*` + `components/admin/*` + 后台页面 + 权限点 + 菜单 + 日志。
- 跨页面共享的规则/配置 → lib/ 模块；可调数值 → SiteSetting 键 + 后台设置页。

## 19. 数据库变更完全指南（Prisma 6 + PostgreSQL）

### 19.1 铁律
- **`prisma/schema.prisma` 是唯一真相**，永远先改它，不要手写 SQL 改结构（回填数据可以用脚本/SQL）。
- 项目使用 **`prisma db push`** 模式（无 migrations 目录、无 migration 历史），不要用 `prisma migrate dev` 生成迁移文件。
- 状态字符串**不用 Prisma enum，统一用 `String` + 注释**（与现有 status/role/type 一致）。
- 新增生产字段：**必须可空（`?`）或带 `@default`**，否则 db push 在有数据的表上会失败或填错值。
- Prisma 关系是**双向的**：加外键必须同时在两个模型上声明关系字段，漏一端 push 会报错。
- 改完 schema 后 TS 类型来自重新生成的 `@prisma/client`；**不跑 generate，新字段在代码里标红/不存在**。

### 19.2 常见变更模板

**加普通字段**（可空，最安全）：
在模型内加一行 `inviteCode String? @unique`，`@unique` 会自动建唯一索引。

**加自关联关系**（用户邀请用户这类树形/引用关系，必须起关系名）：
```prisma
model User {
  // 邀请人（谁邀请了我）
  invitedById Int?
  invitedBy   User?  @relation("UserInvites", fields: [invitedById], references: [id])
  // 我邀请的人
  invitees    User[] @relation("UserInvites")
}
```

**加一对多关系 + 新表**（如奖励流水）：
```prisma
model RewardRecord {
  id        Int      @id @default(autoincrement())
  userId    Int      // 奖励归属人（邀请人）
  user      User     @relation(fields: [userId], references: [id])
  inviteeId Int      // 触发奖励的新用户
  type      String   // register_invite | invitee_publish ...（字符串约定，不用 enum）
  points    Int      @default(0)
  remark    String?
  createdAt DateTime @default(now())

  @@index([userId, createdAt(sort: Desc)])
  @@index([inviteeId])
}
```
同时在 User 模型里加 `rewardRecords RewardRecord[]`，并在 User 里加冗余汇总字段 `rewardPoints Int @default(0)`（列表高频展示，避免每次 count/sum）。

**加索引**：`@@index([字段])`；复合/排序索引照 Prompt 模型写 `@@index([status, createdAt(sort: Desc)])`。
**加 JSON 字段**：`extra Json @default("{}")`（注意默认值是字符串化 JSON，数组用 `"[]"`）。

### 19.3 本地变更流程
1. 确保本地 embedded PG 在跑：`npm run db:up`
2. 改 schema.prisma
3. `npx prisma db push`（建表/加字段/加索引一步完成，同时 generate client）
4. 若只改了类型没触发 generate：`npx prisma generate`
5. 需要种子/回填：写 scripts 脚本后 `node scripts/xxx.mjs`

### 19.4 db push 破坏性边界（生产前必看）
- 安全（只增不减）：加表、加可空字段、加带 default 字段、加索引、加 @@map。
- 危险（push 会提示数据丢失，需要 `--accept-data-loss`，**禁止在生产盲目确认**）：删字段、改字段类型、收紧唯一约束、删表。
  生产上要删/改字段时：先用 SQL 备份列（`ALTER TABLE ... ADD COLUMN 备份 ...` 或导出），低峰操作，确认代码已不读旧字段后再清理。

### 19.5 生产（服务器）变更顺序
项目目录 `/www/wwwroot/CompletePrompt`，DATABASE_URL 指向 Docker PG（127.0.0.1:35432）。上传新的 `prisma/schema.prisma` 和 `src/` 后：
```bash
cd /www/wwwroot/CompletePrompt
npx prisma db push          # 结构同步（加字段/加表安全；出现数据丢失警告立即停下排查）
npx prisma generate         # 生成与新 schema 匹配的 Client
NEXT_TELEMETRY_DISABLED=1 npm run build
pm2 restart CompletePrompt
```
顺序不能反：**先 push + generate 再 build**，否则 build 时 TS 找不到新字段。纯加索引/加可空字段不需要停服维护窗口；回填脚本在 restart 后跑。

### 19.6 数据一致性模式
- 涉及「主表 + 计数/流水」多表写，用事务（照抄点赞路由 `/api/prompts/[id]/[kind]/route.ts` 的 `db.$transaction([...])` 模式）。
- 高频展示的统计用**冗余计数字段**（如 likeCount），在事务里增减；不要在列表页实时 count 大表。
- 唯一性防刷：能靠数据库唯一约束兜底的（如一个用户只能被邀请一次 = invitedById 单字段天然唯一；复合防重 = 复合 `@@unique`），不要只靠代码先查后插（并发下会漏）。

### 19.7 与 Meilisearch 的边界
Meili 索引 `prompts` 只存**提示词检索相关字段**（见 lib/meili.ts 的 syncPromptToMeili）。用户维度的新功能（推荐、积分、个人资料）**不要**进 Meili；只有当新字段需要被搜索/筛选时（例如想按新标签筛提示词），才同时改 syncPromptToMeili 的文档结构并跑 `node scripts/reindex-meili.mjs` 全量重建。

## 20. 代码骨架手册（照项目现有风格写）

### 20.1 公开写操作 API（游客或登录用户可调）
以 register/route.ts 为标准范式，顺序固定：限流 → 业务开关 → `req.json().catch(()=>null)` → zod safeParse → 查重 → 写库（多表用事务）→ 返回 JSON。要点：
- 顶部 `export const dynamic = "force-dynamic";`
- 入参解析必须 `.catch(() => null)`，防止非法 JSON 抛裸异常。
- 限流：`rateLimit("业务名:"+clientIp(req), 次数, 窗口ms)`（rate-limit.ts，窗口单位毫秒）。
- 错误返回 `NextResponse.json({ error: "中文提示" }, { status: 4xx })`，HTTP 状态码语义准确（400 参数 / 401 未登录 / 403 关闭或无权 / 409 冲突 / 429 限流）。
- 成功返回 JSON 带前端需要的最小字段，不回传 passwordHash。

### 20.2 后台管理 API
以 admin/settings/site/route.ts、admin/users/route.ts 为范式：
1. `requireAdmin()` → 403；
2. `requirePerm(PERMISSIONS.XXX)` → 403（权限常量从 `@/lib/rbac` 服务端导入；**客户端组件才从 `@/lib/permissions` 导入**）；
3. GET 列表：`Promise.all([findMany(skip/take), count])`，返回 `{ list, total, page, pageSize }`；用户列表记得解构剔除 `passwordHash`；
4. 写操作：zod 校验 → 合并旧值（设置类）→ 落库 → **必须 `logAdminAction({ userId: admin.id, action, targetType, detail: JSON.stringify(变更), ip: await getClientIp() })`**；
5. 整体加 try/catch 兜底返回 JSON（上传类接口已有完整范例）。

### 20.3 Server Component 页面（前台/后台通用）
- 顶部 `export const dynamic = "force-dynamic";`（依赖 cookie 的页面必须，否则构建时静态化会读不到登录态）。
- 鉴权：前台 `const user = await getCurrentUser(); if (!user) redirect("/login?next=/当前路径");`；后台 `requireAdmin()` 失败 `redirect("/login?next="+encodeURIComponent(ADMIN_BASE))`。
- 多个独立查询用 `Promise.all`（见 member/page.tsx）。
- 查询只 select 需要的字段；列表给卡片传数据时记得带 `description/content/coverUrl`（文字封面降级依赖，见第 8 节）。
- 页面只取数和排版；交互（按钮/表单/弹窗）抽 `"use client"` 组件，通过 props 传初始数据。

### 20.4 后台页面 + 客户端表单三件套
- 页面 `app/(admin)/guanli-7k2m9x/xxx/page.tsx`：requireAdmin + 读初始数据 + 渲染客户端组件（照 settings/site/page.tsx）。
- 组件放 `components/admin/XxxManager.tsx`，`"use client"`；保存用 fetch PUT/POST。
- fetch 响应容错标准写法（任何写操作都用这个，不要裸 `r.json()`）：
  先 `const text = await r.text()`，再 try `JSON.parse`，空体/HTML/非 2xx 都转成中文错误；参考 SiteSettingsForm.tsx 的 upload 函数。
- 成功后 `router.refresh()` 刷新 Server Component 数据。

### 20.5 新增一个后台菜单项
改 `src/app/(admin)/guanli-7k2m9x/layout.tsx` 的 NAV 数组，href 必须基于 `ADMIN_BASE` 拼接（禁止硬编码 `/admin`）。

### 20.6 新增一个权限点（3 处都要改，漏了就失效）
1. `src/lib/permissions.ts`：PERMISSIONS 加常量（如 `REWARD_READ: "reward:read"`）；
2. 同文件 PERMISSION_GROUPS 合适分组里加字符串（角色编辑页才看得到勾选项）；
3. 新后台 API 里用 `requirePerm(PERMISSIONS.REWARD_READ)` 守卫。
注意：adminRoleId 为空的超管自动拥有全部权限，无需给超管角色显式加。

### 20.7 加中英文案
所有用户可见文字优先走 dict.ts：在 DICT 的 zh/en 两段加同名 key（如 `reward.title`），服务端组件用 `getServerLocale()` + `translate as t`，客户端用 `useLocale()` + `@/lib/i18n-client` 的 t（参考 AuthForm.tsx）。纯后台中文页面可以直接写中文。

### 20.8 加一组可调设置（如奖励规则）
不要建表。在 settings.ts 的 DEFAULT_SETTINGS 加新键段（如 `reward: { inviterPoints: 100, inviteePoints: 10, enabled: true }`），getSettings/saveSetting 的联合类型与读取键数组同步扩展；后台新建 `settings/reward/page.tsx` + 表单组件，PUT 路由仿 site 路由调用 `saveSetting("reward", merged)`。30 秒缓存由 saveSetting 自动失效。

### 20.9 计数与列表的既有约定
- 分页：前台每页 24，后台每页 30；页码从 1 开始，`Math.max(1, parseInt(...) || 1)` 防 NaN。
- 模糊搜索：`{ contains: q, mode: "insensitive" }`（PG）。
- 时间排序新功能统一用 createdAt desc；提示词业务排序用 publishedAt/createdAtTs，别用 updatedAt。

## 21. 实战蓝图：用户推荐奖励系统（端到端施工样例）

> 这是一份「如果要做，应该这样改」的完整方案，用于验证本手册可执行性；**当前代码尚未实现**，动工时以用户最终确认的奖励数值为准。它覆盖：数据库结构变更、注册链路、防刷、个人中心、后台管理、回填脚本。

### 21.1 功能定义（需先与用户确认的点）
- 每个用户有唯一邀请码，邀请链接 `https://www.wango8.com/register?ref=邀请码`。
- 被邀请人注册成功：邀请人得 A 积分、被邀请人得 B 积分（数值待定）；后续可扩展「被邀请人首次发布再奖励」。
- 积分字段 `rewardPoints` 先只累计展示；是否能兑换/抵扣会员为后续二期，不在第一期做支付闭环。

### 21.2 数据层改动（prisma/schema.prisma，按第 19 节）
1. User 新增：
   - `inviteCode String? @unique`（懒生成：老用户首次进会员中心时生成；用 8 位 `[a-z0-9]`，生成方式与项目随机文件名风格一致，循环重试直到唯一）
   - `invitedById Int?` + `invitedBy User? @relation("UserInvites", fields:[invitedById], references:[id])`
   - `invitees User[] @relation("UserInvites")`
   - `rewardPoints Int @default(0)`
   - `rewardRecords RewardRecord[]`
2. 新模型 RewardRecord（结构照 19.2 模板）：userId（邀请人）、inviteeId、type、points、remark?、createdAt，索引 `[userId, createdAt desc]` 与 `[inviteeId]`。
   防重原理：`invitedById` 单值唯一语义保证一个账号一生只能被绑定一个邀请人；RewardRecord 追加 `@@unique([inviteeId, type])` 防止同一事件重复发奖。
3. 可调规则：DEFAULT_SETTINGS 加 `reward` 段（enabled、inviterPoints、inviteePoints），后台加「奖励设置」页（按 20.8）。

### 21.3 注册链路改造（核心）
1. `src/components/AuthForm.tsx`：已有 `useSearchParams()`，读 `sp.get("ref")`，注册请求 body 从 `{ username, password }` 扩成 `{ username, password, inviteCode }`；注册页可显示「来自好友 xxx 的邀请」提示（注册前先不查，或加轻量 GET 校验接口，一期建议只带码不预览）。
2. `src/app/api/auth/register/route.ts`：
   - zod schema 加 `inviteCode: z.string().trim().regex(/^[a-z0-9]{4,16}$/i).optional()`；
   - 创建用户与发奖放进 **`db.$transaction`**：查邀请人 `findUnique({ where: { inviteCode }})`；邀请码无效/等于自己不可能发生（新人），无效则**静默忽略不阻断注册**；有效则 create user 时带 `invitedById`，`update` 邀请人 `rewardPoints: { increment: A }`、新用户 `increment: B`，create 两条 RewardRecord（invitee 那条的 userId 是新人自己，type 区分）；
   - 仍保持现有限流、allowRegister 开关、注册即登录的 cookie 流程；
   - 注意事务内不要做网络请求。
3. 登录态字段透出：`src/lib/auth.ts` 的 getCurrentUser select 白名单加 `rewardPoints`、`inviteCode`（**白名单制，不加就拿不到**）；`/api/me` 无需改（透传 user）。

### 21.4 前台展示
- `src/app/(site)/member/page.tsx`：Server Component 里若当前用户 inviteCode 为空则生成并落库（循环重试唯一冲突），页面新增区块：
  - 邀请链接（用 `NEXT_PUBLIC_SITE_URL` 拼 `/register?ref=码`，加复制按钮——做一个小的 client 组件，用 navigator.clipboard）；
  - 积分大卡、已邀请人数、最近奖励记录（查 RewardRecord take 10）、我邀请的人列表（User.invitees 选 username/createdAt）。
  - 视觉沿用现有 stat 卡片：`rounded-xl border border-zinc-800 bg-zinc-900/60`，数字用 `text-emerald-400`（注意颜色重映射，见第 11 节）。
- 注册成功后会员中心可显示「你由 xxx 邀请，已获 B 积分」。

### 21.5 后台管理
1. 权限点：permissions.ts 加 `REWARD_READ: "reward:read"`、`REWARD_ADJUST: "reward:adjust"`，加入「站点设置」或新建「奖励系统」分组（20.6）。
2. 新页面 `(admin)/guanli-7k2m9x/rewards/page.tsx`：奖励流水列表（分页、按用户名/类型筛选）+ 手工调整积分入口；API 新建 `api/admin/rewards/route.ts`（GET 流水）与 `api/admin/rewards/adjust/route.ts`（POST 手工增减，写 RewardRecord type=`manual`，记 AdminLog）。
3. UserManager.tsx / admin/users GET：列表带出 rewardPoints、invitedById 关联用户名（include invitedBy select username）。
4. NAV 加「奖励记录」菜单（20.5）。

### 21.6 老数据回填脚本
新建 `scripts/backfill-invite-codes.mjs`：遍历 `inviteCode = null` 的用户（分页 findMany），为每人生成唯一码并 update；生成前用 `findUnique` 探测冲突。**奖励流水不回溯**（老邀请关系无数据来源）。部署后手动 `node scripts/backfill-invite-codes.mjs`。

### 21.7 文件级改动清单（给执行 AI 的 checklist）
1. prisma/schema.prisma（User 4 字段 + 双向关系、新 RewardRecord 模型、@@unique/@@index）
2. 本地 `npx prisma db push`
3. src/lib/settings.ts（DEFAULT_SETTINGS.reward + 类型键联合）
4. src/lib/auth.ts（getCurrentUser select 加字段）
5. src/app/api/auth/register/route.ts（zod + 事务发奖）
6. src/components/AuthForm.tsx（携带 ref）
7. src/app/(site)/member/page.tsx + 新客户端复制组件
8. src/lib/permissions.ts（2 个权限点 + 分组）
9. src/app/api/admin/rewards/route.ts、adjust/route.ts
10. src/app/(admin)/guanli-7k2m9x/rewards/page.tsx + components/admin/RewardManager.tsx
11. src/app/api/admin/users/route.ts + UserManager.tsx（展示积分/邀请人）
12. 后台 layout.tsx NAV
13. dict.ts（中英文案）
14. scripts/backfill-invite-codes.mjs
15. 生产按 19.5 顺序 push → generate → build → restart → 跑回填
16. 更新本 AGENTS.md 第 4/6/7 节

### 21.8 防刷与边界（评审时自检）
- 注册接口已有的 IP 限流（8 次/10 分钟）是第一道防线；奖励规则加 `reward.enabled` 总开关。
- 被自己的小号刷：第一期接受该残余风险（注册限流 + 只发积分不发现金）；二期可加「被邀请人发布过审核内容才解锁奖励」。
- 邀请码登录后再访问 /register?ref= 不允许改绑（注册后 invitedById 永不更新——接口里不提供更新路径）。
- 手工调分必须留 AdminLog + RewardRecord 双记录。

---

## 22. 给接手 AI 的最后提醒

- 本手册的代码骨架全部摘自仓库真实文件；若发现实际代码与本文不一致，**以代码为准并顺手修订本文档**。
- 完成任何功能后：回填第 5/6/7 节路由表与第 17 节速查表；新增环境变量补第 12 节；新增脚本补第 13 节。
- 拿不准业务数值、奖励规则、付费逻辑、涉及删除生产数据时，先问用户再动手。

---

# 第三部分：AI 专题手册分册（docs/ai/）

> AGENTS.md 回答「项目是什么、规矩是什么」；分册回答「任意具体需求怎么精确动手」。
> **开工前按下表选读，不要凭印象写代码。**

| 分册 | 何时必须读 |
|---|---|
| [docs/ai/01-universal-task-protocol.md](docs/ai/01-universal-task-protocol.md) | **接到任何任务先读**：六步工作法、读码顺序、影响面排查表、四级验证、报错速判 |
| [docs/ai/02-api-contracts.md](docs/ai/02-api-contracts.md) | 新增/修改任何 API、对接前后端、改鉴权限流时：全部接口的入参/出参/鉴权契约 |
| [docs/ai/03-frontend-contracts.md](docs/ai/03-frontend-contracts.md) | 改页面/组件时：Server/Client 边界、每页数据流、全部组件 props 契约、样式约定 |
| [docs/ai/04-feature-patterns.md](docs/ai/04-feature-patterns.md) | 接到新功能先对号入座：15 种功能原型（加字段/互动/新内容/后台/配置/注册/上传/搜索/第三方/定时任务等）的必改触点矩阵 |
| [docs/ai/05-gotchas.md](docs/ai/05-gotchas.md) | 提交前通读：58 条已验证陷阱（Next15、Prisma、内容双形态、Meili 双写、设置缓存、安全、部署） |

**最小阅读路径**：第 0 节硬规则 → 01 分册六步法 → 04 分册找原型 → 按原型引用的 02/03 契约动手 → 05 分册逐条自检。
第 21 章的「推荐奖励系统」蓝图是 04 分册 P1+P2+P4+P5+P6 组合应用的完整样例。
