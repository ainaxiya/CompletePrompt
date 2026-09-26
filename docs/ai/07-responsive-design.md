# 第 4 期：全站响应式适配设计

> 日期：2026-09-24
> 状态：✅ 2026-09-24 已上线（本地四档验收 + 线上 360/768 复验通过；服务器备份 /root/code-pre-p4-20260924-211832.tar.gz）
> 范围：前台精适配 + 后台保底；目标 360–430px 手机与 768px 平板；桌面零回归
> 方案：方案 A —— 补丁式断点修补 + 唯一新增组件 `MobileTabBar`，纯样式/布局，不动 API/数据/业务逻辑

## 1. 背景与现状审计

第 1–3 期完成后，全站并非"纯桌面写法"，已有约 70% 响应式底子：

- 全局：viewport 正常（Next 默认），前台主容器 `max-w-6xl px-4`；根布局仅文档壳，前台/后台路由组各自布局
- 顶栏 `SiteHeader.tsx`：移动端导航图标化（文字 `hidden md:inline`）、站名 `hidden sm:inline`、搜索栏手机折叠展开
- 列表网格：首页/热门/搜索/分类详情均 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`；分类总览 `lg:grid-cols-4`
- 详情页：主网格 `lg:grid-cols-[1fr_280px]`，手机自动堆叠；富文本图片/视频/iframe 已 `max-width:100%`、`pre` 横滑、`word-break`
- 后台：侧边栏手机变顶部横滑导航；5 张宽表（提示词 1100/日志 900/用户 860/评论 820/管理员 760）均已包 `overflow-x-auto`；内容容器 `min-w-0`；弹窗均 `w-full + p-4 遮罩`
- 表单/登录/发布/资料：`max-w-sm/2xl w-full` 流式容器

实测前发现的可疑点（待验收阶段逐页证实，不预防性修改）：

1. 360px 超小屏顶栏拥挤：logo + 4 个图标导航 + 搜索 + 语言 + 头像
2. 会员中心三宫格统计、少量固定 `grid-cols-2/3` 表单在窄屏偏挤
3. 后台筛选输入框 `min-w-[220px]` 偏宽；弹窗 `p-6` 在窄屏浪费空间
4. 评论区验证码行、操作按钮组换行/触控尺寸未验证
5. 无系统逐页手机实测，可能存在零星横向溢出

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 适配范围 | **前台精适配，后台保底**（不撑破、关键操作可完成，不卡片化） |
| 目标设备 | 主流手机 360–430px + 平板 768px；不专门保 320px |
| 手机导航 | **底部 Tab 栏**（App 式），顶栏手机端移除导航组 |
| Tab 发布键 | **不做**凸起发布按钮；Tab 仅 4 个：首页/热门/分类/我的。发布入口保留在会员中心按钮、空状态链接 |
| 实施方案 | 方案 A：补丁式 + 新增 MobileTabBar |
| 验收交付 | 三档视口模拟逐页验收，本地 build 通过后直接部署并线上复验 |

## 3. 断点策略与全局规则

沿用 Tailwind 默认断点，不自定义：

- 基础样式 = 手机（360–430px）
- `sm` ≥640px：大手机/小平板
- `md` ≥768px：**底部 Tab 栏在此消失，恢复现有顶部文字导航**
- `lg` ≥1024px：多列布局/详情侧栏/后台侧边栏（不动）

硬性规则：

1. **零页面级横向溢出**（360px）。允许的内部横滑仅限：后台宽表卡片内、富文本代码块
2. **触控目标**：Tab 整格 ≥48px 高；主 CTA/头部按钮 ≥38–40px
3. **安全区**：Tab 栏 `padding-bottom: env(safe-area-inset-bottom)`；前台 main 手机端底部留白防遮挡
4. 不缩放排版比例，只处理换行与堆叠
5. z-index：Tab 栏 `z-30`（低于 header `z-50`、弹窗遮罩 `z-50`，弹窗打开时自然被盖）
6. 本期纯样式/布局，不动任何 API、Prisma、状态管理与业务逻辑

## 4. 底部 Tab 栏规格

新组件 `src/components/MobileTabBar.tsx`（client component）：

- 挂载于 `src/app/(site)/layout.tsx`，后台不渲染
- `md:hidden fixed inset-x-0 bottom-0 z-30`，高度约 56px + `env(safe-area-inset-bottom)`
- 背景与顶栏呼应：`bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/70`
- 4 个等宽标签，每格 `flex flex-col items-center justify-center gap-0.5`，触控高 ≥48px：

| Tab | 图标（复用 SiteHeader 同款 SVG 风格） | 路由 | 激活 |
|---|---|---|---|
| 首页 | home | `/` | exact |
| 热门 | flame | `/hot` | startsWith |
| 分类 | grid | `/categories` | startsWith |
| 我的 | 用户人形 | `/member` | startsWith |

- label 10–11px；激活态 emerald-300，默认 zinc-400；图标 20–22px
- 「我的」未登录也跳 `/member`（现有 /member 自身处理未登录跳转登录，与 UserMenu 路径行为一致）
- 不做：角标、凸起按钮、发布二次确认、横屏特殊处理

## 5. 前台改造清单

### 5.1 结构性

1. **新增 `MobileTabBar.tsx`**（见第 4 节）
2. **`SiteHeader.tsx`**：`<nav>` 导航组（首页/热门/分类/发布图标）加 `hidden md:flex`（手机端整块移除，功能由 Tab 栏承接）；顶栏手机端间距收紧（行 `gap-2`，logo 区 `mr-1` 保持）；搜索/语言/头像保留
   - 注意：发布入口手机端从顶栏消失，由会员中心与空状态承接（已存在），无需新增
3. **`(site)/layout.tsx`**：
   - `<main>` 由 `py-8` 改为 `pt-8 pb-24 md:pb-8`
   - 页脚外层容器加 `pb-20 md:pb-0`，版权条不被 Tab 遮
   - 渲染 `<MobileTabBar />`

### 5.2 页面级（只动类名）

| 文件 | 改动 |
|---|---|
| `(site)/page.tsx` 首页 | Hero `px-6 py-10` → `px-5 py-8 sm:px-6 sm:py-10`；网格不动 |
| `(site)/p/[id]/page.tsx` 详情 | 正文/分节卡片 `p-4` → `p-3 sm:p-4`；其余已 wrap/堆叠，仅实测 |
| `components/CommentSection.tsx` | 回复/点赞操作行允许换行（`flex-wrap`）；验证码行 360px 实测微调 gap；回复缩进手机减小；发帖/回复提交按钮 min-h ≥40px |
| `(site)/member/page.tsx` | 账号卡操作按钮补 `w-full sm:w-auto`（窄屏整行易点）；三宫格 <380px padding/字号收紧（保留 3 列）；其余仅实测 |
| `(site)/publish/page.tsx` + `PromptForm.tsx` | 双 select `grid-cols-2` 保留；仅实测（TipTap 工具栏已是 flex-wrap） |
| `AuthForm.tsx`/登录/注册/资料 | 天然流式，仅实测 |
| 搜索/热门/分类/分类详情 | 网格、排序行、分页条已响应式，仅实测 |
| `MediaUploader.tsx`/`CoverUploader.tsx` | URL 输入 `min-w-[200px]` 实测，若撑破改 `min-w-[160px] sm:min-w-[200px]` 或 min-w-0 |

原则：**已有响应式类的只实测不预防性改动**；只改实测确认的问题，最小化回归面。

## 6. 后台保底标准

不做形态改造（不卡片化表格、不做抽屉）。硬标准：360px 下无页面级横向滚动条；筛选能输入、下拉能点开、弹窗能提交、表格可横滑看到全部列。

1. 宽表：保持 `overflow-x-auto`；实测确认无外层固定宽度造成页面级第二滚动条（内容区 `min-w-0` 已具备）
2. 筛选栏（PromptManager/UserManager/CommentManager）：`min-w-[220px]` → `min-w-[160px] sm:min-w-[220px]`；按钮触控高补齐约 38px
3. 弹窗（UserManager/AdminManager/RoleManager）：手机端内边距 `p-6 → p-4 sm:p-6`；内部固定 `grid-cols-2` 在 <380px 改单列（`grid-cols-1 xs/sm:grid-cols-2`，无 xs 断点则用 `grid-cols-2` 实测，必要时改 `min-[380px]:grid-cols-2`）
4. 后台导航：保持手机顶部横滑，不改；登录页仅实测
5. 仪表盘 6 格统计已响应式，仅实测

## 7. 验收矩阵

本地 `npm run dev` + 浏览器设备模拟，四档视口：

- **360×740**：安卓小屏，最严
- **390×844**：iPhone 主流档（验证安全区）
- **768×1024**：平板竖屏，Tab 消失分界
- **1280 宽**：桌面回归档，须与线上现状视觉一致

| 区域 | 页面/组件 | 360 | 390 | 768 | 1280 |
|---|---|---|---|---|---|
| 全局 | 顶栏（无导航组）/Tab 栏/安全区/无页面横滚 | ● | ● | ● | ● |
| 前台 | 首页 | ● | ● | ● | ● |
| | 热门+分页 | ● | ● | ○ | ○ |
| | 分类总览/分类详情 | ● | ● | ○ | ○ |
| | 搜索 | ● | ● | ○ | ○ |
| | 详情页 | ● | ● | ● | ● |
| | 评论区（发帖/回复/验证码/点赞/加载更多/关评条） | ● | ● | ○ | ○ |
| | 发布页（双 select/TipTap/上传/提交） | ● | ● | ○ | ○ |
| | 登录/注册 | ● | ● | ○ | ○ |
| | 会员中心 | ● | ● | ○ | ○ |
| | 资料编辑 | ● | ● | ○ | ○ |
| 后台 | 登录 | ● | ○ | ○ | ○ |
| | 仪表盘 | ● | ○ | ○ | ○ |
| | 提示词管理（筛选+宽表+弹窗） | ● | ○ | ○ | ○ |
| | 用户/评论/管理员/日志 | ● | ○ | ○ | ○ |
| | 分类/角色/设置表单 | ● | ○ | ○ | ○ |

● 必验并截图；○ 抽查/回归。

每页通过标准：

1. 无页面级横向滚动（允许的表格/代码块内部横滑除外）
2. 无不可读截断、无控件重叠、无内容被 Tab/遮罩永久遮挡
3. 主要可点元素触控 ≥38px（Tab ≥48px）
4. 关键交互各实测一次：Tab 高亮切换、搜索展开、评论点赞/回复/验证码、弹窗开关、后台筛选/翻页
5. 1280 档与线上现状视觉零差异

## 8. 部署

- 本地 `npm run build` EXIT=0（PowerShell 用 `$env:NEXT_TELEMETRY_DISABLED="1"; npm run build *> build.log; "EXIT=$LASTEXITCODE"`）
- 纯前端文件，**无 schema/依赖变更**：scp 更新改动的 src 文件 → 服务器 `npm run build` → `pm2 restart CompletePrompt --update-env`，不做 db push、不动 MeiliSync
- 备份：部署前 tar 备份服务器旧代码到 /root（沿用第 3 期 SSH 参数）
- 线上复验：https://www.wango8.com/ 首页、某详情页、评论区，真实手机打开确认 Tab 栏与安全区

## 9. 改动文件预估

新增：

- `src/components/MobileTabBar.tsx`

修改（预计，以实测结果为准，不多改）：

- `src/app/(site)/layout.tsx`
- `src/components/SiteHeader.tsx`
- `src/app/(site)/page.tsx`
- `src/app/(site)/p/[id]/page.tsx`
- `src/components/CommentSection.tsx`
- `src/app/(site)/member/page.tsx`
- 后台：`PromptManager.tsx`、`UserManager.tsx`、`CommentManager.tsx`、`AdminManager.tsx`（筛选 min-width + 弹窗 padding/栅格）
- 视实测追加：`MediaUploader.tsx`、`CoverUploader.tsx`、`publish/page.tsx`、`PromptForm.tsx` 等

文档回填：AGENTS.md 第 4 期标记完成；docs/ai/05-gotchas.md 追加本期踩点（如实际有）。
