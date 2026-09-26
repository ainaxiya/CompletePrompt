# 第 3 期 站内自研评论系统 设计（2026-09-24 获批）

> 路线：方案 A，在现有 Comment 半成品（表 + 4 接口 + CommentSection + comment:read/moderate 权限点）上自研加固。单 Next 进程 + PostgreSQL，无新服务。对标 Artalk 能力：限频、敏感词、禁言、触发式验证码、后台管理。

## 0. 已确认的需求决策

| 决策点 | 结论 |
|---|---|
| 发言门槛 | 仅登录会员；游客只读 |
| 限频 | 同一用户 60 秒硬上限 6 条；60 秒内发到第 4 条起触发验证码（触发态 10 分钟） |
| 敏感词 | 命中词整体替换为等长 `**` 后直发（不转待审）；词库后台可维护 |
| 禁言 | User.commentBanned，用户管理处操作，与登录封禁独立 |
| 验证码 | 内存算术题（如 7+5=?），5 分钟过期、一次性；仅触发态要求 |
| 结构 | 两级嵌套（顶级 + 一层回复），不做无限楼层 |
| 点赞 | 新 CommentLike 表防重，POST 切换，返回 `{active,count}` |
| 分页 | 顶级评论 20 条/页，加载更多（每页带回复） |
| 排序 | 固定最新在前，不做热度排序 |
| 开关 | 全站开关（SiteSetting `comment.enabled`）+ 单篇 `Prompt.commentsClosed` |
| 关评后 | 旧评论保留显示，仅禁止新发，顶部提示已关闭 |
| 评论上限 | 1000 字 |
| 后台 | 评论管理页（筛选/搜索/单条+批量）+ 敏感词库 Tab；禁言在用户管理 |
| 不做 | @通知、邮件、表情、游客评论、第三方验证码、管理员评论官方身份 |

## 1. 数据层（只加不删，prisma db push）

- 新表 `CommentLike { id, commentId, userId, createdAt; @@unique([commentId,userId]); @@index([userId]) }`
- `User.commentBanned Boolean @default(false)`
- `Prompt.commentsClosed Boolean @default(false)`
- `Comment.ip String?`、`Comment.ua String?`
- 状态沿用 published/hidden/deleted，**不引入 pending**
- SiteSetting 新键 `comment`：`{ enabled: boolean, sensitiveWords: string[] }`

## 2. 服务端纯逻辑

- `src/lib/comment-policy.ts`
  - 常量：`MAX_LEN=1000`、`HARD_WINDOW_MS=60_000`、`HARD_LIMIT=6`、`CAPTCHA_THRESHOLD=4`（60s 内第 4 条起）、`CAPTCHA_ARMED_MS=10*60_000`
  - `maskSensitive(text, words): { text, hits: string[] }`：按词长降序替换，每个字符替为 `*`
  - 频控/验证码触发判定基于 DB count（60s 窗口内该用户评论数），不新增内存桶
- `src/lib/captcha.ts`：内存 Map（id→{answer,exp}），算术题两数 1-9 加减（减法保证非负）；`issueCaptcha()` / `consumeCaptcha(id, answer)`，5 分钟过期、一次性
- `GET /api/captcha` → `{ captchaId, question }`

## 3. 接口

- `POST /api/comments` 校验链：401 → comment.enabled → user.commentBanned(403 code=banned) → zod（promptId int、content 1..1000、parentId?）→ prompt 存在/已发布/未 commentsClosed → 父评论同 prompt → 60s 内计数：>=6 返回 429 `{rateLimited}`；>=4 或处于 armed 期：缺/错 captcha 返回 429 `{captchaRequired:true}` → maskSensitive → create 带 ip/ua（ua 截断 300）→ commentCount+1。成功返回评论对象（含 `maskedHits` 计数提示）
- `GET /api/comments?promptId=&page=`：顶级 20/页，include 当页回复（asc），返回 `{ list, total, page, pageSize, closed }`（**统一契约，废弃前端读 d.comments 的旧写法**）
- `POST /api/comments/[id]/like`：登录；评论须 published；upsert 切换，事务内 likeCount ±1；`{active,count}`
- `PATCH /api/comments/[id]`（管理员）：published↔hidden，published→hidden 时 commentCount-1，hidden→published +1（deleted 不可逆）
- `DELETE /api/comments/[id]`：published→deleted 才减计数；有回复保留行内容显示「该评论已删除」，无回复不渲染
- `GET /api/admin/comments`：status/q/promptId/userId 筛选 + 分页，include user/prompt 标题
- `POST /api/admin/comments/batch`：`{ids:[], action:"hide"|"show"|"delete"}` 事务处理 + 逐条 AdminLog
- `PUT /api/admin/settings` 白名单加 `comment`；`PATCH /api/admin/users/[id]` 加 commentBanned
- 后台提示词 PATCH 加 `commentsClosed: z.boolean().optional()`

## 4. 前端 CommentSection（props 契约不变：promptId, initialComments）

新增 props 内部数据：`closed`、`initialLikedIds:number[]`。功能：发评/回复、点赞实心态防重、加载更多（page+1 追加）、关评只读提示、禁言提示、429 时内联验证码行（题目/输入/换一题）、敏感词被屏蔽后轻提示。视觉沿用 zinc-900 卡片 + indigo，与第 2 期胶囊按钮风格一致。详情页 Server Component 传 closed + 当前用户已赞 id 集；旧评论关评后照常渲染。

## 5. 后台

- 导航加「评论管理」（COMMENT_READ）：comments/page.tsx + CommentManager.tsx；状态 Tab 全部/正常/隐藏/已删除，关键词（内容 contains insensitive）、promptId、userId 筛选；批量勾选；跳原帖 `/p/{promptId}`；页底敏感词库卡片（textarea 一行一个，保存到 comment.sensitiveWords）
- 用户管理：OptionDropdown 加「禁言评论/解除禁言」+ 禁言标记
- PromptForm：加「关闭本文评论」勾选

## 6. 部署

`npx prisma db push`（新表+3 可空列，无风险）→ build → pm2 restart CompletePrompt；无新进程。验收见 AGENTS 路线图。
