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

// 无封面时的文字封面：用内容摘要填充，避免整页都是空占位
export function TextCover({ text, type = "text" }: { text: string; type?: string }) {
  const tint =
    type === "video"
      ? "from-sky-500/15"
      : type === "image"
        ? "from-rose-500/15"
        : type === "audio"
          ? "from-amber-500/15"
          : "from-emerald-500/15";
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br ${tint} via-zinc-900 to-zinc-950 p-3.5 text-left`}
    >
      {/* 装饰光晕 */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-500/10 blur-2xl" />
      {/* 大号引号水印 */}
      <span className="pointer-events-none select-none self-end font-serif text-5xl leading-none text-zinc-700/40">
        ”
      </span>
      <p className="line-clamp-3 text-[13px] leading-relaxed text-zinc-300/90">
        {text}
      </p>
      {/* 底部灵感星芒点缀，呼应站点 LOGO */}
      <span className="pointer-events-none absolute bottom-2.5 left-3.5 inline-block h-2 w-2 rounded-full bg-gradient-to-tr from-emerald-400 to-royal-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
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
