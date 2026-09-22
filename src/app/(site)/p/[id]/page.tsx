import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CopyButton, ActionButtons } from "@/components/Buttons";
import PromptCard from "@/components/PromptCard";
import AutoTranslate from "@/components/AutoTranslate";
import MediaGallery, { SectionMedia } from "@/components/MediaGallery";
import { getServerLocale, translate as t } from "@/lib/i18n";
import { detectLang } from "@/lib/langdetect";
import type { MediaItem } from "@/lib/media";
import { isHtmlContent, stripHtml, safeJsonScript } from "@/lib/rich";
import { sanitizeRich } from "@/lib/sanitize.server";
import { getCategoryMeta } from "@/lib/category-meta";
import CommentSection, { type CommentData } from "@/components/CommentSection";

export const dynamic = "force-dynamic";

// 将 Prisma Comment（含 Date 字段）序列化为可传给 client 组件的 plain object
function serializeComment(c: {
  id: number; userId: number; promptId: number; content: string;
  parentId: number | null; status: string; likeCount: number;
  createdAt: Date; updatedAt: Date;
  user: { id: number; username: string; nickname: string | null; avatar: string | null };
  replies?: unknown[];
}): CommentData {
  return {
    id: c.id,
    userId: c.userId,
    promptId: c.promptId,
    content: c.content,
    parentId: c.parentId,
    status: c.status,
    likeCount: c.likeCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    user: {
      id: c.user.id,
      username: c.user.username,
      nickname: c.user.nickname,
      avatar: c.user.avatar,
    },
    replies: ((c.replies ?? []) as Parameters<typeof serializeComment>[0][]).map(serializeComment),
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

  const [p, user] = await Promise.all([
    db.prompt.findUnique({
      where: { id: pid },
      include: {
        user: { select: { id: true, username: true, role: true, membershipLevel: true, membershipUntil: true } },
      },
    }),
    getCurrentUser(),
  ]);
  if (!p) notFound();

  // 未发布内容：仅作者本人或管理员可见
  const canSee =
    p.status === "published" || user?.role === "admin" || (user && user.id === p.userId);
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

  const related = await db.prompt.findMany({
    where: { status: "published", id: { not: pid }, type: p.type },
    orderBy: [{ featured: "desc" }, { likeCount: "desc" }],
    take: 6,
    select: {
      id: true, title: true, type: true, category: true, tags: true,
      sourceAuthor: true, likeCount: true, coverUrl: true, featured: true,
    },
  });

  // 顶级评论 + 一级回复（最多 2 级嵌套）
  const rawComments = await db.comment.findMany({
    where: { promptId: pid, parentId: null, status: "published" },
    include: {
      user: { select: { id: true, username: true, nickname: true, avatar: true } },
      replies: {
        include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
        where: { status: "published" },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const comments = rawComments.map(serializeComment);

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
  const memberActive =
    p.user.membershipLevel &&
    p.user.membershipLevel !== "free" &&
    (!p.user.membershipUntil || p.user.membershipUntil > new Date());

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <article>
        <div className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {p.category && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${getCategoryMeta(p.category).bg} ${getCategoryMeta(p.category).fg}`}>
                {p.category}
              </span>
            )}
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
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <span>{p.sourceAuthor || p.user.username}</span>
            {memberActive && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                {String(p.user.membershipLevel).toUpperCase()}
              </span>
            )}
            <span>·</span>
            <span>{p.createdAt.toISOString().slice(0, 10)}</span>
            <span>·</span>
            <span>{t(locale, "detail.views", { n: p.viewCount + (p.status === "published" ? 1 : 0) })}</span>
            {p.sourceUrl && (
              <>
                <span>·</span>
                <a href={p.sourceUrl} target="_blank" rel="noopener nofollow" className="text-emerald-400 hover:underline">
                  {t(locale, "detail.originalWork")}
                </a>
              </>
            )}
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

        <div className="mb-4">
          <ActionButtons
            promptId={p.id}
            initialLikes={p.likeCount}
            initialLiked={!!liked}
            initialFaved={!!faved}
          />
        </div>

        <div className="space-y-3">
          {isRich ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
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
                <section key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
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

      <aside className="space-y-6">
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

      <section className="mt-8">
        <CommentSection promptId={pid} initialComments={comments} />
      </section>
    </>
  );
}
