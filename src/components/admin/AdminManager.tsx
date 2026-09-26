"use client";

// 管理员设置（仅超级管理员）：列表、新建、详情全字段修改（账号只读）、
// 快捷启禁用、重置密码、删除（带超管存活保护）
import { useEffect, useState } from "react";
import OptionDropdown from "@/components/OptionDropdown";

type AdminItem = {
  id: number;
  username: string;
  nickname: string | null;
  status: string;
  isSuper: boolean;
  adminRoleId: number | null;
  adminRole: { name: string } | null;
  createdIp: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
};
type Role = { id: number; name: string };

const STATUS_OPTS = [
  { value: "active", label: "有效", tone: "green" as const },
  { value: "disabled", label: "禁用", tone: "red" as const },
];
const SUPER_OPTS = [
  { value: "super", label: "超级管理员", tone: "amber" as const },
  { value: "role", label: "按权限角色", tone: "indigo" as const },
];

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "—");

export default function AdminManager({ currentAdminId }: { currentAdminId: number }) {
  const [list, setList] = useState<AdminItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);

  const load = async () => {
    const [lr, rr] = await Promise.all([
      fetch("/api/admin/admins").then((r) => r.json()),
      fetch("/api/admin/roles").then((r) => r.json()),
    ]);
    setList(lr.list || []);
    setRoles(Array.isArray(rr) ? rr : []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const quickStatus = async (a: AdminItem, status: string) => {
    const r = await fetch(`/api/admin/admins/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(d.error || "操作失败");
      load();
      return;
    }
    setList((xs) => xs.map((x) => (x.id === a.id ? { ...x, status } : x)));
  };

  if (loading) return <p className="text-sm text-zinc-500">加载中…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-zinc-500">共 {list.length} 个管理员账号；点击行可查看与修改全部信息</p>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + 新建管理员
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-900/70 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">昵称</th>
              <th className="px-4 py-3">权限</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">添加时间</th>
              <th className="px-4 py-3">最后登录</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr
                key={a.id}
                onClick={() => setEditing(a)}
                className="cursor-pointer border-t border-zinc-800/70 hover:bg-zinc-900/40"
              >
                <td className="px-4 py-3 font-medium text-zinc-200">
                  {a.username}
                  {a.id === currentAdminId && (
                    <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">当前</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{a.nickname || "—"}</td>
                <td className="px-4 py-3">
                  {a.isSuper ? (
                    <span className="text-xs text-amber-400">超级管理员</span>
                  ) : (
                    <span className="text-xs text-indigo-300">{a.adminRole?.name || "未分配角色"}</span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <OptionDropdown
                    value={a.status}
                    options={STATUS_OPTS}
                    onChange={(v) => quickStatus(a, v)}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{fmt(a.createdAt)}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {a.lastLoginAt ? `${fmt(a.lastLoginAt)}${a.lastLoginIp ? ` · ${a.lastLoginIp}` : ""}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editing && (
        <EditModal
          admin={list.find((x) => x.id === editing.id) || editing}
          roles={roles}
          isSelf={editing.id === currentAdminId}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0f1630] p-4 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const labelCls = "mb-1 block text-xs text-zinc-400";

function CreateModal({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ username: "", nickname: "", password: "", isSuper: true, adminRoleId: 0, status: "active" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: f.username.trim(),
          nickname: f.nickname.trim(),
          password: f.password,
          isSuper: f.isSuper,
          adminRoleId: f.isSuper ? null : f.adminRoleId || null,
          status: f.status,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "创建失败");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="新建管理员" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>管理员账号（唯一，3-20 位字母数字下划线）</label>
          <input className={inputCls} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="登录账号" />
        </div>
        <div>
          <label className={labelCls}>昵称（后台展示用）</label>
          <input className={inputCls} value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} placeholder="可选" />
        </div>
        <div>
          <label className={labelCls}>初始密码（至少 6 位）</label>
          <input className={inputCls} type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="登录密码" />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className={labelCls}>权限类型</label>
            <OptionDropdown
              value={f.isSuper ? "super" : "role"}
              options={SUPER_OPTS}
              onChange={(v) => setF({ ...f, isSuper: v === "super" })}
              size="md"
            />
          </div>
          <div className={f.isSuper ? "opacity-40" : ""}>
            <label className={labelCls}>权限角色</label>
            <select
              className={inputCls + " w-44 appearance-none"}
              disabled={f.isSuper}
              value={f.adminRoleId}
              onChange={(e) => setF({ ...f, adminRoleId: Number(e.target.value) })}
            >
              <option value={0}>请选择角色</option>
              {roles
                .filter((r) => r.name !== "超级管理员")
                .map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>账户状态</label>
          <OptionDropdown value={f.status} options={STATUS_OPTS} onChange={(v) => setF({ ...f, status: v })} size="md" />
        </div>
        {err && <p className="text-xs text-rose-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">取消</button>
          <button
            onClick={submit}
            disabled={busy || !f.username || !f.password || (!f.isSuper && !f.adminRoleId)}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "提交中…" : "创建"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditModal({
  admin,
  roles,
  isSelf,
  onClose,
  onDone,
}: {
  admin: AdminItem;
  roles: Role[];
  isSelf: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nickname, setNickname] = useState(admin.nickname || "");
  const [status, setStatus] = useState(admin.status);
  const [isSuper, setIsSuper] = useState(admin.isSuper);
  const [roleId, setRoleId] = useState(admin.adminRoleId || 0);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setErr("");
    const r = await fetch(`/api/admin/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error || "操作失败");
      return false;
    }
    if (okMsg) alert(okMsg);
    return true;
  };

  const saveAll = async () => {
    setBusy(true);
    const ok = await patch({
      nickname: nickname.trim(),
      status,
      isSuper,
      adminRoleId: isSuper ? null : roleId || null,
    });
    setBusy(false);
    if (ok) onDone();
  };

  const resetPwd = async () => {
    if (newPassword.length < 6) {
      setErr("新密码至少 6 位");
      return;
    }
    const ok = await patch({ newPassword }, "密码已重置");
    if (ok) setNewPassword("");
  };

  const del = async () => {
    if (!confirm(`确认删除管理员「${admin.username}」？此操作不可恢复。`)) return;
    setErr("");
    const r = await fetch(`/api/admin/admins/${admin.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error || "删除失败");
      return;
    }
    onDone();
  };

  return (
    <ModalShell title={`管理员详情 · ${admin.username}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>账号（不可修改）</label>
          <input className={inputCls + " opacity-60"} value={admin.username} disabled readOnly />
        </div>
        <div>
          <label className={labelCls}>昵称</label>
          <input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div>
            <label className={labelCls}>账户状态</label>
            <OptionDropdown
              value={status}
              options={STATUS_OPTS}
              onChange={setStatus}
              size="md"
              disabled={isSelf}
            />
            {isSelf && <p className="mt-1 text-[10px] text-zinc-600">不能禁用自己</p>}
          </div>
          <div>
            <label className={labelCls}>权限类型</label>
            <OptionDropdown
              value={isSuper ? "super" : "role"}
              options={SUPER_OPTS}
              onChange={(v) => setIsSuper(v === "super")}
              size="md"
              disabled={isSelf}
            />
            {isSelf && <p className="mt-1 text-[10px] text-zinc-600">不能降级自己</p>}
          </div>
        </div>
        {!isSuper && (
          <div>
            <label className={labelCls}>权限角色</label>
            <select
              className={inputCls + " appearance-none"}
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
            >
              <option value={0}>请选择角色</option>
              {roles
                .filter((r) => r.name !== "超级管理员")
                .map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
            </select>
          </div>
        )}

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-500">
          <div className="grid grid-cols-2 gap-y-1.5">
            <span>添加时间：{fmt(admin.createdAt)}</span>
            <span>注册 IP：{admin.createdIp || "—"}</span>
            <span>最后登录：{fmt(admin.lastLoginAt)}</span>
            <span>登录 IP：{admin.lastLoginIp || "—"}</span>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <label className={labelCls}>重置密码（留空则不修改）</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="输入新密码"
            />
            <button
              onClick={resetPwd}
              disabled={!newPassword}
              className="shrink-0 rounded-lg border border-amber-700/60 px-4 py-2 text-sm text-amber-300 hover:bg-amber-900/30 disabled:opacity-40"
            >
              重置密码
            </button>
          </div>
        </div>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex items-center justify-between pt-2">
          {!isSelf ? (
            <button onClick={del} className="rounded-lg border border-rose-800/70 px-4 py-2 text-sm text-rose-300 hover:bg-rose-950/40">
              删除该管理员
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">关闭</button>
            <button
              onClick={saveAll}
              disabled={busy || (!isSuper && !roleId)}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
