"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, translate as t } from "@/lib/i18n-client";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const locale = useLocale();
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (mode === "register") {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => setClosed(!d.basic.allowRegister))
        .catch(() => {});
    }
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(
        d.error === "registration closed"
          ? t(locale, "auth.registrationClosed")
          : d.error || "Error"
      );
      return;
    }
    const rawNext = sp.get("next") || "/";
    // 仅允许站内路径，防开放重定向
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
        ? rawNext
        : "/";
    router.push(next);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h1 className="mb-6 text-center text-xl font-bold">
        {mode === "login" ? t(locale, "auth.loginTitle") : t(locale, "auth.registerTitle")}
      </h1>
      <label className="mb-1 block text-sm text-zinc-400">{t(locale, "auth.username")}</label>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_\-]+"
        className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <label className="mb-1 block text-sm text-zinc-400">{t(locale, "auth.password")}</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {error && <p className="mb-3 rounded bg-rose-500/10 p-2 text-sm text-rose-300">{error}</p>}
      {closed && mode === "register" && !error && (
        <p className="mb-3 rounded bg-amber-500/10 p-2 text-sm text-amber-300">
          {t(locale, "auth.registrationClosed")}
        </p>
      )}
      <button
        disabled={loading || (mode === "register" && closed)}
        className="w-full rounded-lg bg-emerald-500 py-2 font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {loading ? "…" : mode === "login" ? t(locale, "auth.login") : t(locale, "auth.register")}
      </button>
      <p className="mt-4 text-center text-sm text-zinc-500">
        {mode === "login" ? (
          <>
            <a href="/register" className="text-emerald-400 hover:underline">{t(locale, "auth.noAccount")}</a>
          </>
        ) : (
          <>
            <a href="/login" className="text-emerald-400 hover:underline">{t(locale, "auth.hasAccount")}</a>
          </>
        )}
      </p>
    </form>
  );
}
