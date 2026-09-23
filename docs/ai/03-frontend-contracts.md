# 03 · 前端契约册（渲染管线、页面数据流、组件 Props）

> 技术底座：Next.js 15 App Router + React 19 + Tailwind v4，无 UI 库。
> 核心原则：**能在 Server Component 查库就不建 API**；交互才写 client 组件 + fetch。

## 一、Server / Client 边界（最容易犯错）

| 能做 | Server Component（默认，无指令） | Client Component（`"use client"`） |
|---|---|---|
| import db、prisma、fs、next/headers、cookies | ✅ | ❌ |
| import sanitize.server.ts（带 `import "server-only"`） | ✅ | ❌（构建直接报错） |
| import rbac.ts（内部用 next/headers） | ✅ | ❌，客户端权限只能 import `@/lib/permissions` |
| useState/事件/浏览器 API/DOM | ❌ | ✅ |
| 渲染 client 组件并传 props | ✅（可传 serializable 数据） | ✅ |
| 直接调 fetch 自己的 API | 一般不需要（可直接 db） | ✅ |

- Server 传给 Client 的 props 必须**可序列化**：Date 先 `.toISOString()`（参考详情页 serializeComment），不传 Prisma 对象、不传函数。
| 动态参数 | Next 15 签名 |
|---|---|
| 页面/路由动态段 | `({ params }: { params: Promise<{ id: string }> })` 内 `await params` |
| 查询串 | `({ searchParams }: { searchParams: Promise<{...}> })` 内 `await searchParams` |
| 依赖 cookie/登录态的页面 | 文件顶部必须 `export const dynamic = "force-dynamic"` |

- 服务端取语言：`const locale = await getServerLocale()`；客户端：`const locale = useLocale()`（首屏固定 zh，挂载后读 cookie，**不要**在首屏直接渲染 document.cookie，会 hydration 不匹配）
- t 函数：服务端 `import { translate as t } from "@/lib/i18n"`；客户端 `from "@/lib/i18n-client"`；插值 `t(locale, "cat.count", { n: 3 })`，占位符写法 `{n}`

## 二、页面数据流事实（每个页面查什么）

| 页面 | 数据来源 | 鉴权/特殊 |
|---|---|---|
| `/` 首页 | db.prompt 直接查 published，orderBy featured desc, likeCount desc, viewCount desc, id desc，take 30；select 含 content/description/coverUrl | 给卡片额外算 `sectionCount = content 匹配 ^[N] 的数量` |
| `/hot` | db 直查，按 likeCount 等热门排序 | 列表 select 同样带 description/content |
| `/categories` | db.category.findMany(sort asc) | — |
| `/category/[slug]` | slug 必须在 getCategorySlugs() 缓存白名单内 | 不在则 notFound |
| `/p/[id]` | 见下方"详情页管线" | 未发布仅作者/管理员可见，否则 notFound |
| `/search` | **Meilisearch**（searchPrompts），分类另查 db.category；hits 是 any[] 手动映射给 PromptCard；引擎异常有 error 文案位 | q/type/category/sort/page 全部走 query string 链接（非表单） |
| `/publish` | 登录页；设置来自 GET /api/settings（限额） | 未登录跳 login?next=/publish |
| `/login` `/register` | AuthForm（client）；注册页拉 /api/settings 判 allowRegister | 成功跳 `next`（白名单相对路径） |
| `/member` | getCurrentUser + Promise.all：我的发布(10)、收藏(12，含 prompt content/coverUrl)、发布数、收藏数、获赞 aggregate | 未登录 redirect |
| `/user/profile` | ProfileForm 调 /api/user/profile | 登录 |
| 后台各页 | 页面内 requireAdmin + db 直读初始数据 → 渲染 admin 客户端组件 | 失败 redirect 登录 |

### 详情页 `/p/[id]` 管线（改正文/媒体相关功能必读）
1. generateMetadata：查 title/description/tags/content/status，描述 stripHtml 截 200；非 published `robots: noindex`
2. published 内容浏览量**异步不 await**自增 viewCount（`.catch(()=>{})`）
3. 登录用户查 liked/faved 初态传给 ActionButtons
4. 正文双形态：
   - HTML（isHtmlContent）：`sanitizeRich()` 后渲染；`stripHtml` 得纯文本给复制/翻译
   - 旧纯文本：正则 `^\[(\d+)\]\s*(.+)$`（gm）切 sections `{ no, label, body }`，逐段渲染并挂 CopyButton、AutoTranslate
5. 媒体：media Json 解析为 MediaItem[]；MediaGallery 展示全部；SectionMedia 按 section/nodeNo 归位
6. 评论：查两层（顶级 + replies）→ serializeComment（Date 转 ISO）→ CommentSection

## 三、组件 Props 契约（改组件先看这里）

