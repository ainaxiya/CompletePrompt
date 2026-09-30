# 05 · 陷阱清单（每条都是真实代码里验证过的坑）

> 写代码前扫一遍，code review 时逐条对照。按"症状/规则"组织。

## Next.js / React 框架级

1. **动态路由参数是 Promise**：`ctx.params`、页面 `params`、`searchParams` 都要 `await`（Next 15）。按同步对象写会拿到 Promise，取值全 undefined。
2. **cookies()/headers() 是 async**：`const store = await cookies()`。
3. **读 cookie 的页面/组件树必须 `export const dynamic = "force-dynamic"`**，否则构建期静态化，登录态永远 null。
4. **Server→Client 只传可序列化数据**：Date 转 ISO 字符串（详情页 serializeComment 是范例），不要传 Prisma 模型实例/类/函数。
5. **客户端语言首屏必须是 zh**：useLocale 挂载后才读 cookie；直接在首屏用 document.cookie 渲染会 hydration mismatch。
6. **`import "server-only"` 的模块（sanitize.server.ts）不能进 client bundle**；富文本在客户端需要的纯函数走 lib/rich.ts。
7. **rbac.ts 只能在服务端 import**（依赖 next/headers）；客户端要权限常量 import `@/lib/permissions`。
8. 项目**没有 middleware.ts**：不要假设存在全局路由守卫；后台页面在 layout/page 里 requireAdmin，API 里各自鉴权，两处都不能省。
9. `<img>` 用原生标签时按项目惯例加 `// eslint-disable-next-line @next/next/no-img-element`（见 CardCover）。
10. Server Actions body 限制在 next.config.ts 配了 4mb；上传大文件走路由 + FormData，不要塞 Server Action。

## 数据 / Prisma / PG

11. **项目无 migration 历史**，只用 `prisma db push`；不要生成 migrations 目录。
12. **改完 schema 不 generate，TS 里新字段不存在**：db push 会顺带 generate；必要时手动 `npx prisma generate`。
13. 生产加字段必须可空或有 default；删字段/改类型/收唯一约束会触发数据丢失警告，禁止盲目 `--accept-data-loss`。
14. 生产发布顺序固定：**push → generate → build → pm2 restart**（见 AGENTS.md 19.5），反了 build 报类型错。
15. 状态/类型一律 `String` + 注释约定，不用 Prisma enum（与全库一致，避免历史数据迁移）。
16. 关系字段双向声明：加外键漏了对端 `Xxx[]` 会 push 失败；自关联必须起关系名（`@relation("名字")`）。
17. **getCurrentUser 是 select 白名单**：给 User 加字段后，不在 auth.ts 白名单里就拿不到（/api/me、页面登录态全都缺）。
18. **Prompt.category 存的是 Category.slug，而 slug 就是中文分类名本身**（slugify 直接返回原名）。所以：筛选 where category 用中文名；Meili filter 同理；改成英文 slug 会导致全库历史数据失配。
19. 列表高频统计用冗余计数（likeCount 等），在事务里增减；实时 count 大表是反例。
20. `media` 是 Json 字段（默认 `"[]"`），读写按 MediaItem[]；数组默认值写法是 `"[]"` 不是 `[]`。
21. 删除被外键引用的 AdminRole/Category/User 会被 PG 拒绝或级联影响；先解绑/迁移再删。
22. 导入/回填数据三要素：status="published"、publishedAt 非空、category 命中 slug，否则前台"消失"。

## 提示词内容管线

23. content 有**两种形态**：旧纯文本（`[N] 标签行` 分段）与新 HTML；判断只用 `isHtmlContent()`，渲染/摘要/翻译/搜索都要兼容两种。
24. 任何用户富文本入库前必须 `sanitizeRich()`；embed 只允许 YouTube/Bilibili；别自己写正则"净化"。
25. 写入侧有**三份重复逻辑**（用户 POST、后台 POST、后台 PATCH）：改封面提取/简介/语言检测/sanitize 规则时三处一起改。
26. 封面自动级联：显式 coverUrl → 内容首图（img/markdown/video poster）→ media 首个 image；改逻辑三处同步。
27. 首次发布时间用 publishedAt（PATCH 里仅在 publishedAt 为空时写）；不要用 updatedAt 当发布时间。
28. 详情页浏览量是**故意不 await** 的异步自增；别"好心"改成阻塞。
29. 未发布内容可见性：作者本人或 admin，否则 notFound（不要只在前端隐藏）。

