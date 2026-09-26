"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADMIN_BASE } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

function AdminLoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "登录失败");
        return;
      }
      const next = sp.get("next") || ADMIN_BASE;
      router.replace(next);
      router.refresh();
    } catch {
      setErr("网络错误，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 50% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(700px 500px at 100% 110%, rgba(16,185,129,0.10), transparent 60%)",
        backgroundColor: "#0b0f29",
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#0f1630]/90 p-7 shadow-2xl"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/icon.png" alt="logo" className="h-12 w-12 rounded-xl object-cover" />
          <h1 className="mt-3 text-lg font-bold tracking-wide text-gold-gradient">完整提示词</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-[10px] tracking-[0.3em] text-emerald-400">
              ADMIN
            </span>
            <span className="text-xs text-zinc-500">管理员登录</span>
          </div>
        </div>

        <label className="mb-1 block text-xs text-zinc-400">管理员账号</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="请输入管理员账号"
        />
        <label className="mb-1 block text-xs text-zinc-400">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="请输入密码"
        />

        {err && (
          <div className="mb-3 rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "登录中…" : "登 录"}
        </button>
        <p className="mt-4 text-center text-[11px] text-zinc-600">
          此为管理员专用入口，会员请从前台登录
        </p>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginInner />
    </Suspense>
  );
}
