"use client";

import { useState } from "react";
import { mediaFromUrl, type MediaItem } from "@/lib/media";
import { useLocale, translate as t } from "@/lib/i18n-client";
import UniversalUploader, { type UploadedFile } from "@/components/UniversalUploader";

export default function MediaUploader({
  media,
  onChange,
  max = 9,
  maxImageMB = 10,
  maxVideoMB = 100,
}: {
  media: MediaItem[];
  onChange: (m: MediaItem[]) => void;
  max?: number;
  maxImageMB?: number;
  maxVideoMB?: number;
}) {
  const locale = useLocale();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const add = (item: MediaItem) => {
    if (media.length >= max) return;
    if (media.some((m) => m.url === item.url)) return;
    onChange([...media, item]);
  };
  const remove = (u: string) => onChange(media.filter((m) => m.url !== u));

  // 批量上传：每个文件成功后逐个入库（失败文件由 UniversalUploader 内部展示并重试）
  const handleUploaded = (files: UploadedFile[]) => {
    const next = [...media];
    for (const f of files) {
      if (next.length >= max) break;
      if (next.some((m) => m.url === f.url)) continue;
      next.push({ type: f.type, url: f.url });
    }
    onChange(next);
    flash("ok", t(locale, "publish.uploadOk"));
  };

  const addEmbed = () => {
    const item = mediaFromUrl(url);
    if (!item) {
      flash("err", t(locale, "publish.embedFail"));
      return;
    }
    add(item);
    setUrl("");
  };

  const slotsLeft = max - media.length;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <UniversalUploader
        multiple
        accept="all"
        maxFiles={slotsLeft}
        maxImageMB={maxImageMB}
        maxVideoMB={maxVideoMB}
        disabled={slotsLeft <= 0}
        onUploaded={handleUploaded}
        onRejected={() => flash("err", t(locale, "publish.dropReject"))}
      />

      <div className="mt-2 flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmbed())}
          placeholder={t(locale, "publish.embed")}
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={addEmbed}
          disabled={!url || media.length >= max}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
        >
          {t(locale, "publish.addLink")}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>
      )}

      {media.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((m) => (
            <div key={m.url} className="group relative overflow-hidden rounded-md border border-zinc-700 bg-black">
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="h-20 w-full object-cover" />
              ) : (
                <div className="flex h-20 w-full items-center justify-center text-xs text-zinc-400">
                  {m.type === "video" ? "▶ Video" : "</> Embed"}
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(m.url)}
                className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-rose-300 opacity-0 transition group-hover:opacity-100"
              >
                {t(locale, "publish.remove")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
