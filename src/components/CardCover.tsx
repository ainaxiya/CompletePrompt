"use client";

import { useState } from "react";

// 卡片封面：加载失败时回退到深蓝占位（避免外链失效出现黑块）
export default function CardCover({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Placeholder />;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
    </>
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
