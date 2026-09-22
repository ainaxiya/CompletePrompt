"use client";

import { useEffect, useState } from "react";

type Cat = { id: number; name: string; nameEn: string; slug: string; sort: number; promptCount?: number };

type Props = { initial: Cat[] };

export default function CategoryManager({ initial }: Props) {
  const [cats, setCats] = useState<Cat[]>(initial);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  // 新建 / 编辑表单
  const [editing, setEditing] = useState<Cat | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 加载提示词数量
  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((arr: Cat[]) => {
        if (Array.isArray(arr)) {
          const m: Record<number, number> = {};
          arr.forEach((c) => (m[c.id] = c.promptCount || 0));
          setCounts(m);
        }
      })
      .finally(() => setLoadingCounts(false));
  }, []);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setNameEn("");
    setShowForm(true);
  };

  const openEdit = (c: Cat) => {
    setEditing(c);
    setName(c.name);
    setNameEn(c.nameEn);
    setShowForm(true);
  };

  const submit = async () => {
    if (!name.trim()) {
      flash("err", "请输入分类名称");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        const r = await fetch(`/api/admin/categories/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), nameEn: nameEn.trim() }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "保存失败");
        setCats((prev) =>
          prev.map((c) =>
            c.id === editing.id ? { ...c, name: name.trim(), nameEn: nameEn.trim() || name.trim(), slug: name.trim() } : c
          )
        );
        flash("ok", "已更新");
      } else {
        const r = await fetch("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), nameEn: nameEn.trim() }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "创建失败");
        setCats((prev) => [...prev, d]);
        flash("ok", "已创建");
      }
      setShowForm(false);
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Cat) => {
    if (!confirm(`确定删除分类「${c.name}」吗？\n若该分类下还有提示词将无法删除。`)) return;
    try {
      const r = await fetch(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "删除失败");
      setCats((prev) => prev.filter((x) => x.id !== c.id));
      flash("ok", "已删除");
    } catch (e) {
      flash("err", (e as Error).message);
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...cats];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((c, i) => ({ ...c, sort: i }));
    setCats(reordered);
    try {
      await fetch("/api/admin/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
      });
    } catch {
      setCats(cats);
      flash("err", "排序保存失败");
    }
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

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          共 {cats.length} 个分类
        </p>
        <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
          + 新增分类
        </button>
      </div>

      {showForm && (
        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-sm font-medium">{editing ? "编辑分类" : "新增分类"}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">中文名称 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="如：AI创作"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">英文名称</label>
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="如：AI Art"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="px-4 py-3 w-16">排序</th>
              <th className="px-4 py-3">中文名称</th>
              <th className="px-4 py-3">英文名称</th>
              <th className="px-4 py-3 w-24">提示词数</th>
              <th className="px-4 py-3 w-32 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {cats.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  暂无分类
                </td>
              </tr>
            )}
            {cats.map((c, i) => (
              <tr key={c.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-30"
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === cats.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-30"
                      title="下移"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-zinc-100">{c.name}</td>
                <td className="px-4 py-3 text-zinc-400">{c.nameEn}</td>
                <td className="px-4 py-3">
                  {loadingCounts ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                      {counts[c.id] ?? 0}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="mr-2 text-sky-400 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="text-rose-400 hover:underline"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
