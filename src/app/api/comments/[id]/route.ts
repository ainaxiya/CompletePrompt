import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// DELETE /api/comments/:id  评论主人或管理员可删（软删除）
export async function DELETE(
  _req: NextRequest,
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
    const user = await getCurrentUser();
    if (!user || user.id !== comment.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (comment.status !== "deleted") {
    await db.$transaction(async (tx) => {
      await tx.comment.update({ where: { id: cid }, data: { status: "deleted" } });
      // 仅此前公开可见的评论扣减计数
      if (comment.status === "published") {
        await tx.prompt.update({
          where: { id: comment.promptId },
          data: { commentCount: { decrement: 1 } },
        });
      }
    });
  }

  if (ok && admin) {
    await logAdminAction({
      adminId: admin.id,
      action: "delete",
      targetType: "comment",
      targetId: cid,
      detail: JSON.stringify({ promptId: comment.promptId, ownerId: comment.userId }),
      ip: await getClientIp(),
    });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/comments/:id  管理员隐藏/恢复（published <-> hidden）
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
  // 已删除不可逆
  if (comment.status === "deleted" || status === comment.status) {
    return NextResponse.json({ error: "illegal transition" }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: cid }, data: { status } });
    await tx.prompt.update({
      where: { id: comment.promptId },
      data: { commentCount: { [status === "published" ? "increment" : "decrement"]: 1 } },
    });
  });

  await logAdminAction({
    adminId: user.id,
    action: "update",
    targetType: "comment",
    targetId: cid,
    detail: JSON.stringify({ from: comment.status, to: status, promptId: comment.promptId }),
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true });
}
