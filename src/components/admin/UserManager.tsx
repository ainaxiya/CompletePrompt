"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  membershipLevel: string;
  membershipUntil: string | null;
  createdAt: string;
  _count: { prompts: number };
};

export default function UserManager() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [tiers, setTiers] = useState<string[]>(["free", "pro", "vip"]);
  const [me, setMe] = useState<number>(0);

  const load = useCallback(async () => {
    const ps = new URLSearchParams({ page: String(page) });
    if (q) ps.set("q", q);
    const [r, s, m] = await Promise.all([
      fetch("/api/admin/users?" + ps.toString()).then((x) => x.json()),
      fetch("/api/admin/settings").then((x) => x.json()),
      fetch("/api/me").then((x) => x.json()),
    ]);
    setRows(r.list || []);
    setTotal(r.total || 0);
    setTiers((s.membership?.tiers || []).map((t: any) => t.level));
    setMe(m.user?.id || 0);
  }, [page, q]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: number, data: any, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const r = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "操作失败");
      return;
    }
    load();
  };

  const grant = (id: number) => {
    const level = prompt("会员等级（" + tiers.join(" / ") + "）：", "pro");
    if (!level || !tiers.includes(level)) return;
    const days = parseInt(prompt("开通天数（30/90/365…，0 取消）：", "30") || "0");
    if (isNaN(days)) return;
    patch(id, { membershipLevel: level, membershipDays: days });
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }} className="mb-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="用户名 / 邮箱搜索…"
          className="min-w-[240px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-emerald-500" />
        <button className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700">搜索</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-zinc-900 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">用户</th>
              <th className="px-3 py-2 text-left">角色</th>
              <th className="px-3 py-2 text-left">会员</th>
              <th className="px-3 py-2 text-left">作品</th>
              <th className="px-3 py-2 text-left">注册时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2.5 text-zinc-500">{u.id}</td>
                <td className="px-3 py-2.5">
                  <span className={u.status === "banned" ? "text-rose-400 line-through" : "text-zinc-200"}>
                    {u.username}
                  </span>
                  {u.id === me && <span className="ml-2 text-xs text-emerald-400">(你)</span>}
                  {u.email && <p className="text-xs text-zinc-500">{u.email}</p>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${u.role === "admin" ? "bg-amber-500/15 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>
                    {u.role === "admin" ? "管理员" : "用户"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {u.membershipLevel !== "free" ? (
                    <>
                      <span className="text-amber-300">{String(u.membershipLevel).toUpperCase()}</span>
                      {u.membershipUntil && (
                        <p className="text-zinc-600">至 {u.membershipUntil.slice(0, 10)}</p>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-400">{u._count.prompts}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{u.createdAt.slice(0, 10)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5 text-xs">
                    <button onClick={() => grant(u.id)}
                      className="rounded bg-amber-700/70 px-2 py-1 text-amber-100 hover:bg-amber-600">
                      会员
                    </button>
                    {u.role !== "admin" ? (
                      <button
                        onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" }, "确认设为管理员？")}
                        className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600"
                        disabled={u.id === me}
                      >
                        设为管理
                      </button>
                    ) : (
                      <button
                        onClick={() => patch(u.id, { role: "user" }, "确认取消管理员？")}
                        className="rounded bg-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-600"
                        disabled={u.id === me}
                      >
                        取消管理
                      </button>
                    )}
                    {u.status === "banned" ? (
                      <button onClick={() => patch(u.id, { status: "active" })}
                        className="rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600">
                        解封
                      </button>
                    ) : (
                      <button onClick={() => patch(u.id, { status: "banned" }, "确认封禁该用户？")}
                        className="rounded bg-rose-800/80 px-2 py-1 text-rose-100 hover:bg-rose-700"
                        disabled={u.id === me}>
                        封禁
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
        <span>共 {total} 人，{page} / {Math.max(1, totalPages)}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-700">上一页</button>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-700">下一页</button>
        </div>
      </div>
    </div>
  );
}
