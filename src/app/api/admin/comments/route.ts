import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const VALID_STATUS = ["published", "hidden", "deleted"];

// GET /api/admin/comments?status=&q=&promptId=&userId=&page=
export async function GET(req: NextRequest) {
  const { ok } = await requirePerm(PERMISSIONS.COMMENT_READ);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";
  const q = (searchParams.get("q") || "").trim();
  const promptId = Number(searchParams.get("promptId") || 0);
  const userId = Number(searchParams.get("userId") || 0);
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const where: any = {};
  if (status && VALID_STATUS.includes(status)) where.status = status;
  if (q) where.content = { contains: q, mode: "insensitive" };
  if (promptId) where.promptId = promptId;
  if (userId) where.userId = userId;

  const [list, total, counts] = await Promise.all([
    db.comment.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, username: true, nickname: true, commentBanned: true } },
        prompt: { select: { id: true, title: true } },
      },
    }),
    db.comment.count({ where }),
    db.comment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    list,
    total,
    page,
    pageSize: PAGE_SIZE,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
}
