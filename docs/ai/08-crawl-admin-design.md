# 采集管理（v0.4 + 即梦扩展）设计与实现记录

> 版本：FULL PROMPT v0.4（2026-09-27 上线）+ 即梦AI采集源（2026-10-14 追加）
> 需求：后台新增「采集管理」，支持针对特定站点一键获取更新、与历史采集去重、勾选或全部采集入库。

## 1. 交互流程

1. 后台侧边栏「采集管理」（仅拥有 `crawl:manage` 权限的管理员可见；超管自动拥有）。
2. 选择采集源（LibLib TV / 即梦AI，注册表在 `src/lib/crawl-sources.ts`）。**每个源独立采集，不能同时采集两个源**。
3. 点「一键获取 XXX 更新」：
   - **LIBTV**：服务端拉取热门流前 3 页（60 条）→ 并发 5 逐条探测 detail，未公开提示词画布的作品直接剔除 → 按 `projectUuid` 与 `CrawlItem` 表 upsert
   - **即梦AI**：服务端通过 JSONP 拉取 explore feed 前 3 页（60 条）→ 有提示词+图即可采（无需额外探测，feed 已含全部数据）→ 按 `itemId` 与 `CrawlItem` 表 upsert
   - 新作品 → `status=new`（待采集）
   - 已入库作品远端更新时间晚于入库时间 → 计入「有更新」提示，但不重复入库
   - 返回「共获取 N 条 / 剔除 X / 可采集 Y / 新发现 Z / 有更新 W」
4. 列表三个 Tab：待采集 / 已采集 / 采集失败；列：多选框、封面、标题（源站链接）、作者、标签、远端更新时间、状态。
5. 勾选若干条 →「确认采集进库」；或「全部采集入库」（所有待采集，单次上限 100 条）。
6. 入库是后台异步任务（`CrawlJob`），前端 1.5s 轮询进度条；进度卡片若出现失败，红字只显示**最后一条**失败原因（`CrawlJob.lastError`，格式《标题》：原因）；完成后刷新列表，失败条目进入「采集失败」Tab 可勾选重试。

## 2. 数据模型（prisma/schema.prisma）

- `CrawlItem`：远端作品快照。`@@unique([source, remoteId])` 去重；`status = new | collected | failed`；`promptId @unique` 关联入库的 Prompt。
  - LIBTV：`remoteId = projectUuid`，`templateUuid` 存模板 UUID
  - 即梦AI：`remoteId = itemId`（common_attr.id），`templateUuid = null`（即梦无此概念）
  - 即梦AI 的 `tags` 数组约定：第 0 个元素存提示词，第 1 个存模型名，后续为实际标签
- `CrawlJob`：入库任务（source/itemIds/total/done/succeeded/failed/lastError/status/message/adminId）。`lastError` 只保留最后一条失败原因供进度卡片展示。运行态卡死超过 45 分钟（如 PM2 重启）会在下次发起任务时被 `reapStaleJobs()` 回收。
- `Prompt` 增加反向关系 `crawlItem CrawlItem?`。

## 3. 入库内容构建

### 3a. LIBTV（src/lib/crawl-libtv.ts）

远端 detail 接口的 `snapshotData` 包含画布全部节点，`extractNodes()` 提取有媒体产物的节点（与 `scripts/liblib-map.mjs` 同逻辑）：

- 每个媒体节点生成一个正文分节：`[N] 图片生成｜｜图片节点 12` + `中文提示词：…`，N 从 1 开始，媒体 JSON 的 `section` 与之一一对应（详情页按 section 渲染节点图）。
- 作品主类型取节点类型多数（video > image > audio > text），分类映射 `视频创作 / 图片创作 / 音频创作 / 其他`。
- 媒体：封面 + 图片节点（最终成品优先，其余均匀抽取，图片上限 12 张/作品、视频截帧上限 6 段/作品），全部 sharp webp 化到 `public/uploads/liblib/<promptId>/`（图片 `image-<hash>.webp`，视频帧 `frame-<hash>.webp`）。
- **视频截帧（上线当日补装 ffmpeg 8.0.1 后启用）**：ffmpeg 直读远端 mp4，带 `-referer`/`-user_agent` 防盗链，1s/3s/0.5s 三个时间点取最亮帧，webp 化后以 `type:"image"` + `nodeKind:"video"` 入库。路径 `FFMPEG_PATH || "ffmpeg"`。
- Prompt 字段：`sourceSite="liblib.tv"`、`sourceUrl="https://www.liblib.tv/canvas?sourceProjectUuid=<uuid>"`、`sourceAuthor`、tags、likeCount、language=zh、status=published、adminAuthorId=操作管理员、userId=专用 importer 账号 `libtv`（role=importer，自动 upsert）。
- 入库后双写 Meilisearch（`syncPromptToMeili`），立即可搜。

### 3b. 即梦AI（src/lib/crawl-jimeng.ts）

即梦作品为**单作品单提示词**（图片 / 视频两种形态），API 通过 JSONP 公开访问：

