"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import RichEditor from "@/components/RichEditor";
import CoverUploader from "@/components/CoverUploader";
import { useLocale, translate as t } from "@/lib/i18n-client";

type PubSettings = {
  mode: string;
  maxContentLen: number;
  maxImageMB: number;
  maxVideoMB: number;
  maxMediaPerPrompt: number;
  allowUpload: boolean;
  allowEmbed: boolean;
};

type Cat = { slug: string; name: string; nameEn: string };

export default function PublishPage() {
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    type: "text",
    category: "",
    model: "",
    tags: "",
    description: "",
    content: "",
  });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [cfg, setCfg] = useState<PubSettings | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const descTouched = useRef(false);
  const autoFilled = useRef(false);
  const descReq = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([s, c]) => {
        setCfg(s.publish);
        if (Array.isArray(c) && c.length) {
          setCats(c);
          setForm((f) => ({ ...f, category: f.category || c[0].slug }));
        }
      })
      .catch(() => {});
    // 预热自动标签/简介的语料词库（冷启动构建较慢）
    fetch("/api/extract-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warm: true }),
    }).catch(() => {});
  }, []);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const fetchMeta = async (
    content: string,
    kind: "tags" | "desc" | "both",
    opts?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!content.trim()) return false;
    if (!opts?.silent) setBusy(true);
    try {
      const res = await fetch("/api/extract-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title: form.title }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setForm((f) => ({
        ...f,
        tags: kind === "tags" || (kind === "both" && d.tags?.length) ? d.tags.join(", ") : f.tags,
        description: kind === "desc" || kind === "both" ? d.description || f.description : f.description,
      }));
      if (kind === "desc" || kind === "both") descTouched.current = true;
      return true;
    } catch {
      return false;
    } finally {
      if (!opts?.silent) setBusy(false);
    }
  };

  // 简介默认自动获取：内容达到 20 字且用户未手改简介时静默生成；失败允许重试
  const onContentChange = (html: string) => {
    setForm({ ...form, content: html });
    const text = html.replace(/<[^>]+>/g, "").trim();
    if (!autoFilled.current && !descTouched.current && !descReq.current && text.length >= 20) {
      descReq.current = true;
      void fetchMeta(html, "desc", { silent: true }).then((ok) => {
        descReq.current = false;
        if (ok) autoFilled.current = true;
      });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const res = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, coverUrl }),
    });
    const d = await res.json();
    setLoading(false);
    if (res.status === 401) {
      router.push("/login?next=/publish");
      return;
    }
    if (!res.ok) {
      setError(d.error || "failed");
      return;
    }
    if (d.status === "pending") {
      setNotice(t(locale, "publish.donePending"));
      setTimeout(() => router.push("/p/" + d.id), 1200);
      return;
    }
    router.push("/p/" + d.id);
  };

  const inputCls =
    "mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";
  const labelCls = "mb-1 block text-sm text-zinc-400";
  const autoBtn =
    "rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-bold">{t(locale, "publish.title")}</h1>

      {cfg?.mode === "review" && (
        <p className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-300">
          {t(locale, "publish.pendingTip")}
        </p>
      )}

      <label className={labelCls}>{t(locale, "publish.field.title")}</label>
      <input required value={form.title} onChange={set("title")} maxLength={200}
        className={inputCls} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t(locale, "publish.field.type")}</label>
          <select value={form.type} onChange={set("type")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="text">{t(locale, "type.text")}</option>
            <option value="image">{t(locale, "type.image")}</option>
            <option value="video">{t(locale, "type.video")}</option>
            <option value="audio">{t(locale, "type.audio")}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t(locale, "publish.field.category")}</label>
          <select value={form.category} onChange={set("category")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            {cats.map((c) => (
              <option key={c.slug} value={c.slug}>
                {locale === "zh" ? c.name : c.nameEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className={labelCls}>{t(locale, "publish.field.model")}</label>
      <input value={form.model} onChange={set("model")} maxLength={60} className={inputCls} />

      <label className={labelCls}>{t(locale, "publish.cover")}</label>
      <div className="mb-4">
        <CoverUploader value={coverUrl} onChange={setCoverUrl} maxImageMB={cfg?.maxImageMB ?? 10} />
      </div>

      <label className={labelCls}>{t(locale, "publish.field.content")}</label>
      <div className="mb-4">
        <RichEditor value={form.content} onChange={onContentChange} />
      </div>

      <div className="mb-1 flex items-center gap-2">
        <label className="text-sm text-zinc-400">{t(locale, "publish.field.desc")}</label>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            descTouched.current = true;
            fetchMeta(form.content, "desc");
          }}
          className={autoBtn}
        >
          {busy ? t(locale, "publish.autoGetting") : `⚡ ${t(locale, "publish.autoDesc")}`}
        </button>
      </div>
      <textarea
        value={form.description}
        onChange={(e) => {
          descTouched.current = true;
          setForm({ ...form, description: e.target.value });
        }}
        rows={2}
        maxLength={2000}
        className={inputCls}
      />

      <div className="mb-1 flex items-center gap-2">
        <label className="text-sm text-zinc-400">{t(locale, "publish.field.tags")}</label>
        <button type="button" disabled={busy} onClick={() => fetchMeta(form.content, "tags")} className={autoBtn}>
          {busy ? t(locale, "publish.autoGetting") : `⚡ ${t(locale, "publish.autoTags")}`}
        </button>
      </div>
      <input value={form.tags} onChange={set("tags")} maxLength={200} className={inputCls} />

      {error && <p className="mb-3 rounded bg-rose-500/10 p-2 text-sm text-rose-300">{error}</p>}
      {notice && <p className="mb-3 rounded bg-amber-500/10 p-2 text-sm text-amber-300">{notice}</p>}
      <button disabled={loading}
        className="rounded-lg bg-emerald-500 px-6 py-2 font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
        {loading ? t(locale, "publish.submitting") : t(locale, "publish.submit")}
      </button>
    </form>
  );
}