| 组件 | 位置 | props |
|---|---|---|
| SiteHeader | components/ | `{ siteName: string; logoIcon?: string="/logo/icon.png" }` |
| PromptCard | components/ | `{ p: CardData, locale?: "zh"|"en" }`，CardData 见下 |
| CardCover | components/ | `{ src; title; fallback?: ReactNode }`（client，img onError 降级） |
| TextCover（具名导出） | CardCover.tsx | `{ text: string; type?: string }` |
| Placeholder（具名导出） | CardCover.tsx | 无 |
| MediaGallery（默认） | components/ | `{ media: MediaItem[] }` |
| SectionMedia（具名） | MediaGallery.tsx | `{ items: MediaItem[]; altBase?: string }` |
| RichEditor | components/ | `{ value: string; onChange: (v:string)=>void; placeholder?; minHeight?=280 }` |
| CoverUploader | components/ | `{ value: string|null; onChange:(url:string|null)=>void; maxImageMB?=10 }` |
| MediaUploader | components/ | `{ media: MediaItem[]; onChange:(m:MediaItem[])=>void; max?=9; maxImageMB?=10; maxVideoMB?=100 }` |
| AutoTranslate | components/ | `{ text: string; source: "zh"|"en"; index: number }`（source 与当前语言相同则不渲染） |
| CopyButton（具名） | Buttons.tsx | `{ text: string; label?: string }` |
| ActionButtons（具名） | Buttons.tsx | `{ promptId; initialLikes; initialLiked; initialFaved }`（内部调 /api/prompts/id/like|favorite） |
| CommentSection | components/ | `{ promptId: number; initialComments: CommentData[] }` |
| AuthForm | components/ | `{ mode: "login"|"register" }` |
| UserMenu / LanguageSwitcher / LogoutButton | components/ | 无 props（自行 fetch/cookie） |
| UserAvatar | components/ | 传用户基础信息（以文件内类型为准） |
| PromptForm（admin） | admin/ | `{ promptId?: number }`（无=新建，自己拉详情/分类） |
| PromptManager（admin） | admin/ | 以文件签名为准（初始列表/分类/权限标志） |
| CategoryManager | admin/ | `{ initial: Category[] }` |
| RoleManager | admin/ | `{ initial: Role[] }` |
| UserManager | admin/ | 无（自取数据） |
| BasicForm/PublishForm/MembershipForm | admin/SettingsForms.tsx | 无（自取 /api/admin/settings） |
| SiteSettingsForm | admin/ | `{ initial: SiteFormShape }`（页面读 site 键注入） |

### PromptCard 的 p（CardData）精确形状
```
id:number; title:string; type:string; category?:string; tags:string[];
sourceAuthor: string|null; likeCount:number; sectionCount?:number;
coverUrl?:string|null; featured?:boolean;
description?:string|null; content?:string|null; excerpt?:string|null
```
- 任何列表页/搜索结果给它喂数据都要满足此形状；**要无封面文字摘要就必须带 description 或 content**
- category 显示的是原始字符串（=分类 slug，通常就是中文名），类型徽标走 dict（type.video 等），分类配色走组件内 CAT_CLS 映射，未命中回落"其他"
- 卡片整体是 `<Link href={/p/id}>`，不要再在外层嵌套可点击元素

### CommentData（client 边界序列化形状）
`{ id, userId, promptId, content, parentId?, status?, likeCount?, createdAt: string(ISO), updatedAt?: string, user: {id, username, nickname?, avatar?}, replies?: CommentData[] }`

### MediaItem（lib/media.ts，纯类型，前后端共用）
`{ type: "image"|"video"|"embed"; url; poster?; role?: "cover"|"node"; section?:number; nodeNo?:number; nodeKind?: "image"|"video"; sourceUrl?; alt? }`
- 贴链接识别用 `mediaFromUrl(url)`；embed 转换用 `normalizeEmbed(url)`（YouTube → youtube.com/embed/；B 站 → player.bilibili.com）
- 图片后缀 jpeg/jpg/png/webp/gif/avif；视频 mp4/webm/mov/m4v

## 四、样式与 UI 约定

- 颜色重映射务必看 AGENTS.md 第 11 节：`emerald-500` 实际是 `#6366f1` 靛蓝；金色用自定义 `royal-*`
- 常用结构类：卡片 `rounded-xl border border-zinc-800 bg-zinc-900/60`；主按钮 `bg-emerald-500 text-zinc-950 hover:bg-emerald-400`；次按钮 `bg-zinc-800 hover:bg-zinc-700`；危险 `rose`；警告 `amber`
- 列表网格统一：`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3`
- 图片用原生 `<img>`（已有 eslint-disable 注释约定），不引入 next/image
- 渐变文字类 `text-gold-gradient`；品牌卡片类 `brand-card`；热门数样式 `text-royal-400 hot-glow`
- 状态徽章可参考 member 页 STATUS_BADGE（published 绿/pending 琥珀/rejected 红/draft 灰）

## 五、前端新增功能的固定套路

1. 纯展示区块 → 在对应 Server Component 里加查询 + 直接写 JSX；中英文案加 dict
2. 需要一个按钮/表单 → 新建 `"use client"` 组件，props 接收 server 数据；fetch 用 02 册第四节的容错写法；成功后 `router.refresh()`
3. 需要新页面 → 在 `(site)/` 下建目录；要登录：页面顶部 redirect；要在导航出现：改 SiteHeader（导航是组件内文案数组，配合 dict key）
4. 需要后台页 → `(admin)/guanli-7k2m9x/xxx/page.tsx`（requireAdmin + 读初值）+ components/admin 组件 + layout.tsx NAV（href 用 ADMIN_BASE 拼）
5. 需要弹窗提示：项目现状用 alert/内联 msg（两种都有，跟随所在文件既有模式，不引入弹窗库）
