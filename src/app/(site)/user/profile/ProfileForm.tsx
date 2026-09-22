"use client";

import { useRef, useState } from "react";
import UserAvatar from "@/components/UserAvatar";

export type ProfileUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  createdAt: string; // ISO 字符串
};

export default function ProfileForm({ initial }: { initial: ProfileUser }) {
  const [nickname, setNickname] = useState(initial.nickname || "");
  const [avatar, setAvatar] = useState(initial.avatar || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadAvatar = async (file: File) => {
    setErr("");
    if (file.size > 10 * 1024 * 1024) {
      setErr("头像不能超过 10MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/user/avatar/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "上传失败");
        return;
      }
      setAvatar(d.url);
    } catch {
      setErr("上传失败");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname || null,
          avatar: avatar || null,
          bio: bio || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "保存失败");
        return;
      }
      setMsg("已保存 ✓");
      setTimeout(() => setMsg(""), 2000);
    } catch {
      setErr("网络错误");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="mb-4 text-base font-semibold text-zinc-100">编辑资料</h2>

      {/* 头像 */}
      <div className="mb-4 flex items-center gap-4">
        <UserAvatar src={avatar} name={nickname || initial.username} size={64} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {uploading ? "上传中…" : "更换头像"}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar("")}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-700"
            >
              移除
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAvatar(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* 昵称 */}
      <label className="mb-4 block">
        <span className="mb-1 block text-sm text-zinc-400">昵称</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={32}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </label>

      {/* 头像 URL */}
      <label className="mb-4 block">
        <span className="mb-1 block text-sm text-zinc-400">头像 URL</span>
        <input
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </label>

      {/* 简介 */}
      <label className="mb-4 block">
        <span className="mb-1 block text-sm text-zinc-400">简介</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={200}
          className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </label>

      {err && <p className="mb-3 text-sm text-rose-400">{err}</p>}
      {msg && <p className="mb-3 text-sm text-emerald-400">{msg}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
