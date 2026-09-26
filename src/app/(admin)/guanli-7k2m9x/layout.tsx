import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_BASE } from "@/lib/admin-path";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "管理后台" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) {
    redirect(`${ADMIN_BASE}/login?next=${encodeURIComponent(ADMIN_BASE)}`);
  }

  const nav: { href: string; label: string; icon: string; superOnly?: boolean }[] = [
    { href: ADMIN_BASE, label: "仪表盘", icon: "📊" },
    { href: `${ADMIN_BASE}/prompts`, label: "提示词管理", icon: "📝" },
    { href: `${ADMIN_BASE}/categories`, label: "分类管理", icon: "🗂️" },
    { href: `${ADMIN_BASE}/users`, label: "用户管理", icon: "👥" },
    { href: `${ADMIN_BASE}/comments`, label: "评论管理", icon: "💬" },
    { href: `${ADMIN_BASE}/roles`, label: "角色权限", icon: "🔑", superOnly: false },
    { href: `${ADMIN_BASE}/logs`, label: "操作日志", icon: "📋" },
    { href: `${ADMIN_BASE}/settings/publish`, label: "发布设置", icon: "📤" },
    { href: `${ADMIN_BASE}/settings/membership`, label: "注册设置", icon: "🧾" },
    { href: `${ADMIN_BASE}/settings/site`, label: "网站设置", icon: "🌐" },
  ];
  // 管理员设置仅超级管理员可见（评论管理插入后索引后移一位）
  if (admin.isSuper) {
    nav.splice(6, 0, { href: `${ADMIN_BASE}/admins`, label: "管理员设置", icon: "🛡️", superOnly: true });
  }

  return (
    <div
      className="grid min-h-screen grid-cols-1 lg:grid-cols-[210px_1fr]"
      style={{
        backgroundImage:
          "radial-gradient(1000px 600px at 110% -10%, rgba(99,102,241,0.12), transparent 60%), radial-gradient(800px 600px at -20% 110%, rgba(139,92,246,0.08), transparent 60%)",
      }}
    >
      <aside className="border-b border-zinc-800/80 bg-[#0b0f29]/85 px-3 py-5 backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/icon.png" alt="完整提示词" className="h-7 w-7 rounded-md object-cover" />
          <span className="text-base font-bold tracking-wide text-gold-gradient">完整提示词</span>
          <span className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-[10px] tracking-widest text-emerald-400">
            ADMIN
          </span>
        </div>
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-emerald-800/60 hover:text-white"
            >
              <span>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 hidden border-t border-zinc-800/80 pt-4 text-xs text-zinc-500 lg:block">
          <Link href="/" className="px-2 hover:text-emerald-400">← 返回前台</Link>
          <p className="mt-3 px-2 leading-relaxed">
            管理员：{admin.nickname || admin.username}
            {admin.isSuper && (
              <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                超管
              </span>
            )}
          </p>
          <div className="mt-3 px-2">
            <LogoutButton admin />
          </div>
          <div className="mt-4 flex items-center gap-2 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/icon.png" alt="完整提示词" className="h-5 w-5 rounded object-cover opacity-80" />
            <span className="text-[10px] tracking-widest text-zinc-600">FULL PROMPT</span>
          </div>
        </div>
      </aside>
      <div className="min-w-0 p-4 lg:p-7">{children}</div>
    </div>
  );
}
