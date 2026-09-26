# 02 · API 契约册（全部接口的事实清单）

> 约定：所有路由文件顶部均有 `export const dynamic = "force-dynamic"`。
> 成功/失败一律 JSON；失败体形如 `{ error: "中文或英文短语" }`。
> 鉴权两档：`getCurrentUser()`（登录用户）与 `requireAdmin()`+`requirePerm()`（后台）。
> 入参解析统一 `await req.json().catch(() => null)` 后 zod safeParse 或手工判空。
> Next.js 15 路由签名：动态段参数是 **Promise**，必须 `const { id } = await ctx.params`。

## 鉴权机制（与每个接口相关）

- 登录成功写 httpOnly cookie，名 `token`，JWT(HS256) payload 仅 `{ uid }`，30 天有效
- `getCurrentUser()` 返回的用户字段是**白名单 select**（id/username/role/bio/membershipLevel/membershipUntil/status/createdAt）——要新字段必须改 auth.ts
- `requireAdmin()`：role==="admin" 且 status==="active"，否则 null
- `requirePerm(点)` 返回 `{ user, ok }`；adminRoleId 为空 = 超管全通过
- 限流：`rateLimit(key, hit, windowMs)`，内存滑窗，key 习惯 `"业务:IP"`

---

## 一、认证与用户

### POST /api/auth/register
- 限流：同 IP 8 次 / 10 分钟；总开关 `getPublicSite().allowRegister`（关闭返 403 `registration closed`）
- body：`{ username: 3-20 位[A-Za-z0-9_-], password: 6-72 }`
- 用户名重复 → 409；成功创建 user（仅 username/passwordHash）→ 写 token cookie → `{ id, username }`
- 注意：注册接口不接受昵称/邮箱等其他字段；扩展注册字段要同时改 AuthForm、zod、create data

### POST /api/auth/login
- 限流：12 次/分钟；body `{ username, password }`；用户名 >64 或密码 >128 直接 401
- 失败统一文案"用户名或密码错误"；成功写 cookie → `{ id, username }`

### POST /api/auth/logout
- 清 token cookie

### GET /api/me
- `{ user }`，未登录 user=null（不返 401）；字段=getCurrentUser 白名单

### GET /api/user/profile
- 需登录；返回完整资料（id/username/email/nickname/avatar/bio/role/membershipLevel/membershipUntil/status/createdAt）

### PUT /api/user/profile
- 需登录；**白名单字段更新**：仅处理 nickname(≤30)、avatar(≤500 路径串)、bio(≤500)，空串落 null；无有效字段 → 400
- 返回 `{ id, username, nickname, avatar, bio }`
- 加新可编辑资料字段：这里 + ProfileForm + GET select 三处

### GET /api/lang?next=<path>
- 切换语言：读请求体/查询设置 `locale` cookie（zh/en），回跳 next（safeNextPath 校验，仅站内相对路径）

### GET /api/settings（公开）
- `{ basic: { siteName, allowRegister }, publish: <publish 设置全量>, membership: <tiers> }`
- 注册页用它判断是否开放注册（AuthForm 读 `d.basic.allowRegister`）；发布页读 publish 限额

---

## 二、提示词与互动

### GET /api/prompts?page=&type=
- 公开；只返回 published；type 限 text/image/video/audio；每页 24，createdAt desc
- 列表 select 字段：id/title/type/tags/sourceAuthor/likeCount/viewCount/createdAt（**不含 content**，客户端列表不要依赖此接口拿正文）
- 返 `{ list, total, page }`

### POST /api/prompts（用户投稿）
- 需登录（401"请先登录"）；受 publish.maxContentLen 约束
- body（zod）：title 2-200、type(默认 text)、category?(存 slug)、model?、tags?(逗号字符串，服务端拆 ≤8)、description?≤2000、content 1-100000、coverUrl?、media[]≤12（项 {type:image|video|embed, url, poster?}，URL 仅相对路径或 http/https）
- 处理链（与后台 POST 对齐）：
  1. category 不在 Category.slug 列表 → 回落第一个分类（无分类则"其他"）
  2. media 中 embed 走 normalizeEmbed 重新规整（YouTube/B 站）
  3. content：HTML → sanitizeRich；纯文本 → 按空行切段并加 `[N] 提示词 N` 标记
  4. coverUrl 缺省：内容首图（extractFirstImage，img/markdown/video poster）→ media 首个 image
  5. description 缺省：makeExcerpt(content, 120)
  6. language = detectLang(标题+正文)
  7. status：publish.mode==="review" → pending，否则 published
