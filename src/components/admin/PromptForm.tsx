"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RichEditor from "@/components/RichEditor";
import CoverUploader from "@/components/CoverUploader";
import OptionDropdown from "@/components/OptionDropdown";
import { ADMIN_BASE } from "@/lib/admin-path";

type Cat = { slug: string; name: string };

const TYPE_LABELS: Record<string, string> = {
  text: "文本创作",
  image: "文生图",
  video: "文生视频",
  audio: "文生音频",
};

// ISO 时间 → datetime-local 控件格式（按浏览器本地时区）
function toLocalInput(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PromptForm({ promptId }: { promptId?: number }) {
  const isEdit = !!promptId;
  const router = useRouter();

  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const descTouched = useRef(false);
  const descAutoFilled = useRef(false);
  const descReq = useRef(false);

  const [f, setF] = useState({
    title: "",
    type: "text",
    category: "",
    model: "",
    language: "zh",
    promptCode: "",
    sourceSite: "",
    sourceAuthor: "",
    sourceUrl: "",
    coverUrl: "" as string | null,
    content: "",
    description: "",
    tagsText: "",
    status: "published",
    featured: false,
    hot: false,
    commentsClosed: false,
    rejectReason: "",
    publishedAt: "", // datetime-local 格式，空=未发布
    likeCount: 0,
    favoriteCount: 0,
    viewCount: 0,
    commentCount: 0,
    mediaText: "", // 媒体 JSON（数组），空=不修改
  });

  useEffect(() => {
    // 预热自动标签/简介的语料词库（冷启动构建较慢）
    fetch("/api/extract-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warm: true }),
    }).catch(() => {});
    fetch("/api/categories")
      .then((r) => r.json())
      .then((arr: Cat[]) => {
        if (Array.isArray(arr) && arr.length) {
          setCats(arr);
          setF((prev) => ({ ...prev, category: prev.category || arr[0].slug }));
        }
      });
    if (promptId) {
      fetch(`/api/admin/prompts/${promptId}`)
        .then((r) => r.json())
        .then((d) => {
          setF({
            title: d.title || "",
            type: d.type || "text",
            category: d.category || "",
            model: d.model || "",
            language: d.language || "zh",
            promptCode: d.promptCode || "",
            sourceSite: d.sourceSite || "",
            sourceAuthor: d.sourceAuthor || "",
            sourceUrl: d.sourceUrl || "",
            coverUrl: d.coverUrl || null,
            content: d.content || "",
            description: d.description || "",
            tagsText: (d.tags || []).join(", "),
            status: d.status || "published",
            featured: !!d.featured,
            hot: !!d.hot,
            commentsClosed: !!d.commentsClosed,
            rejectReason: d.rejectReason || "",
            publishedAt: d.publishedAt ? toLocalInput(d.publishedAt) : "",
            likeCount: d.likeCount ?? 0,
            favoriteCount: d.favoriteCount ?? 0,
            viewCount: d.viewCount ?? 0,
            commentCount: d.commentCount ?? 0,
            mediaText: Array.isArray(d.media) && d.media.length ? JSON.stringify(d.media, null, 2) : "",
          });
          // 已有简介的旧数据不做静默覆盖
          if (d.description) {
            descTouched.current = true;
            descAutoFilled.current = true;
          }
        })
        .finally(() => setLoading(false));
    }
  }, [promptId]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const autoMeta = async (kind: "tags" | "desc" | "both", silent = false) => {
    if (!f.content.trim()) {
      if (!silent) setMsg({ kind: "err", text: "请先填写内容" });
      return;
    }
    if (!silent) setBusy(true);
    try {
      const res = await fetch("/api/extract-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, title: f.title }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "获取失败");
      if ((kind === "tags" || kind === "both") && d.tags?.length) {
        set("tagsText", d.tags.join(", "));
      }
      if (kind === "desc" || kind === "both") {
        set("description", d.description || "");
        descTouched.current = true;
      }
      if (!silent) {
        setMsg({ kind: "ok", text: "已自动获取" });
        setTimeout(() => setMsg(null), 2000);
      }
    } catch (e) {
      if (!silent) setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      if (!silent) setBusy(false);
    }
  };

  // 简介默认自动获取：内容达到 20 字且用户未手改简介时，静默生成；失败允许后续重试
  const onContentChange = (html: string) => {
    set("content", html);
    const text = html.replace(/<[^>]+>/g, "").trim();
    if (!descAutoFilled.current && !descTouched.current && !descReq.current && text.length >= 20) {
      descReq.current = true;
      void autoMetaWith(html, "desc").then((ok) => {
        descReq.current = false;
        if (ok) descAutoFilled.current = true;
      });
    }
  };

  // 允许调用方传入即时内容，避免 setState 异步导致的闭包旧值；返回是否成功
  const autoMetaWith = async (content: string, kind: "tags" | "desc" | "both"): Promise<boolean> => {
    try {
      const res = await fetch("/api/extract-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title: f.title }),
      });
      const d = await res.json();
      if (!res.ok) return false;
      if ((kind === "tags" || kind === "both") && d.tags?.length) {
        set("tagsText", d.tags.join(", "));
      }
      if ((kind === "desc" || kind === "both") && d.description) {
        set("description", d.description);
        descTouched.current = true;
        return true;
      }
      return kind !== "desc";
    } catch {
      return false;
    }
  };

  const submit = async (extra?: { status?: string; featured?: boolean; rejectReason?: string }) => {
    if (!f.title.trim() || !f.content.trim()) {
      setMsg({ kind: "err", text: "标题和内容必填" });
      return;
    }
    // 媒体 JSON 校验（留空=不修改）
    let media: unknown[] | undefined;
    if (f.mediaText.trim()) {
      try {
        const parsed = JSON.parse(f.mediaText);
        if (!Array.isArray(parsed)) throw new Error("必须是数组");
        media = parsed;
      } catch {
        setMsg({ kind: "err", text: "媒体 JSON 格式不正确（需为 JSON 数组）" });
        return;
      }
    }
    setSaving(true);
    setMsg(null);
    const num = (v: number | string) => Math.max(0, Math.floor(Number(v) || 0));
    const payload: Record<string, unknown> = {
      title: f.title.trim(),
      type: f.type,
      category: f.category,
      model: f.model.trim() || null,
      language: f.language,
      promptCode: f.promptCode.trim() || null,
      sourceSite: f.sourceSite.trim() || null,
      sourceAuthor: f.sourceAuthor.trim() || null,
      sourceUrl: f.sourceUrl.trim(),
      coverUrl: f.coverUrl || null,
      content: f.content,
      description: f.description.trim(),
      tags: f.tagsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      status: extra?.status || f.status,
      featured: extra?.featured ?? f.featured,
      hot: f.hot,
      commentsClosed: f.commentsClosed,
      rejectReason: extra?.rejectReason !== undefined ? extra.rejectReason : f.rejectReason.trim() || null,
      publishedAt: f.publishedAt ? new Date(f.publishedAt).toISOString() : null,
      likeCount: num(f.likeCount),
      favoriteCount: num(f.favoriteCount),
      viewCount: num(f.viewCount),
      commentCount: num(f.commentCount),
      ...(media ? { media } : {}),
    };
    try {
      const url = isEdit ? `/api/admin/prompts/${promptId}` : "/api/admin/prompts";
      const r = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "保存失败");
      setMsg({ kind: "ok", text: "已保存 ✓" });
      if (!isEdit) {
        setTimeout(() => router.push(`${ADMIN_BASE}/prompts/${d.id}/edit`), 600);
      } else if (extra?.status === "published") {
        setTimeout(() => router.push(`${ADMIN_BASE}/prompts?status=published`), 600);
      }
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";
  const labelCls = "mb-1 block text-sm text-zinc-400";

  if (loading) return <p className="py-20 text-center text-zinc-500">加载中…</p>;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold">{isEdit ? `编辑提示词 #${promptId}` : "新增提示词"}</h1>
        {isEdit && (
          <a href={`/p/${promptId}`} target="_blank" className="text-sm text-emerald-400 hover:underline">
            查看前台 ↗
          </a>
        )}
      </div>

      {msg && (
        <p
          className={`mb-3 rounded p-2 text-sm ${
            msg.kind === "ok" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      <label className={labelCls}>标题 *</label>
      <input value={f.title} onChange={(e) => set("title", e.target.value)} className={`${inputCls} mb-4`} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>类型</label>
          <select value={f.type} onChange={(e) => set("type", e.target.value)} className={inputCls}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>分类</label>
          <select value={f.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
            {cats.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <label className={labelCls}>模型（可选）</label>
      <input value={f.model} onChange={(e) => set("model", e.target.value)} className={`${inputCls} mb-4`} />

      <label className={labelCls}>原作品链接（可选，转载出处）</label>
      <input
        value={f.sourceUrl}
        onChange={(e) => set("sourceUrl", e.target.value)}
        type="url"
        inputMode="url"
        placeholder="https://…"
        className={`${inputCls} mb-4`}
      />

      <label className={labelCls}>封面图</label>
      <p className="mb-1.5 text-xs text-zinc-600">不上传时自动从内容中提取第一张图片作为封面</p>
      <div className="mb-4">
        <CoverUploader value={f.coverUrl} onChange={(u) => set("coverUrl", u)} />
      </div>

      <label className={labelCls}>提示词内容 *（富文本，工具栏可插入图片/视频）</label>
      <div className="mb-4">
        <RichEditor value={f.content} onChange={onContentChange} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-zinc-400">简介</label>
        <button
          type="button"
          disabled={busy}
          onClick={() => autoMeta("desc")}
          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "获取中…" : "⚡ 自动获取简介"}
        </button>
        <span className="text-xs text-zinc-600">留空保存时也会自动从内容提取</span>
      </div>
      <textarea
        value={f.description}
        onChange={(e) => {
          descTouched.current = true;
          set("description", e.target.value);
        }}
        rows={2}
        placeholder="内容首段自动摘要"
        className={`${inputCls} mb-4`}
      />

      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-zinc-400">标签（逗号分隔，最多 8 个）</label>
        <button
          type="button"
          disabled={busy}
          onClick={() => autoMeta("tags")}
          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "获取中…" : "⚡ 自动获取标签"}
        </button>
      </div>
      <input
        value={f.tagsText}
        onChange={(e) => set("tagsText", e.target.value)}
        placeholder="赛博朋克, 电影感, 人像"
        className={`${inputCls} mb-4`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          状态
          <OptionDropdown
            value={f.status}
            size="md"
            onChange={(v) => set("status", v)}
            options={[
              { value: "published", label: "已发布", tone: "green" },
              { value: "pending", label: "待审核", tone: "amber" },
              { value: "draft", label: "草稿", tone: "zinc" },
              ...(isEdit ? [{ value: "rejected", label: "已驳回", tone: "red" as const }] : []),
            ]}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={f.featured}
            onChange={(e) => set("featured", e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          加精 ★
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={f.hot}
            onChange={(e) => set("hot", e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          热门 🔥
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={f.commentsClosed}
            onChange={(e) => set("commentsClosed", e.target.checked)}
            className="h-4 w-4 accent-rose-500"
          />
          关闭本文评论（旧评论保留显示）
        </label>
      </div>

      {/* 高级字段：统计 / 来源 / 发布时间 / 媒体 JSON */}
      <details className="mb-5 rounded-lg border border-zinc-800 bg-zinc-900/40">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200">
          高级字段（浏览量 / 点赞 / 收藏 / 评论数 / 来源 / 发布时间 / 媒体 JSON）
        </summary>
        <div className="space-y-3 border-t border-zinc-800 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>浏览量</label>
              <input
                type="number"
                min={0}
                value={f.viewCount}
                onChange={(e) => set("viewCount", Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>点赞数</label>
              <input
                type="number"
                min={0}
                value={f.likeCount}
                onChange={(e) => set("likeCount", Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>收藏数</label>
              <input
                type="number"
                min={0}
                value={f.favoriteCount}
                onChange={(e) => set("favoriteCount", Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>评论数</label>
              <input
                type="number"
                min={0}
                value={f.commentCount}
                onChange={(e) => set("commentCount", Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>来源站点</label>
              <input
                value={f.sourceSite}
                onChange={(e) => set("sourceSite", e.target.value)}
                placeholder="如 jimeng.jianying.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>来源作者</label>
              <input
                value={f.sourceAuthor}
                onChange={(e) => set("sourceAuthor", e.target.value)}
                placeholder="原作者昵称"
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>语言</label>
              <select value={f.language} onChange={(e) => set("language", e.target.value)} className={inputCls}>
                <option value="zh">简体中文</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>发布时间</label>
              <input
                type="datetime-local"
                value={f.publishedAt}
                onChange={(e) => set("publishedAt", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>驳回原因</label>
            <input value={f.rejectReason} onChange={(e) => set("rejectReason", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>提示词代码 promptCode（可选）</label>
            <textarea
              value={f.promptCode}
              onChange={(e) => set("promptCode", e.target.value)}
              rows={3}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>媒体 JSON（数组，留空不修改；元素形如 {"{type:'image', url:'/uploads/…'}"}）</label>
            <textarea
              value={f.mediaText}
              onChange={(e) => set("mediaText", e.target.value)}
              rows={6}
              spellCheck={false}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={saving}
          onClick={() => submit()}
          className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {isEdit && f.status !== "published" && (
          <button
            onClick={() => submit({ status: "published" })}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
          >
            保存并通过
          </button>
        )}
        {isEdit && f.status !== "rejected" && (
          <button
            onClick={() => {
              const reason = prompt("驳回原因（可选）：") ?? "";
              submit({ status: "rejected", rejectReason: reason });
            }}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm text-white hover:bg-rose-600"
          >
            驳回
          </button>
        )}
        <Link href={`${ADMIN_BASE}/prompts`} className="ml-auto self-center text-sm text-zinc-500 hover:text-zinc-300">
          ← 返回列表
        </Link>
      </div>
    </div>
  );
}
