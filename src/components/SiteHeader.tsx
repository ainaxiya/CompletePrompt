"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";
import LanguageSwitcher from "./LanguageSwitcher";
import UserMenu from "./UserMenu";

function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 3s4.5 4 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 11 9 9.5 9.5 8.5 10.5 10 12 9.5 12 3z" />
          <path d="M9.5 16.5c0 2 1.1 3.5 2.5 3.5s2.5-1.5 2.5-3.5c0-1.3-.8-2.2-1.5-3-.3.8-1 1-1.5.5-.5.8-2 1.2-2 2.5z" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function SiteHeader({
  siteName,
  logoIcon = "/logo/icon.png",
}: {
  siteName: string;
  logoIcon?: string;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileSearch, setMobileSearch] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearch) inputRef.current?.focus();
  }, [mobileSearch]);

  // 路由变化时收起移动端搜索
  useEffect(() => {
    setMobileSearch(false);
  }, [pathname]);

  // 同步 <html lang>
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const navItem = (href: string, icon: string, label: string, exact = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
          active ? "bg-zinc-800 font-medium text-emerald-300" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
        }`}
      >
        <Icon name={icon} />
        <span className="hidden md:inline">{label}</span>
      </Link>
    );
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = q.trim();
    if (!kw) return;
    router.push(`/search?q=${encodeURIComponent(kw)}`);
  };

  const searchBox = (big: boolean) => (
    <form onSubmit={submitSearch} role="search" className={big ? "mx-auto w-full max-w-2xl" : "w-full"}>
      <div
        className={`group flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 pr-1.5 transition focus-within:border-emerald-500 focus-within:shadow-[0_0_0_3px_rgba(194,145,59,0.16)] ${
          big ? "px-5 py-2.5" : "px-4 py-2"
        }`}
      >
        <Icon name="search" className={big ? "h-5 w-5 shrink-0 text-zinc-500" : "h-4 w-4 shrink-0 text-zinc-500"} />
        <input
          ref={big ? undefined : inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(locale, "search.placeholder")}
          aria-label={t(locale, "search.button")}
          className={`w-full bg-transparent text-zinc-100 placeholder:text-zinc-500 outline-none ${
            big ? "text-sm" : "text-sm"
          }`}
        />
        <button
          type="submit"
          className={`flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 font-medium text-zinc-950 transition hover:bg-emerald-400 ${
            big ? "px-5 py-2 text-sm" : "px-3.5 py-1.5 text-xs"
          }`}
        >
          <Icon name="search" className="h-4 w-4" />
          <span className="hidden sm:inline">{t(locale, "search.button")}</span>
        </button>
      </div>
    </form>
  );

  return (
    <header className="site-header sticky top-0 z-50 border-b border-zinc-800/70 bg-zinc-950/95 backdrop-blur-md">
      {/* 第一行：导航栏 */}
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link href="/" className="mr-1 flex shrink-0 items-center gap-2" aria-label={siteName}>
          {/* 灯泡品牌图标（后台可在网站设置中替换） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoIcon} alt={siteName} className="h-8 w-8 rounded-lg object-cover" />
          {/* 站点名：桌面端显示，移动端只留图标 */}
          <span className="hidden text-base font-semibold tracking-wide text-zinc-100 sm:inline">
            {siteName}
          </span>
        </Link>

        {/* 手机端导航由底部 MobileTabBar 承接，<md 整块隐藏 */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItem("/", "home", t(locale, "nav.home"), true)}
          {navItem("/hot", "flame", t(locale, "nav.hot"))}
          {navItem("/categories", "grid", t(locale, "nav.categories"))}
          <Link
            href="/publish"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
              pathname === "/publish"
                ? "bg-emerald-600 text-zinc-50"
                : "bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600 hover:text-zinc-50"
            }`}
          >
            <Icon name="plus" />
            <span className="hidden md:inline">{t(locale, "nav.publish")}</span>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {/* 移动端搜索切换 */}
          <button
            type="button"
            onClick={() => setMobileSearch((v) => !v)}
            aria-label={t(locale, "search.button")}
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white sm:hidden"
          >
            <Icon name="search" className="h-5 w-5" />
          </button>
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <UserMenu />
        </div>
      </div>

      {/* 第二行：大搜索栏（桌面常驻；移动端展开式） */}
      <div className="hidden bg-zinc-950/60 px-4 py-3 sm:block">
        <div className="mx-auto max-w-6xl">{searchBox(true)}</div>
      </div>
      {mobileSearch && (
        <div className="bg-zinc-950/60 px-3 py-3 sm:hidden">{searchBox(false)}</div>
      )}
    </header>
  );
}
