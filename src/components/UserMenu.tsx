"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";

type Me =
  | {
      id: number;
      username: string;
      role?: string;
      membershipLevel?: string | null;
      membershipUntil?: string | null;
    }
  | null;

export default function UserMenu() {
  const locale = useLocale();
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <span className="w-10" />;

  // 未登录：图形按钮「注册登录」
  if (!me) {
    return (
      <Link
        href="/login?next=/member"
        className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300 sm:px-3"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
        </svg>
        <span className="hidden sm:inline">{t(locale, "nav.login")}</span>
      </Link>
    );
  }

  const memberActive =
    me.membershipLevel &&
    me.membershipLevel !== "free" &&
    (!me.membershipUntil || new Date(me.membershipUntil) > new Date());

  // 已登录：会员图标 + 账号名 → 会员中心
  return (
    <Link
      href="/member"
      title={t(locale, "nav.memberCenter")}
      className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
    >
      <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-royal-500/25 text-emerald-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
        </svg>
        {memberActive && (
          <span className="absolute -right-1 -top-1 text-[10px] leading-none text-amber-400">★</span>
        )}
      </span>
      <span className="max-w-[90px] truncate group-hover:text-emerald-300">{me.username}</span>
    </Link>
  );
}
