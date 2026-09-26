"use client";

import { useState } from "react";
import { PERMISSION_GROUPS } from "@/lib/permissions";

type Role = {
  id: number;
  name: string;
  permissions: string[];
  description: string | null;
  createdAt: string;
  updatedAt: string;
  userCount: number;
};

type Props = { initial: Role[] };

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const labelCls = "mb-1 block text-sm text-zinc-400";

export default function RoleManager({ initial }: Props) {
  const [roles, setRoles] = useState<Role[]>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setPerms([]);
    setShowModal(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setName(r.name);
    setDescription(r.description || "");
    setPerms(r.permissions);
    setShowModal(true);
  };

  const togglePerm = (p: string) => {
    setPerms((prev) => {
      if (p === "*") return prev.includes("*") ? [] : ["*"];
      const without = prev.filter((x) => x !== "*");
      return without.includes(p) ? without.filter((x) => x !== p) : [...without, p];
    });
  };

  const toggleGroup = (groupPerms: string[]) => {
    const allSelected = groupPerms.every((p) => perms.includes(p));
    if (allSelected) {
      setPerms(perms.filter((p) => !groupPerms.includes(p) && p !== "*"));
    } else {
      const without = perms.filter((p) => p !== "*");
      setPerms([...new Set([...without, ...groupPerms])]);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      flash("err", "请输入角色名称");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        const r = await fetch(`/api/admin/roles/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            permissions: perms,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "保存失败");
        setRoles((prev) =>
          prev.map((x) =>
            x.id === editing.id
              ? { ...x, name: name.trim(), description: description.trim() || null, permissions: perms }
              : x,
          ),
        );
        flash("ok", "角色已更新");
      } else {
        const r = await fetch("/api/admin/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            permissions: perms,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "创建失败");
        setRoles((prev) => [...prev, { ...d, userCount: 0 }]);
        flash("ok", "角色已创建");
      }
      setShowModal(false);
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Role) => {
    if (r.userCount > 0) {
      flash("err", `该角色下还有 ${r.userCount} 个用户，无法删除`);
      return;
    }
    if (!confirm(`确认删除角色「${r.name}」？此操作不可恢复。`)) return;
    try {
      const res = await fetch(`/api/admin/roles/${r.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "删除失败");
      setRoles((prev) => prev.filter((x) => x.id !== r.id));
      flash("ok", "角色已删除");
    } catch (e) {
      flash("err", (e as Error).message);
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
        <p className="text-sm text-zinc-400">共 {roles.length} 个角色</p>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + 新建角色
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3 w-24">权限数</th>
              <th className="px-4 py-3 w-20">用户数</th>
              <th className="px-4 py-3">描述</th>
              <th className="px-4 py-3 w-32 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {roles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  暂无角色
                </td>
              </tr>
            )}
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-zinc-100">
                  {r.name}
                  {r.permissions.includes("*") && (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                      超级
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.permissions.includes("*") ? "全部" : r.permissions.length}
                </td>
                <td className="px-4 py-3 text-zinc-400">{r.userCount}</td>
                <td className="px-4 py-3 text-zinc-400">{r.description || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="mr-2 text-sky-400 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r)}
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-100">
              {editing ? "编辑角色" : "新建角色"}
            </h2>

            <div className="mb-4">
              <label className={labelCls}>角色名称 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="如：内容管理员"
              />
            </div>

            <div className="mb-4">
              <label className={labelCls}>描述</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
                placeholder="角色职责说明"
              />
            </div>

            <div className="mb-2">
              <label className={labelCls}>权限分配</label>
              <button
                type="button"
                onClick={() => togglePerm("*")}
                className={`mb-3 inline-block rounded-lg border px-3 py-1.5 text-sm ${
                  perms.includes("*")
                    ? "border-amber-500 bg-amber-500/15 text-amber-300"
                    : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                ★ 全部权限（超级管理员）
              </button>
            </div>

            <div
              className={`mb-4 space-y-3 ${perms.includes("*") ? "pointer-events-none opacity-40" : ""}`}
            >
              {PERMISSION_GROUPS.map((g) => {
                const allSel = g.perms.every((p) => perms.includes(p));
                const someSel = g.perms.some((p) => perms.includes(p));
                return (
                  <div key={g.label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={(el) => {
                          if (el) el.indeterminate = !allSel && someSel;
                        }}
                        onChange={() => toggleGroup(g.perms)}
                        className="accent-indigo-500"
                      />
                      {g.label}
                    </label>
                    <div className="flex flex-wrap gap-2 pl-6">
                      {g.perms.map((p) => (
                        <label
                          key={p}
                          className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                        >
                          <input
                            type="checkbox"
                            checked={perms.includes(p)}
                            onChange={() => togglePerm(p)}
                            className="accent-indigo-500"
                          />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-zinc-600 px-5 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
