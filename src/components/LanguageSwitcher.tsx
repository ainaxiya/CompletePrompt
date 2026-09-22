"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n-client";

// 导航栏语言下拉：简体中文 / English
export default function LanguageSwitcher() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const next = pathname + (sp.toString() ? `?${sp.toString()}` : "");

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const opts = [
    { code: "zh", label: "简体中文" },
    { code: "en", label: "English" },
  ] as const;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z" />
        </svg>
        <span className="hidden sm:inline">{locale === "zh" ? "中文" : "EN"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 min-w-[130px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
        >
          {opts.map((o) => (
            <li key={o.code}>
              <a
                href={`/api/lang?locale=${o.code}&next=${encodeURIComponent(next)}`}
                onClick={() => setOpen(false)}
                className={`block px-3.5 py-2 text-sm hover:bg-zinc-800 ${
                  locale === o.code ? "font-medium text-emerald-400" : "text-zinc-300"
                }`}
              >
                {o.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
