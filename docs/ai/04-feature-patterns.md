# 04 · 功能原型矩阵（任意需求对号入座，照此施工）

> 用法：拿到需求先判定属于下面哪个原型（可多个组合），每个原型给出**必改触点清单**与**注意事项**。
> 所有路径相对 `src/`；数据层规则见 AGENTS.md 第 19 节，接口风格见 02 册，组件契约见 03 册。

---

## P1 · 给提示词加一个新字段（如：来源评分、难度、价格）

1. `prisma/schema.prisma` Prompt 加字段（展示用可空或 default；需要筛选/排序就配 `@@index`）
2. `npx prisma db push`
3. **写入侧三处对齐**：
   - `app/api/prompts/route.ts`（用户投稿 createSchema + create data）
   - `app/api/admin/prompts/route.ts`（后台 POST）
   - `app/api/admin/prompts/[id]/route.ts`（PATCH schema 与 data 透传）
4. `components/admin/PromptForm.tsx`：表单 state、控件、提交 body；编辑回填
5. 需要让用户投稿也能填：`app/(site)/publish/page.tsx` 内的发布客户端组件 + zod
6. 展示侧按需求选：PromptCard 的 p 类型与各列表 select（首页/热门/分类/收藏/相关推荐）、详情页、generateMetadata
7. 需要被搜索/筛选：lib/meili.ts 的 syncPromptToMeili 加字段 + Meili filterableAttributes 设置 + 跑 `node scripts/reindex-meili.mjs` + search/page.tsx
8. 老数据：需要默认值就写 scripts 回填脚本
9. 文案：dict.ts zh/en

## P2 · 加一种用户互动（如：评分、举报、"用过"打卡）—— 点赞收藏模式

1. schema：新建交互表（复合主键 `@@id([userId, targetId])` 防重复）或带唯一约束；主表加冗余计数 `xxxCount Int @default(0)` + `@@index`
2. 切换/提交 API：仿 `app/api/prompts/[id]/[kind]/route.ts`，事务内改关联表 + increment/decrement 计数
3. 按钮组件：仿 Buttons.tsx 的 ActionButtons（initial 状态由 Server Component 查库传入，乐观更新，失败回滚）
4. 详情页：查当前用户是否已互动，把初值传给按钮；列表页一般只显示计数
5. 防刷：登录门槛；必要时加 rateLimit
6. 统计：member 页 aggregate；后台需要看就加管理列表 + 权限点

## P3 · 加一类全新内容（如新表"教程/作品合集"）—— 完整垂直模块

1. schema 新模型（状态/时间/计数/索引照 Prompt 抄）；db push
2. 公开 API（列表 GET + 详情直接 Server Component 查库）+ 用户写操作 API（按 02 册模板）
3. `(site)/` 下页面：列表页 + `[id]` 详情页（generateMetadata + 未发布权限 + 浏览量）
4. 卡片组件（可仿 PromptCard + CardCover/TextCover 降级链）
5. 需要搜索：Meili 新建独立 index（不要混进 prompts 索引），lib/ 下仿 meili.ts 写一个模块
6. 后台：列表/编辑/批量四件套（页面 + admin 组件 + API + 权限点 + NAV + 日志），批量照 prompts/batch
7. sitemap.ts 补条目；robots 规则按需

## P4 · 加后台管理功能（任意实体的 CRUD/审核/配置）

1. 权限点：permissions.ts 常量 + PERMISSION_GROUPS（两处）
2. API：`app/api/admin/<entity>/route.ts`（GET 列表 30/页 + POST 新建）、`[id]/route.ts`（GET/PATCH/DELETE）；批量则加 `/batch`
3. 页面：`(admin)/guanli-7k2m9x/<entity>/page.tsx`（requireAdmin + 读初值 + redirect 登录）
4. 组件：`components/admin/<Entity>Manager.tsx`（`"use client"`，fetch 容错、router.refresh）
5. 菜单：admin layout.tsx NAV 加项（基于 ADMIN_BASE）
6. 写操作全部 logAdminAction；删除优先软删（仿评论 status=deleted），物理删需谨慎外键
7. 表单校验前后端都做；后端 zod 是最终边界

