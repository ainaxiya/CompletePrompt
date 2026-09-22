"use client";

import { useRef, useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";

// 封面图：单图上传 / 外链 / 移除；为空时服务端自动从内容提取
export default function CoverUploader({
  value,
  onChange,
  maxImageMB = 10,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  maxImageMB?: number;
}) {
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upload = async (file: File) => {
    setErr("");
    if (file.size > maxImageMB * 1024 * 1024) {
      setErr(`图片不能超过 ${maxImageMB}MB`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "上传失败");
        return;
      }
      onChange(d.url);
    } catch {
      setErr("上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="cover" className="max-h-48 rounded-lg border border-zinc-700" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs text-white hover:bg-rose-500"
            title={t(locale, "publish.remove")}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700 disabled:opacity-50"
          >
            {busy ? t(locale, "publish.uploading") : t(locale, "publish.upload")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => {
              if (/^(https?:\/\/|\/)/.test(url)) {
                onChange(url.trim());
                setUrl("");
              }
            }}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
          >
            {t(locale, "publish.addLink")}
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}
    </div>
  );
}
