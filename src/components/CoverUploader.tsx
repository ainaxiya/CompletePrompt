"use client";

import { useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";
import UniversalUploader, { type UploadedFile } from "@/components/UniversalUploader";

// 封面图：单图上传（拖拽/点击）/ 外链 / 移除；为空时服务端自动从内容提取
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
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");

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
        <>
          <UniversalUploader
            multiple={false}
            accept="image"
            compact
            maxImageMB={maxImageMB}
            hint={t(locale, "publish.upload")}
            onUploaded={(files: UploadedFile[]) => files[0] && onChange(files[0].url)}
            onRejected={() => setErr(t(locale, "publish.uploadFail", { msg: `>${maxImageMB}MB` }))}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
        </>
      )}
      {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}
    </div>
  );
}
