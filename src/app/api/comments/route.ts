import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { clientIp } from "@/lib/rate-limit";
import { consumeCaptcha } from "@/lib/captcha";
import { COMMENT, maskSensitive } from "@/lib/comment-policy";

export const dynamic = "force-dynamic";

const userSelect = {
  id: true,
  username: true,
  nickname: true,
  avatar: true,
} as const;

// 组装某批顶级评论的一级回复（asc），并标记当前用户是否已赞
async function attachReplies(topIds: number[], currentUserId: number | null) {
  if (!topIds.length) return new Map<number, any[]>();
  const replies = await db.comment.findMany({
    where: { parentId: { in: topIds }, status: "published" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: userSelect },
      ...(currentUserId
        ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
        : {}),
    },
  });
  const map = new Map<number, any[]>();
  for (const r of replies as any[]) {
    const arr = map.get(r.parentId!) || [];
    arr.push(presentComment(r, currentUserId));
    map.set(r.parentId!, arr);
  }
  return map;
}

// 对外视图：剔除 ip/ua 等审核取证字段（调用方自行挂 replies）
function presentComment(c: any, currentUserId: number | null) {
  return {
    id: c.id,
    userId: c.userId,
    promptId: c.promptId,
    content: c.content,
    parentId: c.parentId,
    status: c.status,
    likeCount: c.likeCount,
    liked: currentUserId ? (c.likes?.length ?? 0) > 0 : false,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    user: c.user
      ? {
          id: c.user.id,
          username: c.user.username,
          nickname: c.user.nickname,
          avatar: c.user.avatar,
        }
      : null,
  };
}

// GET /api/comments?promptId=&page=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const promptId = parseInt(searchParams.get("promptId") || "0");
  if (!promptId) return NextResponse.json({ error: "promptId required" }, { status: 400 });

  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const prompt = await db.prompt.findUnique({
    where: { id: promptId },
    select: { id: true, commentsClosed: true },
  });
  if (!prompt) return NextResponse.json({ error: "prompt not found" }, { status: 404 });

  const me = await getCurrentUser();
  const currentUserId = me?.id ?? null;
  const settings = await getSettings();

  // 顶级评论：正常评论 + 仍有公开回复的已删评论（显示「该评论已删除」占位）；
  // hidden 评论及其回复对公众完全不可见
  const topWhere = {
    promptId,
    parentId: null,
    OR: [
      { status: "published" },
      { status: "deleted", replies: { some: { status: "published" } } },
    ],
  };

  const [rows, total] = await Promise.all([
    db.comment.findMany({
      where: topWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * COMMENT.PAGE_SIZE,
      take: COMMENT.PAGE_SIZE,
      include: {
        user: { select: userSelect },
        ...(currentUserId
          ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
          : {}),
      },
    }),
    db.comment.count({ where: topWhere }),
  ]);

  const replyMap = await attachReplies(rows.map((r) => r.id), currentUserId);
  const list = (rows as any[]).map((c) => {
    if (c.status === "deleted") {
      return {
        id: c.id,
        promptId: c.promptId,
        parentId: null,
        status: "deleted",
        deleted: true,
        content: "",
        likeCount: 0,
        createdAt: c.createdAt,
        user: null,
        liked: false,
        replies: replyMap.get(c.id) || [],
      };
    }
    return { ...presentComment(c, currentUserId), replies: replyMap.get(c.id) || [] };
  });

  // 全站开关关闭或单篇关评 → 前端只读
  const closed = !settings.comment.enabled || prompt.commentsClosed;

  return NextResponse.json({ list, total, page, pageSize: COMMENT.PAGE_SIZE, closed });
}

const createSchema = z.object({
  promptId: z.number().int().positive(),
  content: z.string().trim().min(1).max(COMMENT.MAX_LEN),
  parentId: z.number().int().positive().nullable().optional(),
  captchaId: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

// POST /api/comments  创建评论/回复（需登录）
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 禁言（与登录封禁独立）
  if (user.commentBanned) {
    return NextResponse.json({ error: "banned", message: "你已被禁言，暂不能发表评论" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "bad params" }, { status: 400 });
  }
  const d = parsed.data;

  // 全站开关
  const settings = await getSettings();
  if (!settings.comment.enabled) {
    return NextResponse.json({ error: "comments_disabled", message: "全站评论已关闭" }, { status: 403 });
  }

  const prompt = await db.prompt.findUnique({
    where: { id: d.promptId },
    select: { id: true, status: true, commentsClosed: true },
  });
  if (!prompt) return NextResponse.json({ error: "prompt not found" }, { status: 404 });
  if (prompt.status !== "published") {
    return NextResponse.json({ error: "prompt not published" }, { status: 400 });
  }
  if (prompt.commentsClosed) {
    return NextResponse.json({ error: "comments_closed", message: "该内容已关闭评论" }, { status: 403 });
  }

  // 父评论：必须存在、同 prompt、且只能是顶级评论（两级结构）
  if (d.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: d.parentId },
      select: { id: true, promptId: true, parentId: true, status: true },
    });
    if (!parent || parent.promptId !== d.promptId || parent.status !== "published") {
      return NextResponse.json({ error: "parent comment invalid" }, { status: 400 });
    }
    if (parent.parentId !== null) {
      return NextResponse.json({ error: "only two levels allowed" }, { status: 400 });
    }
  }

  // 限频：以 DB 实际计数为准（窗口内所有尝试都计入）
  const now = Date.now();
  const [recent60s, recent10m] = await Promise.all([
    db.comment.count({ where: { userId: user.id, createdAt: { gte: new Date(now - COMMENT.HARD_WINDOW_MS) } } }),
    db.comment.count({ where: { userId: user.id, createdAt: { gte: new Date(now - COMMENT.CAPTCHA_ARMED_MS) } } }),
  ]);

  // 第 7 条起硬拒
  if (recent60s >= COMMENT.HARD_LIMIT) {
    return NextResponse.json(
      { error: "rate_limited", message: "发言太频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 第 4 条起（recent>=3）或 10 分钟内已触发过（recent10m>=4）需要验证码
  const captchaRequired = recent60s >= COMMENT.CAPTCHA_THRESHOLD - 1 || recent10m >= COMMENT.CAPTCHA_THRESHOLD;
  if (captchaRequired) {
    const okCaptcha = consumeCaptcha(d.captchaId, d.captchaAnswer);
    if (!okCaptcha) {
      return NextResponse.json(
        { error: "captcha_required", captchaRequired: true, message: "请完成算术验证" },
        { status: 429 }
      );
    }
  }

  // 敏感词：星号替换后直发
  const { text: maskedContent, hits } = maskSensitive(d.content, settings.comment.sensitiveWords);

  const ip = clientIp(req);
  const ua = (req.headers.get("user-agent") || "").slice(0, 300) || null;

  const comment = await db.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: {
        userId: user.id,
        promptId: d.promptId,
        content: maskedContent,
        parentId: d.parentId ?? null,
        ip,
        ua,
      },
      include: { user: { select: userSelect } },
    });
    await tx.prompt.update({
      where: { id: d.promptId },
      data: { commentCount: { increment: 1 } },
    });
    return c;
  });

  return NextResponse.json({
    ...presentComment(comment, user.id),
    parentId: comment.parentId ?? null,
    replies: [],
    liked: false,
    maskedHits: hits.length,
  });
}