## P5 · 加一项可调站点配置（开关/数值/文案规则）

1. lib/settings.ts：DEFAULT_SETTINGS 加键段；getSettings 读取数组 `"site"|"basic"|"publish"|"membership"` 与 saveSetting 联合类型**同步加新键**
2. 消费侧：服务端读 getSettings()；前台公开信息走 getPublicSite()（如需暴露到浏览器，把字段加进其返回 + `/api/settings` GET）
3. 后台：`settings/<key>/page.tsx` + 表单组件（仿 SiteSettingsForm 或 SettingsForms）；PUT 路由仿 site（合并旧值 + saveSetting + 日志）
4. 设置页若挂在现有"基本/发布/会员"表单里，改 SettingsForms.tsx 对应 Form
5. 不建表、不加环境变量（环境变量只用于部署级密钥/地址）

## P6 · 改注册/登录链路（加邀请码、加字段、加验证码、第三方登录）

- 注册字段：AuthForm 表单 + register/route.ts 的 zod + user.create data 三处
- 注册后副作用（发奖/绑定关系）：包进 `db.$transaction`，邀请码等外部输入无效要**静默不阻断注册**
- 登录态新字段：auth.ts getCurrentUser select 白名单同步加；JWT 只存 uid 不用重签
- 注册开关：始终保留 getPublicSite().allowRegister 判定与限流
- 开放重定向：登录后跳 next 必须用 safeNextPath 同款规则
- 验证码/第三方：密钥只在服务端；新增外部请求加超时（AbortSignal.timeout）与失败兜底 JSON

## P7 · 加一个上传/附件类型或改上传规则

- 服务端：对应上传 API 的 magic-byte 签名（sniffKind 模式）+ MIME 白名单 + 大小限额（限额来自 publish 设置）
- 前端：上传组件 accept + 大小预检 + 错误文案
- 存储：随机文件名 + 年月目录；头像类需压缩就用 sharp（参照 avatar/upload）
- 安全头：新目录若在 /uploads 外，要在 next.config.ts 复制 CSP/nosniff/immutable 规则
- 部署：Nginx client_max_body_size；public 属主 www

## P8 · 加搜索维度/排序（类型/标签/新筛选项）

1. 数据要在 Meili 文档里：lib/meili.ts syncPromptToMeili 加字段（content 截 15000、description 截 2000 的既有约束）
2. Meili 端 filterable/sortable attributes 配置（部署/脚本里设置；sort 数值字段如 createdAtTs）
3. searchPrompts 的 opts 加参数并拼 filter/sort 字符串
4. search/page.tsx：searchParams 类型、qs() 链接构造、筛选 UI（链接式，不引表单状态库）、hits 映射给 PromptCard
5. 全量重建：scripts/reindex-meili.mjs
6. DB 列表页也要同样筛选项时，另改对应 Server Component 的 where（两边逻辑保持一致）

## P9 · 加前台公开页面（信息页/榜单/聚合页）

1. `(site)/新路由/page.tsx`，force-dynamic 按需；纯静态可不加
2. 查库直接在 Server Component；用既有卡片/徽章/网格 class
3. 标题 metadata；需要 SEO 收录加进 sitemap.ts
4. 入口：SiteHeader 导航（dict key）或页脚 `(site)/layout.tsx`
5. 分页用链接 query string（仿 search 页），不做客户端状态路由

## P10 · 加通知/消息/流水类系统（单向增长记录）

- 新表：userId + type + 关联 id + 内容快照 + readAt? + createdAt，索引 `[userId, createdAt desc]`
- 触发点在既有写操作事务内创建（如评论回复→给被回复者建通知）
- 未读数：高频展示加冗余计数或单独聚合接口；列表页分页查
- UI：UserMenu 红点（轮询 /api/me 扩展或独立 /api/notifications）；通知中心页仿 member
- 后台需要监管：P4 流程；只增不删类参考 AdminLog 设计

