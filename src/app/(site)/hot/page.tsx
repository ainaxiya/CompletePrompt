import Link from "next/link";
import { db } from "@/lib/db";
import PromptCard from "@/components/PromptCard";
import { getServerLocale, translate as t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "热门推荐" };

const PAGE_SIZE = 24;

export default async function HotPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const locale = await getServerLocale();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1") || 1);

  const where = { status: "published" as const };
  const orderBy = [
    { likeCount: "desc" as const },
    { viewCount: "desc" as const },
    { id: "desc" as const },
  ];

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
  const pageHref = (n: number) => `/hot?page=${n}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <span className="text-orange-400">🔥</span>
          {t(locale, "hot.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">{t(locale, "hot.sub")}</p>
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
