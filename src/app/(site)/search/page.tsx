import Link from "next/link";
import { searchPrompts } from "@/lib/meili";
import PromptCard from "@/components/PromptCard";
import { getServerLocale, translate as t } from "@/lib/i18n";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "搜索 / Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; page?: string; type?: string; category?: string; sort?: string;
  }>;
}) {
  const locale = await getServerLocale();
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const page = Math.max(1, parseInt(sp.page || "1") || 1);
  const type = sp.type || "";
  const category = sp.category || "";
  const sort = sp.sort || "";

  const dbCats = await db.category.findMany({
    orderBy: { sort: "asc" },
    select: { slug: true, name: true, nameEn: true },
  });
  const CATS = dbCats.map((c) => ({ key: c.slug, zh: c.name, en: c.nameEn }));

  let hits: any[] = [];
  let total = 0;
  let error = "";
  if (q) {
    try {
      const res = await searchPrompts(q, { page, type, category, sort });
      hits = res.hits;
      total = res.totalHits ?? 0;
    } catch (e: any) {
      error = t(locale, "search.engineDown", { msg: e?.message || e });
    }
  }

  const qs = (over: Record<string, string | number>) => {
    const base: Record<string, string> = { q };
    if (type) base.type = type;
    if (category) base.category = category;
    if (sort) base.sort = sort;
    base.page = String(page);
    for (const [k, v] of Object.entries(over)) base[k] = String(v);
    return "/search?" + new URLSearchParams(base).toString();
  };
  const totalPages = Math.ceil(total / 24);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-semibold">
          {q ? `“${q}”` : t(locale, "search.title")}
        </h1>
        {q && <span className="text-xs text-zinc-500">{t(locale, "search.results", { n: total })}</span>}
        <div className="ml-auto flex gap-2 text-sm">
          {[
            { k: "", lk: "sort.relevance" as const },
            { k: "likes", lk: "sort.likes" as const },
            { k: "new", lk: "sort.new" as const },
          ].map((s) => (
            <Link key={s.k} href={qs({ sort: s.k, page: 1 })}
              className={sort === s.k ? "font-medium text-emerald-400" : "text-zinc-400 hover:text-zinc-200"}>
              {t(locale, s.lk)}
            </Link>
          ))}
        </div>
      </div>

      {q && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">{locale === "zh" ? "分类：" : "Category: "}</span>
          <Link href={qs({ category: "", page: 1 })}
            className={`rounded px-2 py-0.5 text-xs ${!category ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            {t(locale, "cat.all")}
          </Link>
          {CATS.map((c) => (
            <Link key={c.key} href={qs({ category: c.key, page: 1 })}
              className={`rounded px-2 py-0.5 text-xs ${category === c.key ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
              {c[locale]}
            </Link>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      {!q && <p className="py-20 text-center text-zinc-500">{t(locale, "search.empty")}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hits.map((h) => (
          <PromptCard
            key={h.id}
            locale={locale}
            p={{
              id: h.id, title: h.title, type: h.type, category: h.category,
              tags: h.tags || [], sourceAuthor: h.sourceAuthor, likeCount: h.likeCount ?? 0,
              coverUrl: h.coverUrl || null, featured: !!h.featured,
            }}
          />
        ))}
      </div>

      {q && hits.length === 0 && !error && (
        <p className="py-20 text-center text-zinc-500">{t(locale, "search.noresult")}</p>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && <Link href={qs({ page: page - 1 })} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">{t(locale, "common.prev")}</Link>}
          <span className="px-3 text-sm text-zinc-400">{page} / {totalPages}</span>
          {page < totalPages && <Link href={qs({ page: page + 1 })} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">{t(locale, "common.next")}</Link>}
        </div>
      )}
    </div>
  );
}