- published 才 syncPromptToMeili（失败仅 warn 不阻断）；返 `{ id, status }`

### POST /api/prompts/[id]/[kind]
- kind 仅 `like` | `favorite`，需登录，内容须 published
- **切换式**：有记录则删除并 decrement 冗余计数；无则创建并 increment（事务）
- 返当前 active 状态（前端据此更新按钮）

### GET /api/categories（公开）
- 返回分类数组（管理端外使用；发布表单取 slug/name）

### GET /api/comments?promptId=&page=1&pageSize=50
- 只返回 status=published；含 user(id/username/nickname/avatar)；`{ list, total, page, pageSize }`

### POST /api/comments
- 需登录；body `{ promptId, content(≤5000), parentId? }`
- prompt 必须存在；parentId 若提供必须存在且属于同一 prompt
- 事务：建评论 + prompt.commentCount increment；返回评论对象（含 user）

### PATCH /api/comments/[id]（管理员）
- 需 COMMENT_MODERATE；body `{ status: "published"|"hidden" }`；记 AdminLog

### DELETE /api/comments/[id]
- 评论作者本人 **或** 有 COMMENT_MODERATE 权限的管理员
- 软删（status=deleted）+ commentCount decrement；管理员删除记日志

### POST /api/translate
- 限流 20 次/分钟；body `{ text ≤20000, target: zh|en, source?: zh|en }`
- source 缺省自动检测；源==目标 → `{ skipped: true, sourceLang }`
- 成功 `{ translated, sourceLang, cached }`；通道异常 502 `{ error, detail }`
- 走 lib/translate（MyMemory→Google 备用 + TranslationCache）；客户端请用 translateQueue 排队

### POST /api/extract-meta
- 需登录；限流 30 次/分钟
- body `{ warm: true }` → 预热标签词库，返 `{ ok:true }`
- body `{ content, title? }` → `{ tags: string[≤8], description }`（词库命中 + n-gram 词频）

### POST /api/upload（用户媒体，单文件；批量上传也走它）
- 需登录；限流 30 次/分钟/IP（批量并发时按文件计）；受 publish.allowUpload 开关
- FormData `file`；图片限 publish.maxImageMB(10)、视频 maxVideoMB(100)
- 校验/落盘统一在 `src/lib/upload-core.server.ts`（sniffKind magic-byte、UploadError 带状态码、随机文件名存 `public/uploads/YYYY/MM/`），**新上传入口复用该模块，不要复制校验代码**
- 返 `{ url, type: "image"|"video", size }`；任何异常都有 JSON 兜底
- **批量上传约定：不设批量接口**——前端 UniversalUploader 多选后以 3 路并发逐文件调本接口（避免单请求体积超过 Nginx client_max_body_size，且单文件失败可单独重试）。新批量场景沿用此模式
- 文件经 Nginx `/uploads/` alias 提供 HTTP 访问（见部署指南第 10 节）

### POST /api/user/avatar/upload
- 需登录；5MB；magic-byte 仅图片；sharp 裁切 256×256 webp 存 `public/uploads/avatars/`
- 同步更新 user.avatar；返 `{ url, type:"image", size }`；整体 try/catch 返回 JSON
- sharp 未在 package.json 显式声明（Next.js 附带），独立脚本环境需自行安装

---

## 三、后台接口（路径前缀 /api/admin，均需 admin）

> 响应 403 文案：未登录/非管理员 `forbidden`；权限不足 `no permission`。
> 写操作记 AdminLog 的有：settings/site、roles、prompts/batch、评论审核等；部分早期接口（users PATCH、categories 写）未接日志，新增同类功能时应补日志。

