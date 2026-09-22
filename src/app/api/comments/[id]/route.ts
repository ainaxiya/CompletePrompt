import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// DELETE /api/comments/:id  评论主人或管理员可删
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const cid = parseInt(id);

  const comment = await db.comment.findUnique({
    where: { id: cid },
    select: { id: true, userId: true, promptId: true, status: true },
  });
  if (!comment) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 先尝试管理员权限
  const { user: admin, ok } = await requirePerm(PERMISSIONS.COMMENT_MODERATE);

  if (!ok) {
    // 非管理员则必须是评论主人
    const user = await getCurrentUser();
    if (!user || user.id !== comment.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // 软删除：标记为 deleted，同时递减 prompt.commentCount
  await db.$transaction(async (tx) => {
    await tx.comment.update({
      where: { id: cid },
      data: { status: "deleted" },
    });
    await tx.prompt.update({
      where: { id: comment.promptId },
      data: { commentCount: { decrement: 1 } },
    });
  });

  // 管理员操作记日志
  if (ok && admin) {
    await logAdminAction({
      userId: admin.id,
      action: "delete",
      targetType: "comment",
      targetId: cid,
      detail: JSON.stringify({ promptId: comment.promptId, ownerId: comment.userId }),
      ip: await getClientIp(),
    });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/comments/:id  管理员审核隐藏/恢复
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requirePerm(PERMISSIONS.COMMENT_MODERATE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const cid = parseInt(id);

  const comment = await db.comment.findUnique({
    where: { id: cid },
    select: { id: true, status: true, promptId: true },
  });
  if (!comment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!["published", "hidden"].includes(status)) {
    return NextResponse.json({ error: "status must be published or hidden" }, { status: 400 });
  }

  const updated = await db.comment.update({
    where: { id: cid },
    data: { status },
  });

  await logAdminAction({
    userId: user.id,
    action: "update",
    targetType: "comment",
    targetId: cid,
    detail: JSON.stringify({ from: comment.status, to: status, promptId: comment.promptId }),
    ip: await getClientIp(),
  });

  return NextResponse.json(updated);
}