- **Feed API**：`GET /jsonp/mweb/v1/get_explore?category_id=11222&offset=0&count=20&image_info=...&feed_refer=feed_enterauto&filter=...&_callback=crawl`，响应包裹在 `window["__get_explore_result"] = {...}` JSONP 中。
- 分页用 `offset`（非 page），每页 20 条，页间隔 300ms。
- **图片作品**（effect_type=9）：提示词在 `aigc_image_params.text2image_params.prompt`，模型在 `text2image_params.model_config.model_name`，大图在 `image.large_images.image_url`。
- **视频作品**（effect_type=53）：提示词在 `aigc_image_params.text2video_params.video_gen_inputs.prompt`，模型在 `text2video_params.model_config.model_name`（Seedance 系列），视频地址在 `video.transcoded_video.origin.video_url`（短时效签名，约 1 小时过期）。
- 每个作品生成一个正文分节：`[1] 图片生成｜｜<标题>` 或 `[1] 视频生成｜｜<标题>` + `中文提示词：…` + `模型：<模型名>`。
- 分类：图片→`图片创作`，视频→`视频创作`；类型：图片→`image`，视频→`video`。
- 媒体：
  - 图片作品：封面 + 大图，sharp webp 化到 `public/uploads/liblib/<promptId>/`。
  - 视频作品：封面（首帧图）+ ffmpeg 截帧（多时间点取最亮帧，与 LIBTV 同策略）。
- **图片 URL 带签名过期**（x-expires），采集入库后存本地路径不受影响。
- **视频 URL 短时效签名**（约 1 小时），入库任务中若已过期则跳过截帧，仅用封面。
- **tags 约定**：`[0]=提示词 [1]=模型名 [2]=作品形态(image|video) [3]=视频地址(仅视频)`，入库时前 4 个剥离。
- Prompt 字段：`sourceSite="jimeng.jianying.com"`、`sourceUrl="https://jimeng.jianying.com/ai-tool/work/<itemId>"`、`sourceAuthor`、tags（剥离前 4 个后的实际标签）、likeCount、language=zh、status=published、adminAuthorId=操作管理员、userId=专用 importer 账号 `jimeng`（role=importer，自动 upsert）。
- 入库后双写 Meilisearch（`syncPromptToMeili`），立即可搜。

## 4. 接口（全部挂 PERMISSIONS.CRAWL_MANAGE）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/collect/sources` | 启用的采集源 |
| GET | `/api/admin/collect/items?source=&status=&page=` | 列表/计数/上次获取时间/运行中任务 |
| POST | `/api/admin/collect/fetch` | `{source: "libtv"\|"jimeng", pages?}` 一键拉取更新 |
| POST | `/api/admin/collect/import` | `{source, all:true}` 或 `{source, ids:[]}`，返回 `{jobId,total}` |
| GET | `/api/admin/collect/jobs/[id]` | 任务进度 |

写操作记录 AdminLog（`collect_fetch` / `collect_import`）。

## 5. 权限

新增权限点 `crawl:manage`（采集管理分组）。超管 `isSuper` 自动全权限；默认「内容管理员」角色模板包含该点（已存在的自定义角色不受影响，需要在 权限角色 里手工勾选）。

## 6. 后台导航新顺序（v0.4）

仪表盘 → 网站设置 → 提示词管理 → 提示词分类（原分类管理）→ **采集管理（新）** → 发布设置 → 用户管理 → 注册设置 → 评论管理 → 管理员设置（超管）→ 权限角色（原角色权限）→ 后台操作日志（原操作日志）。

侧边栏底部版本标识：`FULL PROMPT v0.4`。

## 7. 采集源注册表（src/lib/crawl-sources.ts）

```typescript
export type CrawlSourceId = "libtv" | "jimeng";
```

新增采集站只需：① 注册到 `CRAWL_SOURCES` 数组 ② 创建 `crawl-xxx.ts` 适配器 ③ crawl-worker 添加对应 `importXxxItem` 函数 ④ fetch 路由添加对应 `handleXxxFetch` 函数。

## 8. 边界与后续

- 「有更新」的已采集作品不覆盖入库（避免冲掉人工编辑）；后续如需增量更新，应走"更新草稿/二次确认"。
- LIBTV feed 仅拉热门流前 3 页；标签流参数（tagId）在 `fetchLibtvFeed` 已预留。
- 即梦 feed 仅拉 category_id=11222（默认推荐流）；分类 API（`/mweb/v1/get_explore_category_list`）公开可用，后续可扩展。
- 入库任务在 Next 进程内异步执行，依赖 PM2 常驻；极端情况（进程在任务中被杀）由 45 分钟超时回收。
- LIBTV 远端接口无鉴权但有频控：feed 页间隔 250ms、429 退避；单图下载间隔 80ms。
- 即梦远端接口通过 JSONP 公开访问：feed 页间隔 300ms、429 退避；单图下载间隔 80ms。
- 即梦图片 URL 带签名过期（x-expires），采集后存本地不受影响；但 CrawlItem.coverUrl 中的远端 URL 过期后封面将无法在列表中显示（TODO: 后续可考虑 fetch 时同步下载封面到本地缓存）。
- 即梦视频 URL 短时效签名（约 1 小时），入库时若已过期则跳过截帧仅用封面；后续如需完整视频截帧，需在 fetch 阶段同步下载视频或缩短 fetch→import 间隔。
