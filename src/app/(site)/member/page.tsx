import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import PromptCard from "@/components/PromptCard";
import LogoutButton from "@/components/LogoutButton";
import { getServerLocale, translate as t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "会员中心" };

const STATUS_BADGE: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  pending: "bg-amber-500/15 text-amber-300",
  rejected: "bg-rose-500/15 text-rose-300",
  draft: "bg-zinc-700 text-zinc-300",
};
const STATUS_TEXT: Record<string, string> = {
  published: "已发布",
  pending: "审核中",
  rejected: "已驳回",
  draft: "草稿",
};

export default async function MemberPage() {
  const locale = await getServerLocale();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/member");

  const [myPosts, favs, postCount, favCount, agg] = await Promise.all([
    db.prompt.findMany({
      where: { userId: user.id },
      orderBy: { id: "desc" },
      take: 10,
      select: {
        id: true, title: true, status: true, likeCount: true, viewCount: true,
        createdAt: true, category: true, rejectReason: true,
      },
    }),
    db.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        prompt: {
          select: {
            id: true, title: true, type: true, category: true, tags: true,
            sourceAuthor: true, likeCount: true, content: true,
            coverUrl: true, featured: true, status: true,
          },
        },
      },
    }),
    db.prompt.count({ where: { userId: user.id } }),
    db.favorite.count({ where: { userId: user.id } }),
    db.prompt.aggregate({ where: { userId: user.id }, _sum: { likeCount: true } }),
  ]);

  const stat = (label: string, value: number | string) => (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center sm:p-4">
      <div className="truncate text-lg font-bold text-emerald-400 sm:text-xl">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500 sm:text-xs">{label}</div>
    </div>
  );

  return (
    <div className="max-w-4xl">
      {/* 账号卡片 */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-royal-500/25 text-3xl text-emerald-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold text-zinc-50">{user.username}</h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {t(locale, "member.memberSince")}：{user.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href="/publish"
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-zinc-950 hover:bg-emerald-400 sm:flex-none">
            + {t(locale, "nav.publish")}
          </Link>
          <span className="flex-1 [&>button]:w-full sm:flex-none"><LogoutButton /></span>
        </div>
      </div>

      {/* 统计 */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        {stat(t(locale, "member.myPosts"), postCount)}
        {stat(t(locale, "member.myFavs"), favCount)}
        {stat(t(locale, "member.likesGot"), agg._sum.likeCount ?? 0)}
      </div>

      {/* 我的发布 */}
      <h2 className="mb-3 text-base font-semibold text-zinc-200">{t(locale, "member.myPosts")}</h2>
      <div className="mb-8 overflow-hidden rounded-xl border border-zinc-800">
        {myPosts.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            {t(locale, "member.noPosts")}　
            <Link href="/publish" className="text-emerald-400 hover:underline">
              {t(locale, "member.goPublish")}
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-800/70">
              {myPosts.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2.5">
                    <Link href={`/p/${p.id}`} className="text-zinc-200 hover:text-emerald-300">
                      {p.title}
                    </Link>
                    {p.status === "rejected" && p.rejectReason && (
                      <p className="mt-0.5 text-xs text-rose-400">{p.rejectReason}</p>
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-zinc-500 sm:table-cell">{p.category}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-500">♥ {p.likeCount} · 👁 {p.viewCount}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[p.status]}`}>
                      {STATUS_TEXT[p.status] || p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 我的收藏 */}
      <h2 className="mb-3 text-base font-semibold text-zinc-200">{t(locale, "member.myFavs")}</h2>
      {favs.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          {t(locale, "member.noFavs")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {favs
            .filter((f) => f.prompt.status === "published")
            .map((f) => (
              <PromptCard
                key={f.prompt.id}
                locale={locale}
                p={{
                  id: f.prompt.id,
                  title: f.prompt.title,
                  type: f.prompt.type,
                  category: f.prompt.category,
                  tags: f.prompt.tags,
                  sourceAuthor: f.prompt.sourceAuthor,
                  likeCount: f.prompt.likeCount,
                  coverUrl: f.prompt.coverUrl,
                  featured: f.prompt.featured,
                  content: f.prompt.content,
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
}
