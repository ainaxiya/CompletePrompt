"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: number;
  content: string;
  status: string;
  likeCount: number;
  promptId: number;
  userId: number;
  createdAt: string;
  user: { id: number; username: string; nickname: string | null; commentBanned: boolean } | null;
  prompt: { id: number; title: string } | null;
};

const TABS = [
  { key: "", label: "全部" },
  { key: "published", label: "正常" },
  { key: "hidden", label: "已隐藏" },
  { key: "deleted", label: "已删除" },
];

const STATUS_BADGE: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  hidden: "bg-amber-500/15 text-amber-300",
  deleted: "bg-zinc-600/20 text-zinc-400",
};
const STATUS_TEXT: Record<string, string> = {
  published: "正常",
  hidden: "已隐藏",
  deleted: "已删除",
};

export default function CommentManager() {
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const [promptId, setPromptId] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 敏感词 / 全站开关
  const [enabled, setEnabled] = useState(true);
  const [words, setWords] = useState("");
  const [savingWords, setSavingWords] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab) params.set("status", tab);
      if (q.trim()) params.set("q", q.trim());
      if (promptId.trim()) params.set("promptId", promptId.trim());
      if (userId.trim()) params.set("userId", userId.trim());
      params.set("page", String(page));
      const res = await fetch(`/api/admin/comments?${params}`);
      if (!res.ok) return;
      const d = await res.json();
      setRows(d.list);
      setTotal(d.total);
      setCounts(d.counts || {});
      setPageSize(d.pageSize || 20);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [tab, q, promptId, userId, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/settings/comment")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEnabled(!!d.enabled);
          setWords((d.sensitiveWords || []).join("\n"));
        }
      })
      .catch(() => {});
  }, []);

  const search = () => {
    setPage(1);
    load();
  };

  const actOne = async (id: number, action: "hide" | "show" | "delete") => {
    if (action === "delete" && !window.confirm("确定删除这条评论？")) return;
    const res = await fetch("/api/comments/" + id, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({
        status: action === "hide" ? "hidden" : "published",
      }),
    });
    if (res.ok) load();
  };

  const actBatch = async (action: "hide" | "show" | "delete") => {
    if (!selected.size) return;
    if (action === "delete" && !window.confirm(`确定删除选中的 ${selected.size} 条评论？`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/comments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`已处理 ${d.done ?? selected.size} 条`);
        await load();
      } else {
        setMsg(d.error || "操作失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const saveWords = async () => {
    setSavingWords(true);
    try {
      const list = words.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
      const res = await fetch("/api/admin/settings/comment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, sensitiveWords: list }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "评论设置已保存" : d.error || "保存失败");
    } finally {
      setSavingWords(false);
    }
  };

  const toggleSel = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allChecked) {
        const n = new Set(prev);
        rows.forEach((r) => n.delete(r.id));
        return n;
      }
      const n = new Set(prev);
      rows.forEach((r) => n.add(r.id));
      return n;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      {/* 状态 Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => {
              setTab(tb.key);
              setPage(1);
            }}
            className={`rounded-lg px-3.5 py-1.5 text-sm transition ${
              tab === tb.key
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {tb.label}
            <span className="ml-1.5 text-xs opacity-70">
              {tb.key ? counts[tb.key] ?? 0 : (counts.published ?? 0) + (counts.hidden ?? 0) + (counts.deleted ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="搜索评论内容"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500 sm:w-56"
        />
        <input
          value={promptId}
          onChange={(e) => setPromptId(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="提示词 ID"
          className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="用户 ID"
          className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <button
          onClick={search}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          查询
        </button>
      </div>

      {/* 批量操作 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm">
          <span className="text-indigo-200">已选 {selected.size} 条</span>
          <button onClick={() => actBatch("hide")} disabled={busy} className="rounded bg-amber-600/80 px-3 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50">
            批量隐藏
          </button>
          <button onClick={() => actBatch("show")} disabled={busy} className="rounded bg-emerald-600/80 px-3 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">
            批量恢复
          </button>
          <button onClick={() => actBatch("delete")} disabled={busy} className="rounded bg-rose-600/80 px-3 py-1 text-xs text-white hover:bg-rose-500 disabled:opacity-50">
            批量删除
          </button>
        </div>
      )}

      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      {/* 列表 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5">评论内容</th>
              <th className="px-3 py-2.5">用户</th>
              <th className="px-3 py-2.5">所属提示词</th>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">赞</th>
              <th className="px-3 py-2.5">时间</th>
              <th className="px-3 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {rows.map((r) => (
              <tr key={r.id} className="bg-zinc-950/30 align-top hover:bg-zinc-900/50">
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                </td>
                <td className="max-w-[320px] px-3 py-3">
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-zinc-300">
                    {r.status === "deleted" ? <span className="italic text-zinc-600">（已删除）</span> : r.content}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400">
                  <div>{r.user?.nickname || r.user?.username || `#${r.userId}`}</div>
                  {r.user?.commentBanned && (
                    <span className="mt-0.5 inline-block rounded bg-rose-500/15 px-1 py-0.5 text-[10px] text-rose-300">
                      已禁言
                    </span>
                  )}
                </td>
                <td className="max-w-[180px] px-3 py-3 text-xs">
                  {r.prompt ? (
                    <Link href={`/p/${r.prompt.id}`} target="_blank" className="text-indigo-300 hover:underline line-clamp-2">
                      {r.prompt.title}
                    </Link>
                  ) : (
                    <span className="text-zinc-600">#{r.promptId}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_BADGE[r.status] || ""}`}>
                    {STATUS_TEXT[r.status] || r.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-zinc-500">{r.likeCount}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">
                  {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex gap-2 text-xs">
                    {r.status === "published" && (
                      <button onClick={() => actOne(r.id, "hide")} className="text-amber-400 hover:underline">
                        隐藏
                      </button>
                    )}
                    {r.status === "hidden" && (
                      <button onClick={() => actOne(r.id, "show")} className="text-emerald-400 hover:underline">
                        恢复
                      </button>
                    )}
                    {r.status !== "deleted" && (
                      <button onClick={() => actOne(r.id, "delete")} className="text-rose-400 hover:underline">
                        删除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-zinc-500">
                  没有符合条件的评论
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      {/* 全站开关 + 敏感词库 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 text-base font-semibold text-zinc-100">评论开关与敏感词库</h2>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          开启全站评论（关闭后所有内容评论区只读，旧评论保留显示）
        </label>
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          rows={8}
          placeholder={"一行一个敏感词，例如：\n违禁词一\nnastyword"}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          命中的词将整体替换为等长 * 后直接发布；自动去重、忽略空行。
        </p>
        <button
          onClick={saveWords}
          disabled={savingWords}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {savingWords ? "保存中…" : "保存设置"}
        </button>
      </div>
    </div>
  );
}
