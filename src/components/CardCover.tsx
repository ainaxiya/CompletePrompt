"use client";

import { useState, type ReactNode } from "react";

// 卡片封面：加载失败时回退到文字封面/深蓝占位（避免外链失效出现黑块）
export default function CardCover({
  src,
  title,
  fallback,
}: {
  src: string;
  title: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback ?? <Placeholder />}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
    />
  );
}

// 无封面时的文字封面：大字摘要填充，视觉上接近一张排版图
export function TextCover({ text, type = "text" }: { text: string; type?: string }) {
  const tint =
    type === "video"
      ? "from-sky-500/20"
      : type === "image"
        ? "from-rose-500/20"
        : type === "audio"
          ? "from-amber-500/20"
          : "from-emerald-500/20";
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${tint} via-zinc-900 to-zinc-950 px-5 py-4 text-center`}
    >
      {/* 装饰光晕 */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
      {/* 大字摘要：衬线字体更有"海报字"质感 */}
      <p
        className="line-clamp-3 font-serif text-[28px] font-semibold leading-snug tracking-wide text-zinc-100/95"
        style={{ textShadow: "0 2px 14px rgba(0,0,0,0.45)" }}
      >
        {text}
      </p>
    </div>
  );
}

export function Placeholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15),transparent_60%)] text-zinc-500">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 15.5l4.5-4.5 4 4 3-3 5.5 5.5" />
        <circle cx="8.5" cy="9" r="1.4" />
      </svg>
    </div>
  );
}
