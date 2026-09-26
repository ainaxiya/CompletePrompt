"use client";

import { useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const locale = useLocale();
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition ${
        ok ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {ok ? t(locale, "btn.copied") : label || t(locale, "btn.copy")}
    </button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 11 6.1c.4.4.7.8 1 1.3.3-.5.6-.9 1-1.3a4.6 4.6 0 0 1 6.5 6.5z" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.8l-5.25 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

export function ActionButtons({
  promptId,
  initialLikes,
  initialLiked,
  initialFaved,
}: {
  promptId: number;
  initialLikes: number;
  initialLiked: boolean;
  initialFaved: boolean;
}) {
  const locale = useLocale();
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialLiked);
  const [faved, setFaved] = useState(initialFaved);
  const [busy, setBusy] = useState<"like" | "favorite" | null>(null);

  const toggle = async (kind: "like" | "favorite") => {
    if (busy) return;
    setBusy(kind);
    try {
      const res = await fetch(`/api/prompts/${promptId}/${kind}`, { method: "POST" });
      if (res.status === 401) {
        location.href = "/login?next=/p/" + promptId;
        return;
      }
      const d = await res.json();
      if (!res.ok) return;
      if (kind === "like") {
        setLikes(d.count);
        setLiked(d.active);
      } else {
        setFaved(d.active);
      }
    } catch {
      // 网络错误静默，保留原状态
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        onClick={() => toggle("like")}
        disabled={!!busy}
        aria-pressed={liked}
        className={`group inline-flex items-center gap-2 rounded-full border py-2 pl-3.5 pr-4 text-sm font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
          liked
            ? "border-rose-400/40 bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-lg shadow-rose-500/25"
            : "border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:border-rose-500/50 hover:text-rose-300"
        }`}
      >
        <HeartIcon filled={liked} />
        <span>{t(locale, "btn.like")}</span>
        <span
          key={likes}
          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs leading-none ${
            liked ? "btn-pop bg-white/20 text-white" : "bg-zinc-700/80 text-zinc-300 group-hover:bg-zinc-700"
          }`}
        >
          {likes}
        </span>
      </button>

      <button
        onClick={() => toggle("favorite")}
        disabled={!!busy}
        aria-pressed={faved}
        className={`group inline-flex items-center gap-2 rounded-full border py-2 pl-3.5 pr-4 text-sm font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
          faved
            ? "border-amber-400/40 bg-gradient-to-r from-amber-500 to-amber-400 text-zinc-950 shadow-lg shadow-amber-500/25"
            : "border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
        }`}
      >
        <StarIcon filled={faved} />
        <span>{faved ? t(locale, "btn.favorited").replace(/^★\s*/, "") : t(locale, "btn.favorite")}</span>
      </button>
    </div>
  );
}
