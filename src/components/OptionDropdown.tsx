"use client";

// 全站 2~4 个少量选项的统一下拉选择器（风格与导航语言切换一致）
// 用于：状态切换、模式选择、注册字段三级选项等，替代零散的按钮组/原生 select

import { useEffect, useRef, useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  // 选项文字色调（不影响整体布局）
  tone?: "green" | "red" | "amber" | "indigo" | "zinc";
};

const TONE_TEXT: Record<string, string> = {
  green: "text-emerald-400",
  red: "text-rose-400",
  amber: "text-amber-400",
  indigo: "text-indigo-400",
  zinc: "text-zinc-300",
};
const TONE_DOT: Record<string, string> = {
  green: "bg-emerald-400",
  red: "bg-rose-400",
  amber: "bg-amber-400",
  indigo: "bg-indigo-400",
  zinc: "bg-zinc-400",
};

type Props = {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  align?: "left" | "right";
  className?: string;
};

export default function OptionDropdown({
  value,
  options,
  onChange,
  disabled = false,
  size = "sm",
  align = "left",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 font-medium transition hover:border-indigo-500 disabled:opacity-50 ${
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"
        } ${current ? TONE_TEXT[current.tone || "zinc"] : "text-zinc-300"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.tone && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[current.tone]}`} />}
        <span>{current?.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`h-3 w-3 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 py-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm hover:bg-zinc-800 ${
                  o.value === value ? "font-medium " + TONE_TEXT[o.tone || "zinc"] : "text-zinc-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  {o.tone && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[o.tone]}`} />}
                  {o.label}
                </span>
                {o.value === value && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-emerald-400">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
