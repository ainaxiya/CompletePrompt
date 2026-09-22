import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PromptCard from "@/components/PromptCard";
import CategoryIcon from "@/components/CategoryIcon";
import { getCategoryMeta, categoryDesc } from "@/lib/category-meta";
import { getServerLocale, translate as t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: decodeURIComponent(slug) };
}

export default async function CategoryDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const locale = await getServerLocale();
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const sp = await searchParams;

  const cat = await db.category.findUnique({ where: { slug } });
  if (!cat) notFound();

  const meta = getCategoryMeta(slug);
  const sortRaw = sp.sort || "new";
  // new=最新降序(默认) old=最旧升序 views=浏览量 likes=点赞
  const sort = ["new", "old", "views", "likes"].includes(sortRaw) ? sortRaw : "new";
  const page = Math.max(1, parseInt(sp.page || "1") || 1);

  const where = { status: "published" as const, category: slug };
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
        sourceAuthor: true, likeCount: true, content: true,
        coverUrl: true, featured: true,
      },
    }),
    db.prompt.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const name = locale === "zh" ? cat.name : cat.nameEn;

  const sortHref = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "new") p.set("sort", k);
    p.set("page", "1");
    const qs = p.toString();
    return `/category/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (sort !== "new") p.set("sort", sort);
    p.set("page", String(n));
    return `/category/${encodeURIComponent(slug)}?${p.toString()}`;
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
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${meta.bg} ${meta.fg}`}>
          <CategoryIcon icon={meta.icon} className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-zinc-50">{name}</h1>
          <p className="mt-1 text-sm text-zinc-400">{categoryDesc(slug, locale)}</p>
          <p className="mt-1 text-xs text-zinc-600">{t(locale, "cat.count", { n: total })}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {/* 最新：再点一次切换为正序（旧→新） */}
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
          {locale === "zh" ? "该分类下暂无提示词" : "No prompts in this category yet"}
        </p>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
              {t(locale, "common.prev")}
            </Link>
          )}
          <span className="px-3 text-sm text-zinc-400">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
              {t(locale, "common.next")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
