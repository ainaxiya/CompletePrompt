import Link from "next/link";
import { db } from "@/lib/db";
import { ADMIN_BASE } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

export const metadata = { title: "管理后台 · 仪表盘" };

export default async function AdminHome() {
  const [total, published, pending, rejected, users, today, pendingList, mediaCount] =
    await Promise.all([
      db.prompt.count(),
      db.prompt.count({ where: { status: "published" } }),
      db.prompt.count({ where: { status: "pending" } }),
      db.prompt.count({ where: { status: "rejected" } }),
      db.user.count(),
      db.prompt.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
      db.prompt.findMany({
        where: { status: "pending" },
        orderBy: { id: "desc" },
        take: 8,
        include: { user: { select: { username: true } } },
      }),
      db.prompt.count({ where: { NOT: [{ media: { equals: [] } }] } }),
    ]);

  const cards = [
    { label: "提示词总数", value: total, href: `${ADMIN_BASE}/prompts`, cls: "text-emerald-400" },
    { label: "已发布", value: published, href: `${ADMIN_BASE}/prompts?status=published`, cls: "text-sky-400" },
    { label: "待审核", value: pending, href: `${ADMIN_BASE}/prompts?status=pending`, cls: "text-amber-400" },
    { label: "已驳回", value: rejected, href: `${ADMIN_BASE}/prompts?status=rejected`, cls: "text-rose-400" },
    { label: "注册用户", value: users, href: `${ADMIN_BASE}/users`, cls: "text-violet-400" },
    { label: "24h 新发布", value: today, href: `${ADMIN_BASE}/prompts`, cls: "text-fuchsia-400" },
  ];

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">仪表盘</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-700/50"
          >
            <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="mt-1 text-xs text-zinc-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">
          待审核提示词 {pending > 0 && <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">{pending}</span>}
        </h2>
        {pendingList.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-600">暂无待审核内容</p>
        ) : (
          <div className="divide-y divide-zinc-800/70">
            {pendingList.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">{p.category}</span>
                <Link href={`/p/${p.id}`} target="_blank" className="flex-1 truncate text-zinc-200 hover:text-emerald-300">
                  {p.title}
                </Link>
                <span className="text-xs text-zinc-500">{p.user.username}</span>
                <Link href={`${ADMIN_BASE}/prompts?status=pending`} className="text-xs text-amber-400 hover:underline">
                  去审核
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
