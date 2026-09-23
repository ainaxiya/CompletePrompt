# 01 · 通用任务协议（AI 接手任意需求时强制执行）

> 上级文档：项目根目录 `AGENTS.md`（先读那份再读本册）。
> 本册目标：让任何 AI 面对「加任意功能 / 改任意地方」都按同一套可复现流程精确完成。
> 所有事实截至 2026-09-23，均来自仓库真实代码；与代码冲突时以代码为准并回修文档。

---

## 一、六步工作法（不许跳步）

### 第 1 步：复述与分类（不改任何代码）
用一句话复述需求，并判定类型：
- **A 展示类**：加页面/区块/字段展示（只查不写）
- **B 交互写操作类**：点赞式切换、表单提交、上传、评论
- **C 后台管理类**：CRUD/审核/批量/配置
- **D 数据结构类**：要动 prisma schema
- **E 外部集成类**：第三方 API、采集、AI、支付
- **F 纯重构/修 bug**

一个需求常是组合（如推荐系统 = B+C+D）。去 `04-feature-patterns.md` 找对应原型，按触点矩阵施工。

### 第 2 步：定位（先搜后读，读全链路）
**搜索顺序**（用 Grep/Glob，不要凭记忆猜路径）：
1. 从用户可见文案反查 dict.ts 的 key → 找到使用该 key 的组件/页面
2. 从页面路径反查 `src/app/**/page.tsx` → 看它查了哪些表、渲染了哪些组件
3. 从交互动作反查 fetch URL → 对应 `src/app/api/**/route.ts`
4. 从 API 反查 lib（db/auth/rbac/settings/meili…）与 prisma 模型
5. 全局搜关键字段名/旧文案，确认**所有**需要同步改动的地方（漏改 = bug）

**必须读全的上下文**：目标文件完整内容 + 它 import 的本地模块 + 所有 import 它的地方（Grep 文件名/导出名）。

### 第 3 步：出方案（给触点清单，再动手）
列出：要新建/修改的文件清单、数据层变化（字段/表/索引/设置键）、鉴权方式、入参出参契约、对现有功能的影响面、老数据回填方式。涉及钱/奖励规则/删生产数据/对外发密钥，**先问用户**。

### 第 4 步：最小差异编辑
- 优先 Edit 精确替换小段，不整文件重写
- 一次只改一个关注点，改完立即继续下一个，不留下半成品结构（如 try 没 catch）
- 严格沿用文件现有风格（引号、命名、错误返回格式、class 写法）
- 新增代码必须遵守 `05-gotchas.md` 的每条规则

### 第 5 步：验证（四级）
1. **静态**：GetDiagnostics 全项目 0 错误；Grep 旧标识符确认无残留引用
2. **类型/构建**：本地能 build 就 build（见下"本地验证"）；至少保证 TS 类型通
3. **流程**：手动走主流程 + 四个异常路径：未登录、无权限、参数非法、重复/并发提交
4. **回归**：检查被触点矩阵列出的关联功能（如改了 Prompt 写入，要验证前台列表/详情/搜索/后台四处）

### 第 6 步：收尾
- 需要回填写 scripts/ 脚本；需要同步搜索索引跑 reindex-meili
- 回填 AGENTS.md 第 4/5/6/7/13/17 节与本册相关契约
- 给用户的汇报说清：改了哪些文件、怎么验证、部署额外动作（db push/回填/权限/缓存）

## 二、本地验证手段

- 本地 PG：`npm run db:up`（embedded-postgres）；改 schema 后 `npx prisma db push`
- 起服务：`npm run dev`（3000）。**注意：本机 CompletePrompt 目录可能没有 node_modules**，此时类型检查只能靠 GetDiagnostics；构建验证放到服务器或先 `npm install`
- 生产构建自检命令：`NEXT_TELEMETRY_DISABLED=1 npm run build`
- 无法本地起服务时，至少完成：诊断零错误 + 逐文件复读改动段 + 对照触点矩阵自检

## 三、影响面排查表（改 X 必查 Y）

