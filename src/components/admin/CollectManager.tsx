"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type CrawlItemRow = {
  id: number;
  source: string;
  remoteId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  tags: string[];
  likeCount: number;
  kind: string | null;
  remoteUpdatedAt: string | null;
  status: "new" | "collected" | "failed";
  error: string | null;
  promptId: number | null;
};

type JobState = { id: number; total: number; done: number; succeeded: number; failed: number; status?: string; message?: string | null };

const TABS = [
  { key: "new", label: "待采集" },
  { key: "collected", label: "已采集" },
  { key: "failed", label: "采集失败" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-300",
  collected: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-rose-500/15 text-rose-300",
};
const STATUS_TEXT: Record<string, string> = { new: "待采集", collected: "已入库", failed: "失败" };

function fmtTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CollectManager() {
  const [sources, setSources] = useState<{ id: string; name: string; url: string; description: string }[]>([]);
  const [source, setSource] = useState("libtv");
  const [tab, setTab] = useState<string>("new");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CrawlItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [job, setJob] = useState<JobState | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/collect/items?source=${source}&status=${tab}&page=${page}`);
      if (res.status === 403) {
        setMsg({ type: "err", text: "没有采集管理权限" });
        return;
      }
      const d = await res.json();
      setRows(d.list || []);
      setTotal(d.total || 0);
      setCounts(d.counts || {});
      setLastFetchedAt(d.lastFetchedAt || null);
      setSelected(new Set());
      if (d.runningJob) setJob(d.runningJob);
    } finally {
      setLoading(false);
    }
  }, [source, tab, page]);

  useEffect(() => {
    fetch("/api/admin/collect/sources")
      .then((r) => (r.ok ? r.json() : { sources: [] }))
      .then((d) => setSources(d.sources || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 任务轮询
  useEffect(() => {
    if (!job || job.status === "done") return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/collect/jobs/${job.id}`);
        if (!res.ok) return;
        const d = await res.json();
        setJob({ ...d });
        if (d.status === "done") {
          if (timerRef.current) clearInterval(timerRef.current);
          setMsg({ type: d.failed > 0 ? "err" : "ok", text: `入库完成：成功 ${d.succeeded} 条${d.failed ? `，失败 ${d.failed} 条` : ""}` });
          load();
        }
      } catch {
        /* 轮询失败忽略，下一拍重试 */
      }
    }, 1500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [job, load]);

  const running = !!job && job.status !== "done";

  const onFetch = async () => {
    setFetching(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/collect/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, pages: 3 }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: d.error || "获取失败" });
        return;
      }
      setMsg({
        type: "ok",
        text: `获取完成：共 ${d.fetched} 条，新发现 ${d.newCount} 条${d.updatedCount ? `，已采集作品中有 ${d.updatedCount} 条远端有更新（不重复入库）` : ""}`,
      });
      await load();
    } finally {
      setFetching(false);
    }
  };

  const startImport = async (all: boolean) => {
    const ids = [...selected];
    if (!all && ids.length === 0) {
      setMsg({ type: "err", text: "请先勾选要采集的条目" });
      return;
    }
    setMsg(null);
    const res = await fetch("/api/admin/collect/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { source, all: true } : { source, ids }),
    });
    const d = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: d.error || "启动失败" });
      return;
    }
    setJob({ id: d.jobId, total: d.total, done: 0, succeeded: 0, failed: 0 });
  };

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    const selectable = rows.filter((r) => r.status === "new" || r.status === "failed");
    const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
    setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));
  };

  const curSource = sources.find((s) => s.id === source);
  const selectableRows = rows.filter((r) => r.status === "new" || r.status === "failed");
  const pageAllSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      {/* 采集源卡片 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <label className="text-sm text-zinc-400">采集源</label>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                {sources.length === 0 && <option value="libtv">LibLib TV</option>}
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {curSource && (
                <a href={curSource.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
                  访问源站 ↗
                </a>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-500">
              {curSource?.description || "定时从外部站点获取更新作品，勾选后采集提示词与媒体入库。"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">上次获取：{fmtTime(lastFetchedAt)}</p>
          </div>
          <button
            onClick={onFetch}
            disabled={fetching || running}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fetching ? "正在获取…" : `一键获取 ${curSource?.name || "LIBTV"} 更新`}
          </button>
        </div>
      </div>

      {/* 提示条 */}
      {msg && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${msg.type === "ok" ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300" : "border-rose-700/60 bg-rose-950/40 text-rose-300"}`}>
          {msg.text}
        </div>
      )}

      {/* 任务进度 */}
      {job && (
        <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/30 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-indigo-200">
              采集任务 #{job.id}：{job.status === "done" ? "已结束" : "进行中"}
            </span>
            <span className="text-indigo-300">
              {job.done}/{job.total}　成功 {job.succeeded}　失败 {job.failed}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }}
            />
          </div>
          {job.message && <p className="mt-2 text-xs text-amber-300/90">{job.message}</p>}
        </div>
      )}

      {/* Tab + 操作 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                tab === t.key ? "bg-emerald-700 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
              <span className="ml-1 text-xs opacity-70">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        {tab !== "collected" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">已选 {selected.size} 条</span>
            <button
              onClick={() => startImport(false)}
              disabled={running || selected.size === 0}
              className="rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              确认采集进库
            </button>
            <button
              onClick={() => startImport(true)}
              disabled={running || (counts.new ?? 0) === 0}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              全部采集入库
            </button>
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs text-zinc-500">
            <tr>
              {tab !== "collected" && (
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="全选本页" />
                </th>
              )}
              <th className="w-16 px-3 py-2.5">封面</th>
              <th className="px-3 py-2.5">标题</th>
              <th className="w-24 px-3 py-2.5">作者</th>
              <th className="w-40 px-3 py-2.5">更新时间</th>
              <th className="w-20 px-3 py-2.5">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-zinc-600">
                  暂无数据，点击右上角「一键获取更新」
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const selectable = r.status === "new" || r.status === "failed";
              return (
                <tr key={r.id} className="hover:bg-zinc-900/40">
                  {tab !== "collected" && (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        disabled={!selectable || running}
                        checked={selected.has(r.id)}
                        onChange={() => toggleRow(r.id)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    {r.coverUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.coverUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-zinc-800" />
                    )}
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://www.liblib.tv/canvas?sourceProjectUuid=${r.remoteId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-zinc-100 hover:text-sky-400 hover:underline"
                        title={r.title}
                      >
                        {r.title}
                      </a>
                      {r.promptId && (
                        <Link href={`/p/${r.promptId}`} target="_blank" className="shrink-0 text-xs text-emerald-400 hover:underline">
                          查看 ↗
                        </Link>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((tg) => (
                        <span key={tg} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {tg}
                        </span>
                      ))}
                      {r.error && <span className="text-[10px] text-rose-400" title={r.error}>⚠ {r.error.slice(0, 40)}</span>}
                    </div>
                  </td>
                  <td className="truncate px-3 py-2.5 text-zinc-400">{r.author || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{fmtTime(r.remoteUpdatedAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-zinc-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
