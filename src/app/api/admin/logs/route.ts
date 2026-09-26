import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/admin/logs?page=&pageSize=&q=管理员账号&action=&targetType=
export async function GET(req: NextRequest) {
  const { ok } = await requirePerm(PERMISSIONS.LOG_READ);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));
  const q = (searchParams.get("q") || "").trim();
  const action = searchParams.get("action");
  const targetType = searchParams.get("targetType");

  const where: any = {};
  if (q) {
    where.OR = [
      { admin: { username: { contains: q, mode: "insensitive" } } },
      { user: { username: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;

  const [list, total] = await Promise.all([
    db.adminLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        admin: { select: { id: true, username: true, nickname: true } },
        user: { select: { id: true, username: true, nickname: true } },
      },
    }),
    db.adminLog.count({ where }),
  ]);

  return NextResponse.json({ list, total, page, pageSize });
}