## 搜索 Meilisearch

30. DB 与 Meili 是**双写**：发布/审核/删除路径各自同步（前台 POST、后台 POST/PATCH/DELETE/batch），且全部 try/catch 吞异常只 warn——**Meili 静默失败时查服务端日志**。
31. Meili 文档字段是裁剪过的（content 15000、description 2000、含 createdAtTs）；新字段要搜索必须进 syncPromptToMeili 并全量 reindex。
32. search 页 hits 是 any[]，字段缺失要兜底（`h.tags || []`、`h.likeCount ?? 0`）。
33. 用户/会员类功能不进 Meili；别为列表展示字段滥用搜索引擎。

## 设置 / 缓存 / 配置

34. 配置只有 SiteSetting 四键（site/basic/publish/membership）+ getSettings 30 秒内存缓存；**写配置必须走 saveSetting**（清缓存），直接 upsert 会导致前台最长 30 秒不更新。
35. 前台公开信息唯一出口 getPublicSite()；历史上后台存 site、前台读 basic 导致设置完全失效，不要再造读取入口。
36. DEFAULT_SETTINGS、getSettings 的键数组、saveSetting 联合类型是**三处联动**，加新段漏一处就不生效。
37. 环境变量密钥只能服务端；加了 NEXT_PUBLIC_ 等于公开。
38. 静态图标/LOGO 有浏览器缓存：后台上传 URL 已带 `?v=时间戳`，新写类似功能照做；favicon 强刷或改名才能破缓存。

## 安全

