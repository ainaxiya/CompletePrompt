import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/comments/:id/like  登录切换点赞，返回 { active, count }
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const commentId = parseInt((await ctx.params).id);
  if (!commentId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, status: true, likeCount: true },
  });
  if (!comment || comment.status !== "published") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const existing = await db.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId: user.id } },
  });

  let active: boolean;
  if (existing) {
    await db.commentLike.delete({ where: { id: existing.id } });
    await db.comment.update({
      where: { id: commentId },
      data: { likeCount: { decrement: 1 } },
    });
    active = false;
  } else {
    try {
      await db.commentLike.create({ data: { commentId, userId: user.id } });
      await db.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
      });
      active = true;
    } catch (e: any) {
      // 并发双击触发唯一约束：视为已赞，不改计数
      if (e?.code !== "P2002") throw e;
      active = true;
    }
  }

  const fresh = await db.comment.findUnique({
    where: { id: commentId },
    select: { likeCount: true },
  });
  return NextResponse.json({ active, count: fresh?.likeCount ?? 0 });
}
