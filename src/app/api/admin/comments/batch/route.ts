import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  // hide=隐藏 show=恢复 delete=软删除
  action: z.enum(["hide", "show", "delete"]),
});

// POST /api/admin/comments/batch
export async function POST(req: NextRequest) {
  const { user: admin, ok } = await requirePerm(PERMISSIONS.COMMENT_MODERATE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "bad params" }, { status: 400 });
  }
  const { ids, action } = parsed.data;
  const target = { hide: "hidden", show: "published", delete: "deleted" }[action] as string;

  const comments = await db.comment.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, promptId: true, userId: true },
  });

  let done = 0;
  for (const c of comments) {
    // 合法状态迁移与计数维护
    let delta = 0;
    let nextStatus = c.status;
    if (action === "hide" && c.status === "published") {
      nextStatus = "hidden";
      delta = -1;
    } else if (action === "show" && c.status === "hidden") {
      nextStatus = "published";
      delta = 1;
    } else if (action === "delete" && c.status !== "deleted") {
      nextStatus = "deleted";
      if (c.status === "published") delta = -1;
    } else {
      continue;
    }

    await db.$transaction(async (tx) => {
      await tx.comment.update({ where: { id: c.id }, data: { status: nextStatus } });
      if (delta !== 0) {
        await tx.prompt.update({
          where: { id: c.promptId },
          data: { commentCount: { [delta > 0 ? "increment" : "decrement"]: 1 } },
        });
      }
    });

    await logAdminAction({
      adminId: admin!.id,
      action: action === "delete" ? "delete" : "update",
      targetType: "comment",
      targetId: c.id,
      detail: JSON.stringify({ batch: true, from: c.status, to: nextStatus, promptId: c.promptId, ownerId: c.userId }),
      ip: await getClientIp(),
    });
    done++;
  }

  return NextResponse.json({ ok: true, done });
}