39. 所有写 API 任何分支必须返回 JSON（含最外层 try/catch）；前端解析先 text 后 JSON.parse——空响应体 = `Unexpected end of JSON input`。
40. 上传不信 Content-Type：magic-byte 判型并与声称大类交叉校验；随机文件名；年月目录；限额设置来自 publish 段。
41. /uploads/* 有独立 CSP（sandbox、default-src 'none'）；新开放上传目录要复制该头。
42. 跳转只认站内相对路径（safeNextPath），拒 `//`、`/\` 开头。
43. bcrypt 输入防超长（登录已限 username 64/password 128）；改认证时保留。
44. 后台写操作落 AdminLog；权限点改动是 permissions.ts 常量 + 分组 + API 守卫三处。
45. 内联 JSON 给 `<script>` 用 safeJsonScript() 转义 `< > & U+2028/2029`，防存储型 XSS。
46. 用户提供的 URL 只能 http/https/站内相对路径（zod refine 已在 prompt/media schema 里，新 schema 照抄）。

## 样式

47. **Tailwind 类名颜色是重映射的**：看到 emerald-* 要想到靛蓝 #6366f1；金色是自定义 royal-*（默认 Tailwind 没这个色，拼 golden/amber 类名不会生效，amber 是 Tailwind 原生色）。
48. 深色背景层级固定：body #0c0d18、头脚 zinc-950、卡片 zinc-900、描边 zinc-800；别随手引入新的黑色值。
49. TextCover 类型色（video 天空蓝/image 玫红/audio 琥珀/text 翠绿）与 PromptCard TYPE_CLS 保持一致，加新内容类型时两处都加。

## 部署 / 运维

50. PM2 以 www 用户跑：public 不可写 → EACCES → 接口 500 空体；部署后 `chown -R www:www public`。
51. Nginx 要配 client_max_body_size，否则视频/大图标上传 413（应用代码再大也没用）。
52. 构建命令 `NEXT_TELEMETRY_DISABLED=1 npm run build`；8G 机不用加内存参数；`NODE_OPTIONS=` 等号后不能有空格。
53. Trae 聊天复制的 URL/密钥可能带 Markdown 反引号，写 .env/终端前检查。
54. 本地与服务器 DATABASE_URL 端口不同（本地 5432 embedded / 服务器 127.0.0.1:35432 Docker），排连接问题先看连的是哪套库。
55. sharp 在本项目未显式列依赖（Next 附带）：独立脚本（如 LOGO 切图）需借用其他项目 node_modules 或自行安装，不要在应用代码里假设它永远可用——头像上传依赖它，换部署环境要验证。

## 静态资源 / 上传服务

59. **Next.js 只服务 build 时已存在于 public/ 的文件，运行时新写入的文件生产环境 404**（dev 模式正常，极易漏测；官方文档明确）。项目已有两套解法：①后台品牌小图标 → 写 `public/site-assets/` + 动态路由 `src/app/site-assets/[...path]/route.ts` 读盘返回；②用户媒体（图片/头像/100MB 视频，`public/uploads/`）→ **Nginx `location ^~ /uploads/` + alias 直接读盘**（配置与安全头原样复制见 docs/server-部署指南.md 第 10 节，含 `^~` 优先级、斜杠配对、413 限制、排障）。新落盘功能按文件大小选方案，不要让 Node 传大文件，也不要新增第四条静态服务路径。
60. 上传成功 ≠ 可访问：前端拿到 URL 后用 `new Image()` 实际加载探测一次再认定成功（SiteSettingsForm.probeImage 是范例），避免"接口 200、图片 404"的假成功。
61. **任何上传 UI 一律复用 `components/UniversalUploader.tsx`（react-dropzone）**，不要再手写 `<input type=file>`+fetch：它已实现单选/批量、拖拽、类型大小前置校验、3 路并发、XHR 进度、单文件重试。批量上传**不要建批量接口**（单请求体积会撞 Nginx client_max_body_size），逐文件并发调 /api/upload 是既定架构。服务端校验逻辑统一在 `lib/upload-core.server.ts`，新入口复用 saveUserMedia，禁止复制 sniffKind。
62. 本地 `npm install` 后若 TS 报 Prisma 类型缺失/过旧（如某 WhereInput 不存在），跑 `npx prisma generate`；服务器同理，发版顺序见 AGENTS.md 19.5。需要从 delegate 反推 where 类型时写 `NonNullable<Parameters<typeof db.xxx.findMany>[0]>["where"]`，不要依赖 Prisma 命名空间导出名。
63. React 事件处理器不要直接绑带可选自定义参数的函数：`onClick={save}` 在 `save(override?: X)` 时会把 MouseEvent 当参数传入导致类型错/逻辑错，写 `onClick={() => save()}`。

## 工作方式

64. 不要整文件重写（容易漂移丢逻辑）；Edit 小范围替换，大 try/catch 一次性闭合，不留中间态。
65. 不要凭印象造 API/字段：本套手册之外的任何事实，先 Grep/Read 核实再写。
66. 完成后回填文档（AGENTS.md 路由表 + 本套手册对应契约），否则下一个 AI 会重踩。

## 九大改造第 1 期：独立管理员体系（2026-06）

67. **`requireAdmin()` 现在返回 `AdminAccount`，不是 User**（src/lib/auth.ts）；`requirePerm()` 返回 `{admin, user(=admin 别名), ok}`。后台代码里的 `admin.id` 是管理员表 PK，**绝不能写进 `Prompt.userId`**（外键指向 User 表，类型上能过、运行时外键炸）。后台发提示词：`const sys = await getSystemUser()`（lib/system-user.ts，role=importer 的 `system` 账号），`userId: sys.id, adminAuthorId: admin.id`。
68. 双 Cookie 互不通用：会员 `token`（JWT `{uid,t:"u"}`，30d）、管理员 `admin_token`（`{aid,t:"a"}`，7d）；前台页面判断"当前会员是不是管理员"要用 `getCurrentAdmin()`，**不存在 user.role==="admin" 了**（旧管理员行已改 role=admin_legacy）。
69. AdminLog 新日志一律 `logAdminAction({ adminId })`（参数从 userId 改名）；日志展示/查询 include `admin`，兼容历史 `user`；日志页是服务端直查 DB（`?q=账号名` 模糊，OR 匹配 admin/user 的 username contains insensitive），不经过 /api/admin/logs（该 API 同步保留）。
70. 账号唯一性是**双表查重**：注册/后台建会员/建管理员都要同时查 User.username 与 AdminAccount.username；email/phone 在 User 表唯一，后台改会员资料时排除自身 ID。
71. 注册字段配置链：SiteSetting 键 `register`（allowRegister + fields.email/nickname/phone = off/optional/required）→ getPublicSite().registerFields → `/api/settings` 公开 → AuthForm 注册模式动态渲染；注册接口用动态 zod shape。allowRegister 优先级 register.allowRegister > site.allowRegister > basic.allowRegister。改设置后 saveSetting 清缓存（30s TTL）。
72. Meili 秒级同步是**独立 PM2 进程**（scripts/meili-sync-daemon.mjs，不是 cron、不是 Next 内逻辑）：间隔读 SiteSetting site.meiliSyncSeconds（0=空转），updatedAt 水位存项目根 `.meili-sync-state.json`（已 gitignore），每 10 分钟全量 ID 对账清硬删除。应用接口的实时 sync 仍是主路径，daemon 是兜底，别二选一删掉其一。
73. rbac.ts `getAdminPermissions` 的 select 必须显式带 `status: true` 才能做禁用判断（Prisma select 白名单不带就没有该字段，TS 直接报错）——同类白名单遗漏是本期构建主要报错来源。

## 九大改造第 2 期：TipTap 编辑器 + 原作品链接 + 按钮美化（2026-06）

74. **TipTap v3 SSR 必须 `useEditor({ immediatelyRender: false })`**，否则 hydration 报错；外部 value 异步回填（后台编辑加载）不能直接 editor.commands.setContent 回灌——用 `lastEmitted` ref 比较，`setContent(html, { emitUpdate: false })`，否则光标跳回开头。Props 契约保持不变（value/onChange/placeholder/minHeight/maxImageMB/maxVideoMB），输出仍是 HTML 字符串，下游 sanitizeRich/isHtmlContent 双形态链路不动。
75. **zod 的 `.refine()` 返回 ZodEffects，不能再链 `.max()`**（构建报 `Property 'max' does not exist on type 'ZodEffects'`）。sourceUrl 要限长就新写 `z.string().max(500).refine(...)` 独立规则，三处 API（api/prompts POST、api/admin/prompts POST/[id] PATCH）各自带一份；`sourceUrlRule.nullable().optional().or(z.literal(""))` 顺序不能反，空串走 literal 分支，PATCH 里再把空串归一化为 null（=清空）。
76. TipTap 工具栏图片/视频上传**仍走 UniversalUploader compact 单文件模式**（禁手写 input file 的规则继续有效），编辑器只接收 `{url,type}` 后 `setImage`/自定义 `setVideo` 命令；video 是自定义块级原子节点 components/editor/TiptapVideo.ts（attrs src/poster/class，parseHTML/renderHTML 走 `<video controls>`）。服务端 sanitize 白名单因此补了 `pre`/`code` 标签与属性，新增允许标签时两处（sanitize.server.ts + 详情渲染）要一起想。
77. ActionButtons 美化只改表现：POST `/api/prompts/{id}/like|favorite` 返回契约（like `{count,active}`、favorite `{active}`）、401 跳 `/login?next=`、props 全部保持；加了 busy 锁防连点，`.btn-pop` 是 key=count 重挂载触发的纯 CSS 动画，别引动画库。
78. 后台列表/仪表盘显示作者：include `adminAuthor` 后有值=管理员发布（显示其 nickname/username+徽章），无值才回退 user（system 账号场景已被 adminAuthor 覆盖，不用特判 username==="system"）。
79. **部署服务器 SSH（2026-09-24 实测）**：root@43.200.16.183 真正被授权的私钥是工作区根目录的 `43.200.16.183_id_ed25519`（注释 root@ip-172-31-46-14），**不是** `.ssh/trae_deploy_ed25519`（服务器会 Permission denied）。该私钥原文件 ACL 过宽，OpenSSH 拒绝加载，已复制到 `.ssh/` 并 `icacls /inheritance:r /remove:g "Authenticated Users" "BUILTIN\Users"` 修好。本机 `C:\Users\ainax\.ssh\config` 含非法指令 `password` 会让任何 ssh 直接退出，调用必须 `-F <工作区\.ssh\empty_config>` 并配 `-o UserKnownHostsFile=<工作区\.ssh\known_hosts>`（沙箱禁止写默认 known_hosts）。
81. **评论鉴权白名单（第 3 期踩点）**：`getCurrentUser()`（auth.ts）是显式 select 白名单，新增 `User.commentBanned` 后必须同步加进 select，否则 POST /api/comments 里 `user.commentBanned` 永远 undefined、禁言形同虚设，且 /api/me 也不下发。任何挂在 User 上、要在接口里读的新标量字段都要过这道 select。
82. **评论计数只认 published**：commentCount 增发生在创建时（创建必为 published）；隐藏 published→hidden 减 1、恢复加 1；删除仅当此前是 published 才减；deleted 不可逆、PATCH 拒绝非法迁移。批量接口逐条事务并逐条写 AdminLog（不用一条日志概括，便于审计到每条评论）。
83. **已删评论占位规则**：无回复的已删评论公众完全不可见；有 published 回复的已删顶级评论仍出现在列表里但 content 置空、`deleted:true`、user:null（GET 的 OR 条件 + 详情页/接口两处序列化都要处理）。hidden 评论则连回复一起对公众隐藏（回复的 where 仅 status=published 且顶级 hidden 不会被查出来）。
84. **触发式验证码是 DB count 判定不是内存桶**：60s/10min 窗口都用 `comment.count({userId, createdAt:{gte}})`，重启不丢、多页签一致；内存 Map 只存验证码答案本身（captcha.ts）。验证码一次性，前端答错后服务端已消费，必须重新 GET /api/captcha 换新题。
85. **后台导航是静态数组+splice**：在用户管理后插入「评论管理」后，超级管理员「管理员设置」的 splice 位置从 5 改成 6，否则菜单顺序错位。
86. **公开评论接口必须显式投影**（第 3 期上线当日踩中已修）：Comment 表的 `ip`/`ua` 是后台审核取证字段，而 Prisma findMany 不带 select 时返回全部标量字段——GET /api/comments 最初直接 `{...c}` 把 ip/ua 下发给了游客。修法：公开接口统一过 `presentComment()` 白名单视图（POST 返回同样要过），只有后台 /api/admin/comments 保留完整字段。教训：给模型加"管理用"字段后，逐个检查面向公众的序列化点。
87. **服务器非 git 部署**：打包 `tar czf`（排除 node_modules/.next/.env*/public/uploads/*.log/.meili-sync-state.json）→ scp 到 /root → 服务器先 `docker exec -i <PG容器> pg_dump | gzip` 备份库 + tar 备份旧代码 → 删 src/prisma/scripts 后解包（scripts 本地是超集可整体替换；public/uploads 4.2GB/约 7 万文件绝不能动，public 其余静态文件合并即可）→ `npm install` → `npx prisma db push --accept-data-loss`（唯一警告是 phone 唯一约束，NULL 多行不冲突）→ `node scripts/migrate-admins.mjs`（旧管理员同 id/密码哈希平移，用户名密码不变）→ build → `pm2 restart CompletePrompt --update-env` → `pm2 start scripts/meili-sync-daemon.mjs --name CompletePrompt-MeiliSync` → `pm2 save`。dotenv 已从幻影依赖提升为显式 dependency（守护脚本 import "dotenv/config"）。备份落在 /root/db-pre-p1p2-*.sql.gz 与 /root/code-pre-p1p2-*.tar.gz。第 3 期（2026-09-24）无新依赖、无 migrate 脚本，跳过 npm install/migrate-admins，db push 无警告直接同步（CommentLike 新表+3 个可空列），备份为 /root/db-pre-p3-*.sql.gz、/root/code-pre-p3-*.tar.gz；MeiliSync 进程无需重启。
88. **手机导航两套不能同屏**：第 4 期起 SiteHeader 的 `<nav>` 是 `hidden md:flex`、MobileTabBar 是 `md:hidden`，分界必须都卡在 `md`（768）。改断点时两处一起改，否则中间宽度会双导航或无导航。Tab 栏 z-30 刻意低于 header/弹窗 z-50，别调高。main `pb-24` 与 footer `pb-16` 是给 52px Tab+安全区的占位，删了末行内容会被永久挡住。
89. **flex 行内按钮被压竖排**：分节 chips（flex-wrap 占满行）旁的 CopyButton 在 360px 下被 flex-shrink 挤到两个字竖排。凡是"自适应内容区 + 固定文案按钮"同行，按钮一律 `shrink-0 whitespace-nowrap`，内容区 `min-w-0`。
90. **Playwright 全页截图的 fixed 伪影**：`screenshot({fullPage:true})` 会把 `position:fixed` 的底栏拼在截图中段（看起来像 Tab 栏飘到列表中间），不是布局 bug；验证 fixed 元素位置用视口截图（非 fullPage）+ `getBoundingClientRect()`。
91. **本地无库时的验收姿势**：本机没有 Docker/PG（.env 指向 127.0.0.1:35432），用 `ssh -N -L 35432:127.0.0.1:35432` 隧道连生产库后 `npm start` 跑生产构建，只做 GET/浏览验收，不点任何写操作。视口模拟本机用临时目录装 playwright-core 走 `channel:'msedge'`（系统自带 Edge），不要把 playwright 加进项目依赖。
92. **第 4 期是纯样式期**：无 schema、无依赖、无 API 契约变化；部署只 scp 改动文件 → build → restart CompletePrompt，不 db push、不动 MeiliSync。响应式改动原则：已有响应式类的只实测不预防性改，避免把桌面布局改回归（验收必须保留 1280 档对照）。
93. **前台禁止出现任何后台入口**（2026-09-27 用户明确要求）：会员与管理员是两套完全独立的用户体系（User vs AdminAccount、两个 Cookie、两个登录页），前台 `(site)` 下任何页面不得渲染指向 `ADMIN_BASE` 的链接/徽章，即使同一浏览器同时持有管理员 Cookie。member 页曾因 `getCurrentAdmin()` 显示「后台管理」按钮（点过去凭现成管理员 Cookie 直接进后台）已删除。规则：前台组件不许 import `ADMIN_BASE` 做可见入口；唯一允许的管理员态出现在详情页 `canSee`（不可见的未发布内容预览权限，后台 PromptManager/CommentManager 的「新窗口查看」依赖它）和 LogoutButton（仅 `admin` prop 时跳后台登录页，前台不传该 prop）。
94. **sharp 构造选项版本坑**（v0.4 build 失败记录）：项目装的 sharp 用旧式选项 `sharp(buf, { failOn: "none" })`，写 `{ fail: "none" }` 会 TS 报错 "fail does not exist in type SharpOptions"。照抄 `scripts/liblib-import-media.mjs` 即可。
95. **Next API 路由内跑长任务**：采集入库（每作品要拉详情+下载十余张图，分钟级）不能阻塞 HTTP。模式：接口只建 `CrawlJob` 行后 `void runCrawlJob(jobId)` 立即返回 jobId，进度全部落库，前端 1.5s 轮询；PM2 常驻 Node 保证事件循环任务不丢，进程被杀导致的 running 僵尸任务用「>45 分钟视为超时」在下次发任务时回收。单任务上限 100 条、全局同时只许一个 running。
96. **采集内容的分节/媒体对齐**：自建作品没有人工 txt 分节，直接从 snapshotData 媒体节点生成 `[N] 图片生成｜｜<节点名>` 正文，`media[].section` 必须写同一个 1 基序号（详情页按 section 分组渲染节点图）；作品类型取节点类型多数，分类映射 视频创作/图片创作/音频创作（分类表里没有"AI创作"，seed_packs 的老回填已被后续迁移覆盖）。
97. **ffmpeg 已上线（v0.4 当日补装）**：Ubuntu 26.04 `apt-get install -y ffmpeg`（8.0.1，/usr/bin/ffmpeg）。crawl-worker 截帧要点：① ffmpeg 直读远程 mp4 必须带 `-referer https://www.liblib.tv/ -user_agent <UA>`（CDN 防盗链），用专用选项而不是 `-headers`（经 execFile argv 传值时 CRLF/逗号转义极易踩坑，曾报 "Unable to choose an output format"）；② `-vf scale=min(1280\,iw):-2` 在 execFile 参数数组里反斜杠转义保留；③ 三个时间点 1s/3s/0.5s 截图取灰度平均亮度最高帧（≥22 提前停），规避片头黑场；④ 二进制路径用 `process.env.FFMPEG_PATH || "ffmpeg"`，不要写死 Windows 路径；⑤ PM2 CompletePrompt 以 www 运行，/usr/bin 在其 PATH 中，输出目录 www 可写。
98. **采集去重靠 source+remoteId 唯一键**，不靠标题；已采集作品远端 updateAt 变新只在 fetch 结果里计数提示，v0.4 不覆盖本地内容（保护人工编辑），重新采集会因 promptId 唯一关联 + status=collected 被跳过。
99. **未公开画布作品在 fetch 阶段剔除（v0.4 补丁）**：LIBTV 部分作品（短片/获奖作）只发布成片 mp4+封面，`snapshotData.nodes` 为空，入库阶段必报"作品快照中没有可采集的节点"且重试永不成功。处理：fetch 拉 feed 后并发 5 调 detail 探测（`filterCollectableItems`，间隔 150ms 防 429），空画布/已删除(10051)/私有作品不进待采集列表；已存在于列表的 new/failed 空条目同步 `deleteMany` 清除（collected 保留，说明历史上可采过）；detail 探测临时失败的保守保留，下次 fetch 再判。因此一次 fetch 耗时与作品数相关（60 条约 20-40s），自托管无函数超时问题。
100. **采集进度只展示最后一条失败**：`CrawlJob.lastError`（Text，可空）由 worker 在每条失败时覆写为 `《标题》：原因`，前端进度卡片红字单行显示；各条目的完整原因仍在 `CrawlItem.error` 和「采集失败」Tab。新任务建 job 时该字段为 null。
