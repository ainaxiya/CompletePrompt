import Link from "next/link";
import { db } from "@/lib/db";
import PromptCard from "@/components/PromptCard";
import { getServerLocale, translate as t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// 首页为精选流：精华内容置顶，高赞/高浏览补足，不分页
const HOME_TAKE = 30;

export default async function Home() {
  const locale = await getServerLocale();

  const prompts = await db.prompt.findMany({
    where: { status: "published" },
    orderBy: [
      { featured: "desc" },
      { likeCount: "desc" },
      { viewCount: "desc" },
      { id: "desc" },
    ],
    take: HOME_TAKE,
    select: {
      id: true, title: true, type: true, category: true, tags: true,
      sourceAuthor: true, likeCount: true, content: true, description: true,
      coverUrl: true, featured: true,
    },
  });

  return (
    <div>
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-emerald-700/40 bg-zinc-900/70 px-6 py-10 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -top-20 right-1/4 h-40 w-72 rounded-full bg-royal-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/70 to-royal-400/50 to-transparent" />
        <h1 className="relative flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-zinc-50">
          <span className="text-royal-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]">★</span>
          {t(locale, "home.featured")}
        </h1>
        <p className="relative mt-2 text-sm text-zinc-400">{t(locale, "home.featuredSub")}</p>
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
          {locale === "zh" ? "暂无内容" : "Nothing here yet"}
        </p>
      )}

      <div className="mt-10 flex justify-center">
        <Link
          href="/categories"
          className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-8 py-3 text-sm font-medium text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300"
        >
          {t(locale, "home.viewAll")}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
