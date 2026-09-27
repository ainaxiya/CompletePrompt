# 采集管理（v0.4）设计与实现记录

> 版本：FULL PROMPT v0.4（2026-09-27 上线）
> 需求：后台新增「采集管理」，支持针对特定站点（首发 LIBTV = LibLib TV）一键获取更新、与历史采集去重、勾选或全部采集入库。

## 1. 交互流程

1. 后台侧边栏「采集管理」（仅拥有 `crawl:manage` 权限的管理员可见；超管自动拥有）。
2. 选择采集源（当前仅 LibLib TV，后续在 `src/lib/crawl-sources.ts` 注册表扩展）。
3. 点「一键获取 LIBTV 更新」：服务端拉取热门流前 3 页（60 条），按 `projectUuid` 与 `CrawlItem` 表 upsert：
   - 新作品 → `status=new`（待采集）
   - 已入库作品远端更新时间晚于入库时间 → 计入「有更新」提示，但**不重复入库**（v0.4 不覆盖已采集内容）
   - 返回「共 N 条 / 新发现 X / 有更新 Y」
4. 列表三个 Tab：待采集 / 已采集 / 采集失败；列：多选框、封面、标题（源站链接）、作者、标签、远端更新时间、状态。
5. 勾选若干条 →「确认采集进库」；或「全部采集入库」（所有待采集，单次上限 100 条）。
6. 入库是后台异步任务（`CrawlJob`），前端 1.5s 轮询进度条；完成后刷新列表，失败条目进入「采集失败」Tab 可勾选重试。

## 2. 数据模型（prisma/schema.prisma）

- `CrawlItem`：远端作品快照。`@@unique([source, remoteId])` 去重；`status = new | collected | failed`；`promptId @unique` 关联入库的 Prompt；`remoteCreatedAt/remoteUpdatedAt` 解析自远端中文时间（"2026年09月22日 17:07"）。
- `CrawlJob`：入库任务（source/itemIds/total/done/succeeded/failed/status/message/adminId）。运行态卡死超过 45 分钟（如 PM2 重启）会在下次发起任务时被 `reapStaleJobs()` 回收。
- `Prompt` 增加反向关系 `crawlItem CrawlItem?`。

## 3. 入库内容构建（src/lib/crawl-libtv.ts）

远端 detail 接口的 `snapshotData` 包含画布全部节点，`extractNodes()` 提取有媒体产物的节点（与 `scripts/liblib-map.mjs` 同逻辑）：

- 每个媒体节点生成一个正文分节：`[N] 图片生成｜｜图片节点 12` + `中文提示词：…`，N 从 1 开始，媒体 JSON 的 `section` 与之一一对应（详情页按 section 渲染节点图）。
- 作品主类型取节点类型多数（video > image > audio > text），分类映射 `视频创作 / 图片创作 / 音频创作 / 其他`。
- 媒体：封面 + 图片节点（最终成品优先，其余均匀抽取，图片上限 12 张/作品、视频截帧上限 6 段/作品），全部 sharp webp 化到 `public/uploads/liblib/<promptId>/`（图片 `image-<hash>.webp`，视频帧 `frame-<hash>.webp`）。
- **视频截帧（上线当日补装 ffmpeg 8.0.1 后启用）**：ffmpeg 直读远端 mp4，带 `-referer`/`-user_agent` 防盗链，1s/3s/0.5s 三个时间点取最亮帧，webp 化后以 `type:"image"` + `nodeKind:"video"` 入库。路径 `FFMPEG_PATH || "ffmpeg"`。
- Prompt 字段：`sourceSite="liblib.tv"`、`sourceUrl="https://www.liblib.tv/canvas?sourceProjectUuid=<uuid>"`（与历史人工导入作品同格式）、`sourceAuthor`、tags、likeCount、language=zh、status=published、adminAuthorId=操作管理员、userId=专用 importer 账号 `libtv`（role=importer，自动 upsert）。
- 入库后双写 Meilisearch（`syncPromptToMeili`），立即可搜。

## 4. 接口（全部挂 PERMISSIONS.CRAWL_MANAGE）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/collect/sources` | 启用的采集源 |
| GET | `/api/admin/collect/items?source=&status=&page=` | 列表/计数/上次获取时间/运行中任务 |
| POST | `/api/admin/collect/fetch` | `{source, pages?}` 一键拉取更新 |
| POST | `/api/admin/collect/import` | `{source, all:true}` 或 `{source, ids:[]}`，返回 `{jobId,total}` |
| GET | `/api/admin/collect/jobs/[id]` | 任务进度 |

写操作记录 AdminLog（`collect_fetch` / `collect_import`）。

## 5. 权限

新增权限点 `crawl:manage`（采集管理分组）。超管 `isSuper` 自动全权限；默认「内容管理员」角色模板包含该点（已存在的自定义角色不受影响，需要在 权限角色 里手工勾选）。

## 6. 后台导航新顺序（v0.4）

仪表盘 → 网站设置 → 提示词管理 → 提示词分类（原分类管理）→ **采集管理（新）** → 发布设置 → 用户管理 → 注册设置 → 评论管理 → 管理员设置（超管）→ 权限角色（原角色权限）→ 后台操作日志（原操作日志）。

侧边栏底部版本标识：`FULL PROMPT v0.4`。

## 7. 边界与后续

- 「有更新」的已采集作品 v0.4 不覆盖入库（避免冲掉人工编辑）；后续如需增量更新，应走"更新草稿/二次确认"。
- feed 仅拉热门流前 3 页；标签流参数（tagId）在 `fetchLibtvFeed` 已预留。
- 入库任务在 Next 进程内异步执行，依赖 PM2 常驻；极端情况（进程在任务中被杀）由 45 分钟超时回收。
- 远端接口无鉴权但有频控：feed 页间隔 250ms、429 退避；单图下载间隔 80ms。
