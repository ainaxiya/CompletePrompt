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
      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
        ok ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {ok ? t(locale, "btn.copied") : label || t(locale, "btn.copy")}
    </button>
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

  const toggle = async (kind: "like" | "favorite") => {
    const res = await fetch(`/api/prompts/${promptId}/${kind}`, { method: "POST" });
    if (res.status === 401) {
      location.href = "/login?next=/p/" + promptId;
      return;
    }
    const d = await res.json();
    if (kind === "like") {
      setLikes(d.count);
      setLiked(d.active);
    } else {
      setFaved(d.active);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => toggle("like")}
        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
          liked ? "bg-rose-500/20 text-rose-300" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        {liked ? "♥" : "♡"} {t(locale, "btn.like")} {likes}
      </button>
      <button
        onClick={() => toggle("favorite")}
        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
          faved ? "bg-amber-500/20 text-amber-300" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        {faved ? t(locale, "btn.favorited") : `☆ ${t(locale, "btn.favorite")}`}
      </button>
    </div>
  );
}
