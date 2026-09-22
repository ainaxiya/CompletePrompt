"use client";

import { useRef, useState } from "react";
import { mediaFromUrl, type MediaItem } from "@/lib/media";
import { useLocale, translate as t } from "@/lib/i18n-client";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
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

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");
    if (!isImg && !isVid) {
      flash("err", t(locale, "publish.uploadFail", { msg: "unsupported" }));
      return;
    }
    const limit = isImg ? maxImageMB : maxVideoMB;
    if (file.size > limit * 1024 * 1024) {
      flash("err", t(locale, "publish.uploadFail", { msg: `>${limit}MB` }));
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "fail");
      add({ type: d.type, url: d.url });
      flash("ok", t(locale, "publish.uploadOk"));
    } catch (err: any) {
      flash("err", t(locale, "publish.uploadFail", { msg: err.message }));
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || media.length >= max}
          className="rounded-lg border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-40"
        >
          {busy ? t(locale, "publish.uploading") : `↑ ${t(locale, "publish.upload")}`}
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={pick} />
        <div className="flex flex-1 items-center gap-2">
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
