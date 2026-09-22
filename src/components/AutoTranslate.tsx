"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";
import { queuedTranslate } from "@/lib/translateQueue";
import { CopyButton } from "./Buttons";

// 自动翻译框：源语言 === 站点语言时不渲染；
// 进入视口后懒翻译（服务端带 DB 缓存，命中缓存几乎瞬时）。
export default function AutoTranslate({
  text,
  source,
  index,
}: {
  text: string;
  source: "zh" | "en";
  index: number;
}) {
  // 挂载前固定 zh，与 SSR 一致，避免 hydration mismatch
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [out, setOut] = useState("");
  const reqId = useRef(0);

  useEffect(() => {
    if (source === locale) return;
    const el = ref.current;
    if (!el) return;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const id = ++reqId.current;
      setState("loading");
      queuedTranslate({ text, target: locale, source })
        .then((d) => {
          if (id !== reqId.current) return;
          if (d.skipped || d.error || !d.translated) {
            setState(d.skipped ? "idle" : "error");
            return;
          }
          setOut(d.translated);
          setState("done");
        })
        .catch(() => {
          if (id === reqId.current) setState("error");
        });
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [locale, source, text]);

  // 挂载完成且同语言：整个翻译框不显示
  if (source === locale) return null;

  const boxLabel = locale === "zh" ? "自动翻译" : "Auto translation";

  return (
    <div ref={ref} className="mt-2 rounded-lg border border-dashed border-emerald-700/60 bg-emerald-950/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 5h7M9 3v2c0 4.4-2.7 8.5-7 10" />
            <path d="M5 9c0 2.4 2.3 4.8 5.5 6M12 20l4-9 4 9M13.5 17h5" />
          </svg>
          {boxLabel}
        </h4>
        {state === "done" && <CopyButton text={out} />}
      </div>
      {state === "idle" || state === "loading" ? (
        <p className="text-xs text-zinc-500">{t(locale, "detail.translating")}</p>
      ) : state === "error" ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-rose-400">{t(locale, "detail.translateFail")}</span>
        </div>
      ) : (
        <p className="prompt-content whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{out}</p>
      )}
    </div>
  );
}
