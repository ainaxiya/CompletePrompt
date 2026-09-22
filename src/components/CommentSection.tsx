"use client";

import { useState, useEffect, useCallback } from "react";
import UserAvatar from "./UserAvatar";

export type CommentUser = {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
};

export type CommentData = {
  id: number;
  userId: number;
  promptId: number;
  content: string;
  parentId?: number | null;
  status?: string;
  likeCount?: number;
  createdAt: string; // ISO 字符串（由 server 端序列化传入）
  updatedAt?: string;
  user: CommentUser;
  replies?: CommentData[];
};

// 相对时间：3分钟前 / 2小时前 / 5天前 …
function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}个月前`;
  return `${Math.floor(mo / 12)}年前`;
}

export default function CommentSection({
  promptId,
  initialComments,
}: {
  promptId: number;
  initialComments: CommentData[];
}) {
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [me, setMe] = useState<{ id: number } | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [replyContent, setReplyContent] = useState("");

  // 获取当前登录用户
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.id) setMe({ id: d.user.id });
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?promptId=${promptId}`);
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.comments)) setComments(d.comments);
    } catch {
      /* ignore */
    }
  }, [promptId]);

  const submitTop = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId, content: content.trim() }),
      });
      if (res.status === 401) {
        location.href = `/login?next=/p/${promptId}`;
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "评论失败");
        return;
      }
      setContent("");
      await refresh();
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (parentId: number) => {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId, content: replyContent.trim(), parentId }),
      });
      if (res.status === 401) {
        location.href = `/login?next=/p/${promptId}`;
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "回复失败");
        return;
      }
      setReplyContent("");
      setReplyTo(null);
      await refresh();
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (id: number) => {
    if (!window.confirm("确定删除这条评论吗？")) return;
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) await refresh();
    } catch {
      /* ignore */
    }
  };

  const like = async (id: number) => {
    // 乐观更新
    setComments((prev) => mapComment(prev, id, (c) => ({ ...c, likeCount: (c.likeCount || 0) + 1 })));
    try {
      await fetch(`/api/comments/${id}/like`, { method: "POST" });
    } catch {
      /* ignore */
    }
  };

  function mapComment(
    list: CommentData[],
    id: number,
    fn: (c: CommentData) => CommentData
  ): CommentData[] {
    return list.map((c) => {
      if (c.id === id) return fn(c);
      if (c.replies?.length) return { ...c, replies: mapComment(c.replies, id, fn) };
      return c;
    });
  }

  const displayName = (u: CommentUser) => u.nickname || u.username;

  const renderComment = (c: CommentData, isReply = false) => {
    const isMine = me?.id === c.userId;
    return (
      <div key={c.id} className={isReply ? "ml-12 mt-3" : "mt-5 first:mt-0"}>
        <div className="flex gap-3">
          <UserAvatar src={c.user.avatar} name={displayName(c.user)} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">{displayName(c.user)}</span>
              <span className="text-xs text-zinc-500">{timeAgo(c.createdAt)}</span>
              {isMine && (
                <button
                  onClick={() => del(c.id)}
                  className="ml-auto text-xs text-zinc-500 transition hover:text-rose-400"
                >
                  删除
                </button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {c.content}
            </p>
            <div className="mt-1.5 flex items-center gap-4">
              <button
                onClick={() => like(c.id)}
                className="text-xs text-zinc-500 transition hover:text-rose-400"
              >
                ♡ {c.likeCount || 0}
              </button>
              {!isReply && (
                <button
                  onClick={() =>
                    setReplyTo(
                      replyTo?.id === c.id ? null : { id: c.id, name: displayName(c.user) }
                    )
                  }
                  className="text-xs text-zinc-500 transition hover:text-indigo-400"
                >
                  回复
                </button>
              )}
            </div>
            {replyTo?.id === c.id && (
              <div className="mt-2 flex gap-2">
                <input
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`回复 @${replyTo.name}…`}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitReply(c.id);
                  }}
                />
                <button
                  onClick={() => submitReply(c.id)}
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  发送
                </button>
                <button
                  onClick={() => {
                    setReplyTo(null);
                    setReplyContent("");
                  }}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
        {c.replies?.length ? <div>{c.replies.map((r) => renderComment(r, true))}</div> : null}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-zinc-100">
        评论
        <span className="text-xs font-normal text-zinc-500">{comments.length}</span>
      </h2>

      {/* 评论输入框（仅登录后显示） */}
      {me ? (
        <div className="mb-5 flex gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下你的评论…"
            rows={2}
            className="min-h-[60px] flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          />
          <button
            onClick={submitTop}
            disabled={submitting || !content.trim()}
            className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "发送中…" : "发送"}
          </button>
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-500">
          <a href={`/login?next=/p/${promptId}`} className="text-indigo-400 hover:underline">
            登录
          </a>
          后参与评论
        </div>
      )}

      {error && <p className="mb-3 text-xs text-rose-400">{error}</p>}

      {/* 评论列表 */}
      {comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">还没有评论，来抢沙发吧</p>
      ) : (
        <div className="border-t border-zinc-800/70 pt-4">
          {comments.map((c) => renderComment(c))}
        </div>
      )}
    </section>
  );
}
