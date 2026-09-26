"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ADMIN_BASE } from "@/lib/admin-path";

type Row = {
  id: number;
  title: string;
  type: string;
  category: string;
  status: string;
  featured: boolean;
  hot: boolean;
  likeCount: number;
  viewCount: number;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  user: { id: number; username: string; nickname?: string | null };
  adminAuthor?: { id: number; username: string; nickname?: string | null } | null;
};

const STATUS_TABS = [
  { k: "", l: "全部" },
  { k: "pending", l: "待审核" },
  { k: "published", l: "已发布" },
  { k: "rejected", l: "已驳回" },
];
const CATS = ["视频创作", "音频创作", "图片创作", "编程开发", "游戏设计", "网站开发", "办公写作", "网络安全", "科学物理", "金融理财", "AI智能体"];

const TYPE_LABELS: Record<string, string> = {
  text: "文本创作",
  image: "文生图",
  video: "文生视频",
  audio: "文生音频",
};

export default function PromptManager({
  initialQ,
  initialStatus,
  initialCategory,
}: {
  initialQ: string;
  initialStatus: string;
  initialCategory: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cats, setCats] = useState<{ slug: string; name: string }[]>(CATS.map((c) => ({ slug: c, name: c })));
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((arr) => {
        if (Array.isArray(arr) && arr.length) setCats(arr);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const ps = new URLSearchParams({ page: String(page) });
    if (q) ps.set("q", q);
    if (status) ps.set("status", status);
    if (category) ps.set("category", category);
    const r = await fetch("/api/admin/prompts?" + ps.toString());
    if (r.ok) {
      const d = await r.json();
      setRows(d.list);
      setTotal(d.total);
      setCounts(d.counts || {});
    }
    setLoading(false);
  }, [page, q, status, category]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: number, data: any, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const r = await fetch(`/api/admin/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) alert("操作失败");
    load();
  };

  const del = async (id: number) => {
    if (!confirm(`确认删除 #${id}？此操作不可恢复`)) return;
    const r = await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
    if (!r.ok) alert("删除失败");
    load();
  };

  const reject = async (id: number) => {
    const reason = prompt("驳回原因（可选）：") || "";
    patch(id, { status: "rejected", rejectReason: reason || null });
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const batchAction = async (action: string) => {
    if (selected.size === 0) return;
    const labels: Record<string, string> = {
      feature: "加精",
      unfeature: "取消加精",
      hot: "设为热门",
      unhot: "取消热门",
      publish: "发布",
      unpublish: "下线",
      delete: "删除",
    };
    if (action === "delete") {
      if (!confirm(`确认批量${labels[action]}选中的 ${selected.size} 条提示词？此操作不可恢复。`)) return;
    } else {
      if (!confirm(`确认对选中的 ${selected.size} 条提示词执行「${labels[action]}」？`)) return;
    }
    const r = await fetch("/api/admin/prompts/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "批量操作失败");
      return;
    }
    setSelected(new Set());
    load();
  };

  const totalPages = Math.ceil(total / 30);

  const statusBadge: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-300",
    pending: "bg-amber-500/15 text-amber-300",
    rejected: "bg-rose-500/15 text-rose-300",
    draft: "bg-zinc-700 text-zinc-300",
  };
  const statusText: Record<string, string> = {
    published: "已发布", pending: "待审核", rejected: "已驳回", draft: "草稿",
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }}
          className="flex flex-1 gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按标题搜索…"
            className="min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500 sm:min-w-[220px]"
          />
          <button className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700">搜索</button>
        </form>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none"
        >
          {[{ slug: "", name: "全部分类" }, ...cats].map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <Link
          href={`${ADMIN_BASE}/prompts/new`}
          className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          + 新增提示词
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s.k}
            onClick={() => { setStatus(s.k); setPage(1); }}
            className={`rounded-full px-3 py-1 text-sm ${
              status === s.k ? "bg-emerald-500 font-medium text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {s.l}
            {s.k && counts[s.k] ? <span className="ml-1 opacity-80">({counts[s.k]})</span> : null}
          </button>
        ))}
      </div>

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-700/50 bg-indigo-950/40 px-4 py-2.5">
          <span className="text-sm text-indigo-300">已选 {selected.size} 项</span>
          <div className="mx-2 h-4 w-px bg-zinc-700" />
          <button onClick={() => batchAction("feature")}
            className="rounded bg-amber-700/70 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-600">
            加精
          </button>
          <button onClick={() => batchAction("unfeature")}
            className="rounded bg-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-600">
            取消加精
          </button>
          <button onClick={() => batchAction("hot")}
            className="rounded bg-rose-700/70 px-2.5 py-1 text-xs text-rose-100 hover:bg-rose-600">
            热门
          </button>
          <button onClick={() => batchAction("unhot")}
            className="rounded bg-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-600">
            取消热门
          </button>
          <button onClick={() => batchAction("publish")}
            className="rounded bg-emerald-700 px-2.5 py-1 text-xs text-white hover:bg-emerald-600">
            发布
          </button>
          <button onClick={() => batchAction("unpublish")}
            className="rounded bg-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-600">
            下线
          </button>
          <button onClick={() => batchAction("delete")}
            className="rounded bg-rose-600 px-2.5 py-1 text-xs text-white hover:bg-rose-500">
            删除
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-200">
            取消选择
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-zinc-900 text-xs text-zinc-500">
            <tr>
              <th className="w-8 px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < rows.length; }}
                  onChange={toggleAll}
                  className="accent-indigo-500"
                />
              </th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">标题</th>
              <th className="px-3 py-2 text-left">分类/类型</th>
              <th className="px-3 py-2 text-left">作者</th>
              <th className="px-3 py-2 text-left">数据</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {rows.map((p) => (
              <tr key={p.id} className="align-top hover:bg-zinc-900/40">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="accent-indigo-500"
                  />
                </td>
                <td className="px-3 py-2.5 text-zinc-500">{p.id}</td>
                <td className="px-3 py-2.5">
                  <Link href={`/p/${p.id}`} target="_blank" className="line-clamp-2 text-zinc-200 hover:text-emerald-300">
                    {p.featured && <span className="text-amber-400">★ </span>}
                    {p.hot && <span className="text-rose-400">🔥 </span>}
                    {p.title}
                  </Link>
                  {p.rejectReason && (
                    <p className="mt-0.5 text-xs text-rose-400">原因：{p.rejectReason}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {p.category}
                  <br />
                  {TYPE_LABELS[p.type] || p.type}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {p.adminAuthor ? (
                    <span className="inline-flex flex-col gap-0.5">
                      <span className="text-indigo-300">
                        {p.adminAuthor.nickname || p.adminAuthor.username}
                      </span>
                      <span className="rounded bg-indigo-500/15 px-1 py-0.5 text-[10px] text-indigo-300 w-fit">
                        管理员发布
                      </span>
                    </span>
                  ) : (
                    p.user.nickname || p.user.username
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">
                  ♥ {p.likeCount} · 👁 {p.viewCount}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadge[p.status]}`}>
                    {statusText[p.status] || p.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">
                  {p.publishedAt && (
                    <p>发布：{p.publishedAt.slice(0, 16).replace("T", " ")}</p>
                  )}
                  <p>更新：{p.updatedAt.slice(0, 16).replace("T", " ")}</p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5 text-xs">
                    {p.status !== "published" && (
                      <button onClick={() => patch(p.id, { status: "published", rejectReason: null })}
                        className="rounded bg-emerald-600/90 px-2 py-1 text-white hover:bg-emerald-500">
                        通过
                      </button>
                    )}
                    {p.status !== "rejected" && (
                      <button onClick={() => reject(p.id)}
                        className="rounded bg-rose-700/80 px-2 py-1 text-white hover:bg-rose-600">
                        驳回
                      </button>
                    )}
                    <button onClick={() => patch(p.id, { featured: !p.featured })}
                      className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600">
                      {p.featured ? "取消加精" : "加精"}
                    </button>
                    <button onClick={() => patch(p.id, { hot: !p.hot })}
                      className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600">
                      {p.hot ? "取消热门" : "热门"}
                    </button>
                    <button onClick={() => router.push(`${ADMIN_BASE}/prompts/${p.id}/edit`)}
                      className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600">
                      编辑
                    </button>
                    <button onClick={() => del(p.id)}
                      className="rounded bg-rose-900/70 px-2 py-1 text-rose-200 hover:bg-rose-800">
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-600">没有匹配的提示词</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
        <span>共 {total} 条，{page} / {Math.max(1, totalPages)}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-700">
            上一页
          </button>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-700">
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