### 提示词
- `GET /api/admin/prompts?page=&q=&status=&category=`：30/页；orderBy status asc, id desc；include user；额外返 `counts`（各状态数量 map）
- `POST /api/admin/prompts`：zod 类似用户投稿但 tags 为数组、可直接指定 status(published/pending/draft)/featured/hot；userId=管理员；published 时写 publishedAt 并同步 Meili
- `GET /api/admin/prompts/[id]`：完整 prompt + user
- `PATCH /api/admin/prompts/[id]`：所有字段可选；含 media 数组（≤12）；自动维护封面/简介/语言；**首次置 published 时写 publishedAt**；published 同步索引、其他状态删索引
- `DELETE /api/admin/prompts/[id]`：删库（删失败静默）+ 删 Meili 文档
- `POST /api/admin/prompts/batch`：需 PROMPT_BATCH；body `{ ids: 1-500 个正整数, action: feature|unfeature|hot|unhot|publish|unpublish|delete }`；publish 批量补 publishedAt 并同步索引；返 `{ ok, affected, action }`

### 分类
- `GET /api/admin/categories`：分类 + `promptCount`
- `POST`：`{ name, nameEn? }` → slug=name 原文（中文即 slug），sort 取 max+1，重名 409，成功 invalidate 缓存
- `PUT`：`{ ids: number[] }` 按数组顺序重排 sort（事务）
- `PATCH /api/admin/categories/[id]`、`DELETE /api/admin/categories/[id]`：改名/删除（删除前注意历史 Prompt.category 字符串不会级联改）

### 用户
- `GET /api/admin/users?page=&q=`：30/页；q 模糊匹配 username/email；include 发布数 `_count.prompts`；**剔除 passwordHash**
- `PATCH /api/admin/users/[id]`：body 仅接受 `{ role?: user|admin, status?: active|banned, membershipLevel?≤20, membershipDays?: 0-3650|null }`
  - 不能改自己（400）；membershipDays 给数字 = 今天起 N 天；null/0 = 取消会员并回落 free

### 角色
- `GET /api/admin/roles`：角色 + permissions + userCount
- `POST`：`{ name≤50, description?≤200, permissions: string[] }`；权限值白名单（`*` 或 ALL_PERMISSIONS）过滤去重；重名 400；记日志
- `PUT /api/admin/roles/[id]`：更新；`DELETE /api/admin/roles/[id]`：删除（注意外键：被用户引用的角色删除会被 PG 拒绝，需先解绑用户）

### 日志
- `GET /api/admin/logs?page=&pageSize=≤100&userId=&action=&targetType=`：需 LOG_READ；include user

### 设置
- `GET /api/admin/settings`：返 getSettings() 全量四段（含 site）。`PUT`：body `{ section: "basic"|"publish"|"membership", value }` → saveSetting(section, value)，返 `{ ok:true }`。**注意：此路由只校验 requireAdmin，未挂 requirePerm**（site 路由才挂 SETTING_READ/WRITE）——新增设置段时决定是否补权限点
- `GET /api/admin/settings/site`：site 键合并默认值
- `PUT /api/admin/settings/site`：zod 9 字段（siteName/siteNameEn/siteDescription/searchKeywords/footerText/allowRegister/logoIcon/favicon/appIcon），与现值合并后 saveSetting("site")（清缓存即时生效），记日志
- `POST /api/admin/settings/upload`：FormData `file` + `filename`（白名单三选一：logo-icon-120.png / favicon.ico / app-icon.png）；2MB；magic-byte；写入 `public/site-assets/`；返 `{ ok, url:"/site-assets/<name>?v=ts", filename }`；写失败返 500 含中文 chown 提示。**文件必须经 `/site-assets/[...path]` 动态路由读取**（Next.js 不服务 build 后新增的 public 根级文件，见 05 册第 59 条）；前端上传成功后会先加载图片探测可达性再自动保存设置

---

## 四、写新接口的硬性模板

1. `export const dynamic = "force-dynamic";`（需要 Node API 时加 `export const runtime = "nodejs";`）
2. 鉴权 → 限流（公开写操作必须）→ `req.json().catch(()=>null)` / `req.formData().catch(()=>null)` → zod safeParse
3. 业务校验，错误码语义：400 参数 / 401 未登录 / 403 关闭或无权 / 404 不存在 / 409 冲突 / 413 过大 / 429 限流 / 502 上游失败
4. 多表一致性写用 `db.$transaction`；冗余计数在事务内 increment/decrement
5. 涉及提示词发布态变更：同步 Meili（try/catch，不阻断主流程）
6. 后台写操作落 logAdminAction
7. 整体 try/catch 兜底返回 JSON（参照 admin/settings/upload/route.ts）
8. 前端 fetch 容错：先 text 再 JSON.parse（参照 SiteSettingsForm.upload）
