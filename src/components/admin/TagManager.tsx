"use client";

import { useCallback, useEffect, useState } from "react";
import Pagination from "@/components/Pagination";

type Tag = { name: string; count: number; preset: boolean };
type ListResp = { items: Tag[]; total: number; totalPages: number; page: number; pageSize: number };

const PAGE_SIZES = [50, 100, 200, 500];

export default function TagManager() {
  const [data, setData] = useState<ListResp>({ items: [], total: 0, totalPages: 1, page: 1, pageSize: 100 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const load = useCallback(async (p = page, ps = pageSize, q = search) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/tags?page=${p}&pageSize=${ps}&q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (r.ok) {
        setData(d);
        setSelected(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    load(1, pageSize, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, search]);

  const goPage = (n: number) => {
    setPage(n);
    load(n, pageSize, search);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return flash("err", "请输入标签名");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "创建失败");
      setNewName("");
      flash("ok", `已新增标签「${name}」`);
      await load(1, pageSize, search);
      setPage(1);
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (from: string) => {
    const to = editValue.trim();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "重命名失败");
      flash("ok", `已将「${from}」改为「${to}」，影响 ${d.affected} 条提示词`);
      setEditing(null);
      await load();
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeMany = async (names: string[]) => {
    if (!names.length) return;
    const usedCount = data.items.filter((t) => names.includes(t.name)).reduce((s, t) => s + t.count, 0);
    const tip =
      usedCount > 0
        ? `确定删除 ${names.length} 个标签吗？\n将从 ${usedCount} 条提示词中移除这些标签。`
        : `确定删除 ${names.length} 个预设标签吗？`;
    if (!confirm(tip)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/tags?names=${encodeURIComponent(names.join(","))}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "删除失败");
      flash("ok", `已删除 ${d.removed} 个标签${d.affected ? `，影响 ${d.affected} 条提示词` : ""}`);
      await load();
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (name: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allChecked = data.items.length > 0 && data.items.every((t) => selected.has(t.name));
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(data.items.map((t) => t.name)));
  };

  return (
    <div>
      {msg && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 工具栏：搜索 + 每页数量 + 新增 + 批量删除 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              setSearch(searchInput.trim());
            }
          }}
          placeholder="搜索标签，回车确认…"
          className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            setSearch(searchInput.trim());
          }}
          className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600"
        >
          搜索
        </button>
        <select
          value={pageSize}
          onChange={(e) => {
            setPage(1);
            setPageSize(parseInt(e.target.value));
          }}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} 条/页
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">共 {data.total} 个</span>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => removeMany([...selected])}
              disabled={busy}
              className="rounded-lg bg-rose-700/80 px-3 py-1.5 text-sm text-white hover:bg-rose-600 disabled:opacity-50"
            >
              批量删除 ({selected.size})
            </button>
          )}
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="新标签名"
            className="w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            + 新增标签
          </button>
        </div>
      </div>

      {/* 标签表格 */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-500" />
              </th>
              <th className="px-4 py-3">标签名</th>
              <th className="w-32 px-4 py-3">关联提示词数</th>
              <th className="w-24 px-4 py-3">类型</th>
              <th className="w-32 px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  加载中…
                </td>
              </tr>
            )}
            {!loading && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  {search ? "没有匹配的标签" : "暂无标签"}
                </td>
              </tr>
            )}
            {!loading &&
              data.items.map((t) => (
                <tr key={t.name} className="hover:bg-zinc-800/30">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(t.name)}
                      onChange={() => toggle(t.name)}
                      className="accent-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {editing === t.name ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(t.name);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        onBlur={() => rename(t.name)}
                        className="w-48 rounded border border-emerald-500 bg-zinc-950 px-2 py-1 text-sm outline-none"
                      />
                    ) : (
                      <span className="font-medium text-zinc-100">#{t.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                      {t.count} 条
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">
                    {t.preset ? "预设" : "使用中"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {editing === t.name ? (
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        取消
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(t.name);
                            setEditValue(t.name);
                          }}
                          className="mr-2 text-sky-400 hover:underline"
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMany([t.name])}
                          className="text-rose-400 hover:underline"
                        >
                          删除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Pagination page={data.page} totalPages={data.totalPages} onPage={goPage} />
    </div>
  );
}
