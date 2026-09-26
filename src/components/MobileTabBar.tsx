"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, translate as t } from "@/lib/i18n-client";

// 手机端底部标签栏：仅 <md(768px) 显示；4 个标签 首页/热门/分类/我的
// 未登录点「我的」由 /member 自身重定向到 /login?next=/member
function TabIcon({ name, className = "h-[22px] w-[22px]" }: { name: string; className?: string }) {
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
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function MobileTabBar() {
  const locale = useLocale();
  const pathname = usePathname();

  const tabs = [
    { href: "/", icon: "home", label: t(locale, "nav.home"), exact: true },
    { href: "/hot", icon: "flame", label: t(locale, "nav.hot"), exact: false },
    { href: "/categories", icon: "grid", label: t(locale, "nav.categories"), exact: false },
    { href: "/member", icon: "user", label: t(locale, "nav.memberCenter"), exact: false },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={locale === "zh" ? "移动端主导航" : "Mobile primary navigation"}
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
              active ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <TabIcon name={tab.icon} />
            <span className="text-[10px] leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
