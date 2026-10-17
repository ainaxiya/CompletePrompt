import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentAdmin } from "@/lib/auth";
import { CopyButton, ActionButtons, BrowserBookmarkButton } from "@/components/Buttons";
import PromptCard from "@/components/PromptCard";
import AutoTranslate from "@/components/AutoTranslate";
import MediaGallery, { SectionMedia } from "@/components/MediaGallery";
import ImageLightbox from "@/components/ImageLightbox";
import CategoryIcon from "@/components/CategoryIcon";
import { getServerLocale, translate as t } from "@/lib/i18n";
import { detectLang } from "@/lib/langdetect";
import type { MediaItem } from "@/lib/media";
import { isHtmlContent, stripHtml, safeJsonScript } from "@/lib/rich";
import { sanitizeRich } from "@/lib/sanitize.server";
import { getCategoryMeta } from "@/lib/category-meta";
import { getSettings } from "@/lib/settings";
import { COMMENT } from "@/lib/comment-policy";
import CommentSection, { type CommentData } from "@/components/CommentSection";

const COMMENT_PAGE_SIZE = COMMENT.PAGE_SIZE;

// 创作类型元信息：key → 中文标签 / 链接 slug / 图标 / 配色
const TYPE_META: Record<string, { zh: string; en: string; icon: string; cls: string }> = {
  text:  { zh: "文本创作", en: "Text",  icon: "📝", cls: "bg-sky-500/15 text-sky-300 border-sky-700/50" },
  image: { zh: "文生图",   en: "Image", icon: "🎨", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-700/50" },
  video: { zh: "文生视频", en: "Video", icon: "🎬", cls: "bg-violet-500/15 text-violet-300 border-violet-700/50" },
  audio: { zh: "文生音频", en: "Audio", icon: "🎵", cls: "bg-amber-500/15 text-amber-300 border-amber-700/50" },
};

export const dynamic = "force-dynamic";

// 将 Prisma Comment（含 Date 字段）序列化为可传给 client 组件的 plain object
function serializeComment(c: any): CommentData {
  // 有公开回复的已删顶级评论：渲染占位
  if (c.status === "deleted") {
    return {
      id: c.id,
      promptId: c.promptId,
      parentId: null,
      status: "deleted",
      deleted: true,
      content: "",
      likeCount: 0,
      liked: false,
      createdAt: c.createdAt.toISOString(),
      user: null,
      replies: ((c.replies ?? []) as any[]).map(serializeComment),
    };
  }
  return {
    id: c.id,
    userId: c.userId,
    promptId: c.promptId,
    content: c.content,
    parentId: c.parentId,
    status: c.status,
    likeCount: c.likeCount,
    liked: Array.isArray(c.likes) ? c.likes.length > 0 : false,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    user: {
      id: c.user.id,
      username: c.user.username,
      nickname: c.user.nickname,
      avatar: c.user.avatar,
    },
    replies: ((c.replies ?? []) as any[]).map(serializeComment),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await db.prompt.findUnique({
    where: { id: parseInt(id) },
    select: { title: true, description: true, tags: true, content: true, status: true },
  });
  if (!p) return { title: "未找到" };
  const desc = stripHtml(p.description || p.content || p.title).slice(0, 200);
  return {
    title: p.title,
    description: desc,
    keywords: p.tags,
    robots: p.status === "published" ? undefined : { index: false, follow: false },
  };
}

export default async function PromptDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pid = parseInt(id);
  if (!pid) notFound();
  const locale = await getServerLocale();

  const [p, user, admin] = await Promise.all([
    db.prompt.findUnique({
      where: { id: pid },
      include: {
        user: { select: { id: true, username: true, nickname: true } },
      },
    }),
    getCurrentUser(),
    getCurrentAdmin(),
  ]);
  if (!p) notFound();

  // 未发布内容：仅作者本人或管理员可见
  const canSee =
    p.status === "published" || !!admin || (user && user.id === p.userId);
  if (!canSee) notFound();

  if (p.status === "published") {
    db.prompt
      .update({ where: { id: pid }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});
  }

  const [liked, faved] = user
    ? await Promise.all([
        db.like.findUnique({ where: { userId_promptId: { userId: user.id, promptId: pid } } }),
        db.favorite.findUnique({ where: { userId_promptId: { userId: user.id, promptId: pid } } }),
      ])
    : [null, null];

  // 内容源语言：以入库语言为准，缺省时实时检测
  const sourceLang = p.language || detectLang(stripHtml(p.content));

  const isRich = isHtmlContent(p.content);
  // 富文本：消毒后整体渲染；旧纯文本：解析 [N] 分节
  const richHtml = isRich ? sanitizeRich(p.content) : "";
  const plainText = isRich ? stripHtml(p.content).trim() : "";

  // 解析提示词分节：[N] 标签行 -> 正文直到下一个 [N] 之前
  const sections: { no: number; label: string; body: string }[] = [];
  if (!isRich) {
    const re = /^\[(\d+)\]\s*(.+)$/gm;
    const marks: { idx: number; no: number; label: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(p.content))) marks.push({ idx: m.index, no: +m[1], label: m[2] });
    for (let i = 0; i < marks.length; i++) {
      const nl = p.content.indexOf("\n", marks[i].idx);
      const bodyStart = nl < 0 ? marks[i].idx : nl + 1;
      const end = i + 1 < marks.length ? marks[i + 1].idx : p.content.length;
      sections.push({
        no: marks[i].no,
        label: marks[i].label,
        body: p.content.slice(bodyStart, end).trim(),
      });
    }
    if (sections.length === 0) sections.push({ no: 0, label: "", body: p.content.trim() });
  }

  // 相关推荐：同分类下随机 10 条（排除自己）
  const sameCatIds = await db.prompt.findMany({
    where: { status: "published", id: { not: pid }, category: p.category },
    select: { id: true },
  });
  const shuffledIds = sameCatIds
    .map((r) => r.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);
  const relatedRaw = shuffledIds.length
    ? await db.prompt.findMany({
        where: { id: { in: shuffledIds } },
        select: {
          id: true, title: true, type: true, category: true, tags: true,
          sourceAuthor: true, likeCount: true, coverUrl: true, featured: true,
          description: true, content: true,
        },
      })
    : [];
  // 按洗牌后的 id 顺序输出，保证"随机感"
  const idOrder = new Map(shuffledIds.map((id, i) => [id, i]));
  const related = relatedRaw.sort(
    (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0)
  );

  // 热搜词：从全站已发布提示词的 tags 中随机抽 15 个
  const tagRows = await db.prompt.findMany({
    where: { status: "published", tags: { isEmpty: false } },
    select: { tags: true },
    take: 500,
  });
  const tagSet = new Set<string>();
  tagRows.forEach((r) => r.tags.forEach((tg) => tagSet.add(tg)));
  const hotTags = [...tagSet].sort(() => Math.random() - 0.5).slice(0, 15);

  // 评论设置 + 首屏评论（顶级 20 条，含已赞状态；有公开回复的已删评论显示占位）
  const settings = await getSettings();
  const commentWhere = {
    promptId: pid,
    parentId: null,
    OR: [
      { status: "published" },
      { status: "deleted", replies: { some: { status: "published" } } },
    ],
  };
  const likedSelect = user ? { likes: { where: { userId: user.id }, select: { id: true } } } : {};
  const [rawComments, commentTotal] = await Promise.all([
    db.comment.findMany({
      where: commentWhere,
      include: {
        user: { select: { id: true, username: true, nickname: true, avatar: true } },
        ...likedSelect,
        replies: {
          include: {
            user: { select: { id: true, username: true, nickname: true, avatar: true } },
            ...likedSelect,
          },
          where: { status: "published" },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: COMMENT_PAGE_SIZE,
    }),
    db.comment.count({ where: commentWhere }),
  ]);
  const comments = rawComments.map(serializeComment);
  const commentsClosed = !settings.comment.enabled || p.commentsClosed;

  const media = (Array.isArray(p.media) ? p.media : []) as unknown as MediaItem[];
  // 分段媒体：按 section 序号分组；其余（封面等）进顶部画廊
  const sectionMedia = new Map<number, MediaItem[]>();
  for (const m of media) {
    if (typeof m.section === "number") {
      const arr = sectionMedia.get(m.section) || [];
      arr.push(m);
      sectionMedia.set(m.section, arr);
    }
  }
  const topMedia = media.filter((m) => typeof m.section !== "number");

  const typeMeta = TYPE_META[p.type] || TYPE_META.text;
  const typeLabel = locale === "zh" ? typeMeta.zh : typeMeta.en;
  const catMeta = p.category ? getCategoryMeta(p.category) : null;
  const viewCount = p.viewCount + (p.status === "published" ? 1 : 0);
  const pubDate = (p.publishedAt || p.createdAt).toISOString().slice(0, 10);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: p.title,
    description: p.description || undefined,
    keywords: p.tags.join(","),
    author: { "@type": "Person", name: p.sourceAuthor || p.user.username },
    datePublished: p.createdAt.toISOString(),
  };

  return (
    <>
    {/* 布局：桌面端左右两列 — 左列（面包屑+内容+热搜词+评论 连续堆叠），右列相关推荐；手机端同序堆叠 */}
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* 左列：内容主体 */}
      <div className="min-w-0 flex-1 space-y-6">
      <article className="self-start">
        <div className="mb-4">
          {/* 面包屑：栏目（可点进列表） + 创作类型（可点进类型列表） */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {p.category && catMeta && (
              <Link
                href={`/category/${encodeURIComponent(p.category)}`}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-medium transition hover:opacity-80 ${catMeta.bg} ${catMeta.fg} border-transparent`}
              >
                <CategoryIcon icon={catMeta.icon} className="h-4 w-4" />
                {catMeta.name[locale]}
              </Link>
            )}
            <Link
              href={`/type/${encodeURIComponent(p.type)}`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-medium transition hover:opacity-80 ${typeMeta.cls}`}
            >
              <span>{typeMeta.icon}</span>
              {typeLabel}
            </Link>
            {p.featured && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">★</span>
            )}
            {p.status === "pending" && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                {t(locale, "detail.pending")}
              </span>
            )}
            {p.status === "rejected" && (
              <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300">
                {t(locale, "detail.rejected")}
              </span>
            )}
          </div>
          <h1 className="mb-3 text-2xl font-bold leading-tight">{p.title}</h1>
          {/* 元信息：作者 / 发布日期 / 观看 / 赞 + 原作品链接 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-zinc-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {locale === "zh" ? "作者" : "Author"}：{p.sourceAuthor || p.user.nickname || p.user.username}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-zinc-500"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              {locale === "zh" ? "发布日期" : "Published"}：{pubDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-zinc-500"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {locale === "zh" ? "观看" : "Views"}：{viewCount}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-zinc-500"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
              {locale === "zh" ? "赞" : "Likes"}：{p.likeCount}
            </span>
          </div>
          {p.status === "rejected" && p.rejectReason && (
            <p className="mt-2 rounded border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
              {t(locale, "detail.rejectReason")}：{p.rejectReason}
            </p>
          )}
          {p.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.tags.map((tag) => (
                <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200">
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        <MediaGallery media={topMedia} />

        {p.description && (
          <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm leading-relaxed text-zinc-300">
            {p.description}
          </p>
        )}

        {/* 点赞 / 收藏 / 浏览器收藏：靠右对齐 */}
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
          <ActionButtons
            promptId={p.id}
            initialLikes={p.likeCount}
            initialLiked={!!liked}
            initialFaved={!!faved}
          />
          <BrowserBookmarkButton title={p.title} />
        </div>

        <div className="space-y-3">
          {isRich ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-end gap-2">
                <CopyButton text={plainText} />
              </div>
              <div
                className="rich-content text-sm leading-relaxed text-zinc-300"
                dangerouslySetInnerHTML={{ __html: richHtml }}
              />
              <AutoTranslate text={plainText} source={sourceLang as "zh" | "en"} index={0} />
            </section>
          ) : (
            sections.map((s, i) => {
              const chips = s.label ? s.label.split("｜").filter(Boolean) : [];
              const secImgs = sectionMedia.get(s.no);
              return (
                <section key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4">
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.no > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded bg-emerald-500 px-1 text-[11px] font-bold text-zinc-950">
                          {s.no}
                        </span>
                      )}
                      {chips.map((c, ci) => (
                        <span
                          key={ci}
                          className={
                            ci === chips.length - 1
                              ? "rounded border border-emerald-700/60 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300"
                              : "rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400"
                          }
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                    <CopyButton text={s.body} />
                  </div>
                  {secImgs && <SectionMedia items={secImgs} altBase={p.title} />}
                  <p className={`prompt-content whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 ${secImgs ? "mt-3" : ""}`}>{s.body}</p>
                  <AutoTranslate text={s.body} source={sourceLang as "zh" | "en"} index={i} />
                </section>
              );
            })
          )}
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonScript(jsonLd) }} />
      </article>

      {/* 热搜词：紧随内容 */}
      {hotTags.length > 0 && (
        <section className="self-start rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <span className="text-orange-400">🔥</span>
            {locale === "zh" ? "热搜词" : "Trending"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {hotTags.map((tag) => (
              <Link
                key={tag}
                href={`/search?q=${encodeURIComponent(tag)}`}
                className="rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/60 hover:text-emerald-300"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 评论：紧随热搜词 */}
      <section className="self-start">
        <CommentSection
          promptId={pid}
          initialComments={comments}
          closed={commentsClosed}
          initialTotal={commentTotal}
        />
      </section>
      </div>

      {/* 右列：相关推荐 */}
      <aside className="w-full shrink-0 space-y-6 self-start lg:w-[280px]">
        <div>
          <h3 className="mb-3 text-sm font-medium text-zinc-400">{t(locale, "detail.related")}</h3>
          <div className="space-y-2">
            {related.map((r) => (
              <PromptCard key={r.id} p={r} locale={locale} />
            ))}
          </div>
        </div>
      </aside>
    </div>

    {/* 图片灯箱：拦截正文/画廊图片点击，本页放大显示 */}
    <ImageLightbox />
    </>
  );
}
