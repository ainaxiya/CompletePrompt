import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PromptCard from "@/components/PromptCard";
import Pagination from "@/components/Pagination";
import { getServerLocale, translate as t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

// 创作类型元信息（与详情页保持一致）
const TYPE_META: Record<string, { zh: string; en: string; icon: string; cls: string; desc: { zh: string; en: string } }> = {
  text:  { zh: "文本创作", en: "Text Prompts",  icon: "📝", cls: "bg-sky-500/15 text-sky-300 border-sky-700/50",
           desc: { zh: "纯文本提示词：写作、对话、代码、角色设定等", en: "Pure text prompts for writing, chat, code, roles" } },
  image: { zh: "文生图",   en: "Text-to-Image", icon: "🎨", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-700/50",
           desc: { zh: "AI 绘画提示词：Midjourney、SD、即梦等绘图描述", en: "AI art prompts for Midjourney, SD, Jimeng, etc." } },
  video: { zh: "文生视频", en: "Text-to-Video", icon: "🎬", cls: "bg-violet-500/15 text-violet-300 border-violet-700/50",
           desc: { zh: "AI 视频提示词：即梦、可灵、Runway 等视频生成描述", en: "AI video prompts for Jimeng, Kling, Runway, etc." } },
  audio: { zh: "文生音频", en: "Text-to-Audio", icon: "🎵", cls: "bg-amber-500/15 text-amber-300 border-amber-700/50",
           desc: { zh: "AI 音频提示词：音乐、配音、音效生成描述", en: "AI audio prompts for music, voice, SFX" } },
};

const VALID_TYPES = Object.keys(TYPE_META);

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const meta = TYPE_META[decodeURIComponent(type)];
  return { title: meta ? meta.zh : "创作类型" };
}

export default async function TypeList({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const locale = await getServerLocale();
  const { type: rawType } = await params;
  const type = decodeURIComponent(rawType);
  if (!VALID_TYPES.includes(type)) notFound();
  const meta = TYPE_META[type];
  const sp = await searchParams;

  const sortRaw = sp.sort || "new";
  const sort = ["new", "old", "views", "likes"].includes(sortRaw) ? sortRaw : "new";
  const page = Math.max(1, parseInt(sp.page || "1") || 1);

  const where = { status: "published" as const, type };
  const orderBy =
    sort === "old"
      ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
      : sort === "views"
        ? [{ viewCount: "desc" as const }, { id: "desc" as const }]
        : sort === "likes"
          ? [{ likeCount: "desc" as const }, { id: "desc" as const }]
          : [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const [prompts, total] = await Promise.all([
    db.prompt.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, title: true, type: true, category: true, tags: true,
        sourceAuthor: true, likeCount: true, content: true, description: true,
        coverUrl: true, featured: true,
      },
    }),
    db.prompt.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const name = locale === "zh" ? meta.zh : meta.en;

  const sortHref = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "new") p.set("sort", k);
    p.set("page", "1");
    const qs = p.toString();
    return `/type/${encodeURIComponent(type)}${qs ? `?${qs}` : ""}`;
  };
  const sortBtn = (active: boolean, label: string, href: string, arrow?: string) => (
    <Link
      href={href}
      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-emerald-500 font-medium text-zinc-950"
          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {label}
      {arrow && <span className="text-xs">{arrow}</span>}
    </Link>
  );

  return (
    <div>
      <Link href="/categories" className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-300">
        {t(locale, "catlist.back")}
      </Link>

      <div className="mb-6 flex items-start gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-2xl ${meta.cls}`}>
          {meta.icon}
        </span>
        <div>
          <h1 className="text-xl font-bold text-zinc-50">{name}</h1>
          <p className="mt-1 text-sm text-zinc-400">{meta.desc[locale]}</p>
          <p className="mt-1 text-xs text-zinc-600">{t(locale, "cat.count", { n: total })}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {sort !== "old"
          ? sortBtn(sort === "new", t(locale, "sort.new"), sortHref("new"), "↓")
          : sortBtn(true, t(locale, "sort.new"), sortHref("new"), "↑")}
        {sortBtn(sort === "views", t(locale, "sort.views"), sortHref("views"))}
        {sortBtn(sort === "likes", t(locale, "sort.likes"), sortHref("likes"))}
        <span className="ml-auto text-xs text-zinc-600">
          {sort === "old" ? "↑ 旧 → 新" : sort === "views" ? "↓ 浏览量" : sort === "likes" ? "↓ 点赞数" : "↓ 新 → 旧"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prompts.map((p) => (
          <PromptCard
            key={p.id}
            locale={locale}
            p={{ ...p, sectionCount: (p.content.match(/^\[\d+\]/gm) || []).length }}
          />
        ))}
      </div>

      {prompts.length === 0 && (
        <p className="py-20 text-center text-zinc-500">
          {locale === "zh" ? "该类型下暂无提示词" : "No prompts of this type yet"}
        </p>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={`/type/${encodeURIComponent(type)}`}
          query={{ sort: sort !== "new" ? sort : undefined }}
        />
      )}
    </div>
  );
}
