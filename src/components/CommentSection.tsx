"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import UserAvatar from "./UserAvatar";

export type CommentUser = {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
};

export type CommentData = {
  id: number;
  userId?: number | null;
  promptId: number;
  content: string;
  parentId?: number | null;
  status?: string;
  /** 软删除占位（有回复的已删顶级评论） */
  deleted?: boolean;
  likeCount?: number;
  liked?: boolean;
  createdAt: string;
  updatedAt?: string;
  user: CommentUser | null;
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

type PendingPost =
  | { kind: "top"; text: string }
  | { kind: "reply"; parentId: number; text: string };

export default function CommentSection({
  promptId,
  initialComments,
  closed: initialClosed = false,
  initialTotal,
}: {
  promptId: number;
  initialComments: CommentData[];
  closed?: boolean;
  initialTotal?: number;
}) {
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [total, setTotal] = useState<number>(initialTotal ?? initialComments.length);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [me, setMe] = useState<{ id: number; commentBanned?: boolean } | null>(null);
  const [closed, setClosed] = useState(initialClosed);

  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 验证码
  const [captcha, setCaptcha] = useState<{ id: string; q: string } | null>(null);
  const [captchaInput, setCaptchaInput] = useState("");
  const pendingRef = useRef<PendingPost | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.id) setMe({ id: d.user.id, commentBanned: !!d.user.commentBanned });
      })
      .catch(() => {});
  }, []);

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await fetch("/api/captcha");
      if (!res.ok) return;
      const d = await res.json();
      setCaptcha({ id: d.captchaId, q: d.question });
      setCaptchaInput("");
    } catch {
      /* ignore */
    }
  }, []);

  // 追加/替换评论树中的某条
  function mapTree(list: CommentData[], id: number, fn: (c: CommentData) => CommentData): CommentData[] {
    return list.map((c) => {
      if (c.id === id) return fn(c);
      if (c.replies?.length) return { ...c, replies: mapTree(c.replies, id, fn) };
      return c;
    });
  }

  // 把新建评论插入树（顶级放最前，回复插到对应父级末尾）
  function insertComment(list: CommentData[], c: CommentData): CommentData[] {
    if (!c.parentId) return [c, ...list];
    return list.map((top) =>
      top.id === c.parentId ? { ...top, replies: [...(top.replies || []), c] } : top
    );
  }

  // 统一提交（带可选验证码），返回 true=成功
  const doPost = useCallback(
    async (payload: Record<string, unknown>): Promise<{ ok: boolean; status?: number; data?: any }> => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          location.href = `/login?next=/p/${promptId}`;
          return { ok: false };
        }
        return { ok: res.ok, status: res.status, data };
      } catch {
        return { ok: false };
      }
    },
    [promptId]
  );

  const finishSuccess = (data: any, wasReply: boolean) => {
    const c: CommentData = {
      id: data.id,
      userId: data.userId,
      promptId: data.promptId,
      content: data.content,
      parentId: data.parentId ?? null,
      likeCount: 0,
      liked: false,
      createdAt: data.createdAt,
      user: data.user,
      replies: [],
    };
    setComments((prev) => insertComment(prev, c));
    setTotal((t) => t + 1);
    setContent("");
    setReplyContent("");
    setReplyTo(null);
    setCaptcha(null);
    setCaptchaInput("");
    pendingRef.current = null;
    if (data.maskedHits > 0) setNotice("部分内容包含敏感词，已自动屏蔽后发布");
  };

  const handleSubmit = async (pending: PendingPost) => {
    if (submitting) return;
    const base =
      pending.kind === "top"
        ? { promptId, content: pending.text }
        : { promptId, content: pending.text, parentId: pending.parentId };

    setSubmitting(true);
    setError("");
    const payload: Record<string, unknown> = { ...base };
    if (captcha) {
      payload.captchaId = captcha.id;
      payload.captchaAnswer = captchaInput;
    }
    const r = await doPost(payload);
    setSubmitting(false);

    if (r.status === 429 && r.data?.captchaRequired) {
      pendingRef.current = pending;
      // 验证码一次性，每次触发/答错都换发新题
      await loadCaptcha();
      setError(captcha ? "验证答案不正确，请重试" : "");
      return;
    }
    if (!r.ok) {
      if (r.status === 403 && r.data?.error === "banned") {
        setMe((m) => (m ? { ...m, commentBanned: true } : m));
      }
      setError(r.data?.message || r.data?.error || "发送失败，请稍后再试");
      return;
    }
    finishSuccess(r.data, pending.kind === "reply");
  };

  const submitTop = () => {
    const text = content.trim();
    if (!text) return;
    handleSubmit({ kind: "top", text });
  };
  const submitReply = (parentId: number) => {
    const text = replyContent.trim();
    if (!text) return;
    handleSubmit({ kind: "reply", parentId, text });
  };

  // 验证码确认：重放挂起的发言
  const confirmCaptcha = () => {
    if (!captchaInput.trim() || !pendingRef.current) return;
    handleSubmit(pendingRef.current);
  };

  const del = async (id: number) => {
    if (!window.confirm("确定删除这条评论吗？")) return;
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setComments((prev) =>
          // 顶级评论本地直接移除（接口会处理有回复保留占位，刷新后自然正确）
          prev
            .filter((c) => c.id !== id)
            .map((c) => ({ ...c, replies: (c.replies || []).filter((r) => r.id !== id) }))
        );
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch {
      /* ignore */
    }
  };

  const like = async (id: number) => {
    if (!me) {
      location.href = `/login?next=/p/${promptId}`;
      return;
    }
    // 乐观更新
    let reverted = false;
    setComments((prev) =>
      mapTree(prev, id, (c) => ({
        ...c,
        liked: !c.liked,
        likeCount: Math.max(0, (c.likeCount || 0) + (c.liked ? -1 : 1)),
      }))
    );
    try {
      const res = await fetch(`/api/comments/${id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setComments((prev) =>
        mapTree(prev, id, (c) => ({ ...c, liked: d.active, likeCount: d.count }))
      );
    } catch {
      reverted = true;
      setComments((prev) =>
        mapTree(prev, id, (c) => ({
          ...c,
          liked: !c.liked,
          likeCount: Math.max(0, (c.likeCount || 0) + (c.liked ? -1 : 1)),
        }))
      );
    }
    void reverted;
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetch(`/api/comments?promptId=${promptId}&page=${next}`);
      if (!res.ok) return;
      const d = await res.json();
      setComments((prev) => {
        const ids = new Set(prev.map((c) => c.id));
        return [...prev, ...(d.list as CommentData[]).filter((c) => !ids.has(c.id))];
      });
      setPage(next);
      if (typeof d.closed === "boolean") setClosed(d.closed);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const displayName = (u: CommentUser | null) => (u ? u.nickname || u.username : "用户");

  const renderCaptcha = () =>
    captcha && (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <span className="text-xs text-amber-300">安全验证：{captcha.q}</span>
        <input
          value={captchaInput}
          onChange={(e) => setCaptchaInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmCaptcha()}
          className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-amber-500"
          placeholder="答案"
          inputMode="numeric"
          autoFocus
        />
        <button
          onClick={confirmCaptcha}
          disabled={submitting || !captchaInput.trim()}
          className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
        >
          确认发送
        </button>
        <button onClick={loadCaptcha} className="text-xs text-zinc-400 hover:text-amber-300">
          换一题
        </button>
        <button
          onClick={() => {
            setCaptcha(null);
            pendingRef.current = null;
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          取消
        </button>
      </div>
    );

  const renderComment = (c: CommentData, isReply = false) => {
    const isMine = me?.id === c.userId;
    if (c.deleted) {
      return (
        <div key={c.id} className={isReply ? "ml-8 mt-3 sm:ml-12" : "mt-5 first:mt-0"}>
          <div className="flex gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-800" />
            <div className="min-w-0 flex-1">
              <p className="text-sm italic text-zinc-600">该评论已删除</p>
            </div>
          </div>
          {c.replies?.length ? <div>{c.replies.map((r) => renderComment(r, true))}</div> : null}
        </div>
      );
    }
    return (
      <div key={c.id} className={isReply ? "ml-8 mt-3 sm:ml-12" : "mt-5 first:mt-0"}>
        <div className="flex gap-2.5 sm:gap-3">
          <UserAvatar src={c.user?.avatar} name={displayName(c.user)} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">{displayName(c.user)}</span>
              <span className="text-xs text-zinc-500">{timeAgo(c.createdAt)}</span>
              {isMine && !closed && (
                <button
                  onClick={() => del(c.id)}
                  className="ml-auto text-xs text-zinc-500 transition hover:text-rose-400"
                >
                  删除
                </button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
              {c.content}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                onClick={() => like(c.id)}
                className={`flex items-center gap-1 text-xs transition ${
                  c.liked ? "text-rose-400" : "text-zinc-500 hover:text-rose-400"
                }`}
              >
                <span>{c.liked ? "♥" : "♡"}</span>
                <span>{c.likeCount || 0}</span>
              </button>
              {!isReply && !closed && (
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
            {replyTo?.id === c.id && !closed && (
              <div className="mt-2">
                <div className="flex gap-2">
                  <input
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder={`回复 @${replyTo.name}…`}
                    maxLength={1000}
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
                {pendingRef.current?.kind === "reply" && renderCaptcha()}
              </div>
            )}
          </div>
        </div>
        {c.replies?.length ? <div>{c.replies.map((r) => renderComment(r, true))}</div> : null}
      </div>
    );
  };

  const canPost = me && !me.commentBanned && !closed;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-zinc-100">
        评论
        <span className="text-xs font-normal text-zinc-500">{total}</span>
      </h2>

      {closed && (
        <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-400">
          评论已关闭，已有评论保留显示。
        </div>
      )}
      {!closed && me?.commentBanned && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
          你已被禁言，暂时无法发表评论。
        </div>
      )}

      {/* 评论输入 */}
      {canPost ? (
        <div className="mb-5">
          <div className="flex gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下你的评论…（最多 1000 字）"
              rows={2}
              maxLength={1000}
              className="min-h-[60px] flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
            <button
              onClick={submitTop}
              disabled={submitting || !content.trim()}
              className="min-h-[40px] self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "发送中…" : "发送"}
            </button>
          </div>
          {pendingRef.current?.kind === "top" && renderCaptcha()}
        </div>
      ) : !me && !closed ? (
        <div className="mb-5 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-500">
          <a href={`/login?next=/p/${promptId}`} className="text-indigo-400 hover:underline">
            登录
          </a>
          后参与评论
        </div>
      ) : null}

      {error && <p className="mb-3 text-xs text-rose-400">{error}</p>}
      {notice && !error && <p className="mb-3 text-xs text-amber-400/90">{notice}</p>}

      {comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">还没有评论，来抢沙发吧</p>
      ) : (
        <div className="border-t border-zinc-800/70 pt-4">
          {comments.map((c) => renderComment(c))}
          {comments.length < total && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-5 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 text-sm text-zinc-400 transition hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
            >
              {loadingMore ? "加载中…" : `加载更多（还有 ${total - comments.length} 条）`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
