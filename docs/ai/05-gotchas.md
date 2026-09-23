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

## 工作方式

61. 不要整文件重写（容易漂移丢逻辑）；Edit 小范围替换，大 try/catch 一次性闭合，不留中间态。
62. 不要凭印象造 API/字段：本套手册之外的任何事实，先 Grep/Read 核实再写。
63. 完成后回填文档（AGENTS.md 路由表 + 本套手册对应契约），否则下一个 AI 会重踩。