| 改动点 | 必须回归检查的地方 |
|---|---|
| Prompt 模型字段 | 前台首页/热门/分类/搜索/详情/会员页 6 个列表查询；后台列表/编辑表单；api/prompts 与 api/admin/prompts 两套写入；Meili 文档结构（lib/meili.ts）；详情 generateMetadata |
| Prompt 写入逻辑 | api/prompts/route.ts（用户投稿）与 api/admin/prompts/route.ts + [id]/route.ts（后台）**三处逻辑要对齐**（sanitize、封面提取、简介提取、语言检测、publishedAt、Meili 同步） |
| User 字段 | auth.ts 的 getCurrentUser select 白名单、api/me、api/user/profile、后台 users 列表、会员中心页、JWT 只存 uid 不存字段（改资料不用重签 token） |
| 分类 Category | getCategorySlugs 缓存（变更要 invalidate）、所有 where category（存的是 slug=中文分类名，见陷阱册）、搜索页 Meili filter、PromptCard CAT_CLS、category-meta.ts |
| 站点设置 | settings.ts DEFAULT_SETTINGS + 读取键数组 + saveSetting 联合类型三处；getPublicSite；后台表单 + PUT 路由；读设置一律走 getSettings/getPublicSite |
| 权限点 | permissions.ts 常量 + PERMISSION_GROUPS + 守卫 API + 后台菜单/按钮显隐；超管（adminRoleId 为空）自动全有 |
| 上传 | 上传 API（magic-byte）+ 前端组件 + next.config.ts CSP + public 目录权限 + Nginx body 限制 |
| dict 文案 | zh/en 两段都加同名 key，漏一段会回退显示 key 字符串 |
| 公开 API 响应体 | 所有前端 fetch 调用处（Grep 路径），字段改名要同步 |
| 富文本允许标签 | sanitize.server.ts 白名单 + RichEditor 产出的标签 + 详情渲染样式 |
| 环境变量 | .env.example + 服务器 .env + 仅服务端用的密钥禁止 NEXT_PUBLIC_ 前缀 |

## 四、报错速判（按现象）

| 现象 | 优先怀疑 |
|---|---|
| `Unexpected end of JSON input` | API 抛了未捕获异常返回空体；按陷阱册"所有写接口必 JSON"修，看服务端日志拿真因 |
| 改了代码页面没变 | force-dynamic 缺失被静态化 / 设置 30s 缓存没走 saveSetting / 浏览器缓存（加 ?v=）/ 没 rebuild |
| TS 报新字段不存在 | 没跑 prisma generate（db push 会自动跑；手动 `npx prisma generate`） |
| 本地连不上库 | db:up 没起；DATABASE_URL 指向错误（本地 5432 vs 服务器 35432） |
| 后台 403 | role 不是 admin / status 非 active / 角色权限缺该点 |
| 前台列表少数据 | status≠published；publishedAt 为空（老数据回填）；分类 slug 不匹配 |
| 搜索搜不到/筛选失效 | Meili 未同步（写入时 try/catch 吞了 warn）；字段没进 syncPromptToMeili；跑 reindex-meili.mjs |
| Hydration 报错 | 服务端/客户端首屏文本不一致；客户端语言初始必须 zh（useLocale 已处理，别直接读 cookie 渲染） |
| 上传 413 | Nginx client_max_body_size；前端已有大小预检 |
| 图片/图标不更新 | public 静态缓存；后台上传返回带 ?v=ts，新引用照做 |
| 生产 EACCES 写文件 | public 属主不是 www：`chown -R www:www .../public` |

## 五、需求不明确时的默认决策（可自行决定，不必打扰用户）
- 分页：前台 24、后台 30；页码参数防御用 `Math.max(1, parseInt(x)||1)`
- 状态/类型字段：String + 注释，不用 Prisma enum
- 列表排序：通用功能 createdAt desc；提示词流按现有 featured/likeCount/viewCount 或 publishedAt
- 用户可见文字：能走 dict.ts 就走；纯后台页面可直接中文
- 错误提示：中文；HTTP 状态语义化；不向客户端泄露堆栈/密钥
- 新可调参数：进 SiteSetting，不建表
- 拿不准的：业务数值、奖励规则、付费、删除数据、改后台路径、改技术选型——必须问
