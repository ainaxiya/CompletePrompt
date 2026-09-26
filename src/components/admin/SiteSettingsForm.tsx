"use client";

import { useState } from "react";

type SiteData = {
  siteName: string;
  siteNameEn: string;
  siteDescription: string;
  searchKeywords: string;
  footerText: string;
  logoIcon: string;
  favicon: string;
  appIcon: string;
  meiliSyncSeconds: number;
};

type Props = { initial: SiteData };

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const labelCls = "mb-1 block text-sm text-zinc-400";
const cardCls = "rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-4";

const UPLOAD_FILES = [
  { key: "logoIcon" as const, filename: "logo-icon-120.png", label: "站点 LOGO", hint: "120×120 PNG" },
  { key: "favicon" as const, filename: "favicon.ico", label: "Favicon", hint: "ICO / PNG" },
  { key: "appIcon" as const, filename: "app-icon.png", label: "App 图标", hint: "512×512 PNG" },
];

export default function SiteSettingsForm({ initial }: Props) {
  const [f, setF] = useState<SiteData>(initial);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const set = (k: keyof SiteData, v: any) => setF({ ...f, [k]: v });

  const save = async (override?: Partial<SiteData>) => {
    const data: SiteData = { ...f, ...override };
    setBusy(true);
    try {
      const r = await fetch("/api/admin/settings/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "保存失败");
      }
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 浏览器侧实际加载一次图片 URL，杜绝"接口 200 但文件 404"的假成功
  const probeImage = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("文件已保存到服务器，但返回的图片地址无法访问（HTTP 404），请重新部署后再试"));
      img.src = url;
    });

  const upload = async (key: (typeof UPLOAD_FILES)[number]["key"], filename: string, file: File) => {
    setUploading(key);
    try {
      if (file.size > 2 * 1024 * 1024) {
        alert("文件大小不能超过 2MB");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("filename", filename);
      const r = await fetch("/api/admin/settings/upload", { method: "POST", body: fd });
      // 容错：服务端异常时可能返回空响应体或 HTML（如 Nginx 413），不能直接 r.json()
      const text = await r.text();
      let d: any = null;
      try {
        d = text ? JSON.parse(text) : null;
      } catch {
        d = null;
      }
      if (!r.ok || !d) {
        const hint =
          r.status === 413
            ? "文件超过 Nginx 上传限制（需调大 client_max_body_size）"
            : !text
              ? `服务器无响应（HTTP ${r.status}），可能是 public 目录无写入权限`
              : text.slice(0, 200);
        throw new Error(d?.error || hint || "上传失败");
      }
      // 先验证 URL 真的可访问，再更新表单并自动持久化（无需再手动点保存）
      await probeImage(d.url);
      const next = { ...f, [key]: d.url } as SiteData;
      setF(next);
      await save(next);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="max-w-3xl">
      {/* 基本信息 */}
      <div className={cardCls}>
        <h3 className="mb-4 text-sm font-medium text-zinc-300">基本信息</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>网站名称</label>
            <input
              value={f.siteName}
              onChange={(e) => set("siteName", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>英文名称</label>
            <input
              value={f.siteNameEn}
              onChange={(e) => set("siteNameEn", e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>网站介绍</label>
          <textarea
            value={f.siteDescription}
            onChange={(e) => set("siteDescription", e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="用于 SEO description 与首页展示"
          />
        </div>
        <div className="mt-4">
          <label className={labelCls}>搜索关键字</label>
          <input
            value={f.searchKeywords}
            onChange={(e) => set("searchKeywords", e.target.value)}
            className={inputCls}
            placeholder="逗号分隔，如：AI提示词,ChatGPT,文生图"
          />
        </div>
        <div className="mt-4">
          <label className={labelCls}>页脚文字</label>
          <input
            value={f.footerText}
            onChange={(e) => set("footerText", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* 搜索同步 */}
      <div className={cardCls}>
        <h3 className="mb-1 text-sm font-medium text-zinc-300">搜索索引（Meilisearch）</h3>
        <p className="mb-4 text-xs text-zinc-500">
          后台常驻同步进程会按此间隔把已发布提示词的增删改增量推送到 Meilisearch；保存后下一个轮询周期生效。
        </p>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <label className={labelCls}>自动同步间隔（秒）</label>
            <input
              type="number"
              min={0}
              max={86400}
              value={f.meiliSyncSeconds ?? 30}
              onChange={(e) =>
                set("meiliSyncSeconds", Math.max(0, Math.min(86400, parseInt(e.target.value) || 0)))
              }
              className={inputCls}
            />
          </div>
          <div className="pb-2 text-xs text-zinc-500">
            建议 10~60 秒；<span className="text-amber-300">填 0 关闭自动同步</span>（仅保留手动重建索引）
          </div>
        </div>
      </div>

      {/* 图标上传 */}
      <div className={cardCls}>
        <h3 className="mb-4 text-sm font-medium text-zinc-300">站点图标</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {UPLOAD_FILES.map((u) => {
            const url = f[u.key];
            const isFavicon = u.key === "favicon";
            return (
              <div key={u.key} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <label className="mb-2 block text-xs text-zinc-400">{u.label}</label>
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={u.label}
                      className={isFavicon ? "h-8 w-8" : "max-h-16 max-w-full"}
                    />
                  ) : (
                    <span className="text-xs text-zinc-600">未上传</span>
                  )}
                </div>
                <p className="mb-2 text-xs text-zinc-500">{u.hint}</p>
                <input
                  type="file"
                  accept={isFavicon ? ".ico,.png,image/*" : "image/png,image/webp"}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(u.key, u.filename, file);
                    e.target.value = "";
                  }}
                  className="hidden"
                  id={`upload-${u.key}`}
                />
                <label
                  htmlFor={`upload-${u.key}`}
                  className="block cursor-pointer rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-center text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  {uploading === u.key ? "上传中…" : url ? "替换文件" : "选择上传"}
                </label>
                {url && (
                  <p className="mt-1.5 truncate text-center text-xs text-emerald-400">{url}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="mb-6">
        <button
          onClick={() => save()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "保存中…" : "保存设置"}
        </button>
        {ok && <span className="ml-3 text-sm text-emerald-400">已保存 ✓</span>}
      </div>
    </div>
  );
}
