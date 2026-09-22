"use client";

import { useRouter } from "next/navigation";
import { useLocale, translate as t } from "@/lib/i18n-client";

export default function LogoutButton() {
  const locale = useLocale();
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-rose-500 hover:text-rose-300"
    >
      {t(locale, "nav.logout")}
    </button>
  );
}