## P11 · 接第三方服务（AI/支付/短信/对象存储）

1. 密钥：服务端 `.env`（无 NEXT_PUBLIC 前缀）+ .env.example 占位 + AGENTS.md 第 12 节登记
2. 统一在 `app/api/<域>/route.ts` 做代理，前端绝不直连密钥；外部 fetch 必须超时 + try/catch + 降级 JSON
3. 结果落库/缓存（参考 TranslationCache 模式）；耗时操作用队列（参考 translateQueue）
4. 花钱/发奖励类操作必须幂等：唯一约束（事件 id 复合唯一）防重复入账
5. AI 功能：自动标签可复用 extractTags/extract-meta；富文本产物入库前照样过 sanitizeRich

## P12 · 定时任务/批量处理/数据修复

- 一律放 `scripts/*.mjs`（顶部 `import { PrismaClient } from "@prisma/client"`），手动/宝塔计划任务执行，不做 Next 内常驻进程
- 大批量分页处理（take/skip 或 id 游标），每批 await，日志打印进度
- 改完库记得影响搜索/缓存：需要时 reindex-meili；设置缓存只在应用内有效，脚本无需关心
- package.json 可加 script 别名

## P13 · 采集入库（liblib 及未来站点）

- 现状：scripts/liblib-*.mjs 一套（枚举 feed→抓节点→下载媒体→映射→校验→修帧）
- 入库铁律：status=published、publishedAt 必填（空则回填 createdAt）、category 必须命中 Category.slug（中文 slug）、media 符合 MediaItem 形状、sourceSite/sourceAuthor/sourceUrl 填溯源
- 入库后跑 reindex-meili.mjs；正文为纯文本时用 `[N] 提示词 N` 分段格式，或直接存 sanitize 后的 HTML
- 未来 Crawlee 化：`crawler/connectors/<站点>/` + `core/pipeline.ts` 统一走同一入库管道（路线图，动工前与用户确认）

## P14 · 改 UI/样式/主题

- 颜色/全局令牌只改 globals.css @theme；注意类名重映射（emerald=靛蓝、royal=金）
- 复用既有类（brand-card、stat 卡、徽章配色），保持圆角/描边/间距体系一致
- 深色优先，全站 color-scheme dark；不要引入白底组件库
- 中英双语：硬编码中文仅限纯后台；前台文字走 dict

## P15 · 加多语言文案/新语言

- dict.ts DICT 现有 zh/en 两段，key 用点分命名域（nav./search./member./btn. 等）
- Locale 类型是 `"zh"|"en"` 联合；加新语言要改 Locale 类型、i18n.ts 判定、LanguageSwitcher、翻译 provider 语言映射、所有 t 调用兜底
- 插值统一 `{name}` 占位；新增 key 两段都加，否则界面直接显示 key

## 组合型需求拆解示例

- "会员可见高清内容"：P1（加字段/等级门槛）+ 投稿写入 + 详情页权限判断（仿未发布可见性规则）+ P5（门槛配置）+ 媒体访问控制（/uploads CSP 现状是公开的，需另议鉴权方案，先问用户）
- "积分商城"：P10/P2（流水与账户）+ P3（商品实体）+ P11（兑换幂等）+ P4（后台）——涉及支出，规则先确认

## 每个原型共用的收尾检查

- [ ] GetDiagnostics 0 错误；Grep 无旧引用残留
- [ ] 六个提示词列表入口的数据字段一致性（凡涉及 Prompt 展示）
- [ ] DB/Meili/设置缓存三处一致性
- [ ] 未登录/无权限/非法参数/重复提交四条异常路径
- [ ] 回填脚本 + 部署动作（db push 顺序见 AGENTS.md 19.5）
- [ ] 更新 AGENTS.md 与本套手册
