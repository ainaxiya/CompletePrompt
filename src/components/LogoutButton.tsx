"use client";

import { useRouter } from "next/navigation";
import { useLocale, translate as t } from "@/lib/i18n-client";
import { ADMIN_BASE } from "@/lib/admin-path";

// admin=true：清管理员 Cookie 并跳管理员登录页；否则清会员 Cookie 回首页
export default function LogoutButton({ admin = false }: { admin?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch(admin ? "/api/admin/auth/logout" : "/api/auth/logout", { method: "POST" });
        router.push(admin ? `${ADMIN_BASE}/login` : "/");
        router.refresh();
      }}
      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-rose-500 hover:text-rose-300"
    >
      {t(locale, "nav.logout")}
    </button>
  );
}
