import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const { id, kind } = await params;
  const pid = parseInt(id);
  if (!pid || !["like", "favorite"].includes(kind)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const prompt = await db.prompt.findUnique({
    where: { id: pid },
    select: { id: true, status: true },
  });
  if (!prompt || prompt.status !== "published") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isLike = kind === "like";
  const key = { userId: user.id, promptId: pid } as const;

  const existing = await (isLike
    ? db.like.findUnique({ where: { userId_promptId: key } })
    : db.favorite.findUnique({ where: { userId_promptId: key } }));

  let active: boolean;
  if (existing) {
    try {
      if (isLike) {
        await db.like.delete({ where: { userId_promptId: key } });
      } else {
        await db.favorite.delete({ where: { userId_promptId: key } });
      }
      active = false;
    } catch {
      // 并发已被另一个请求删除，视同已取消
      active = false;
    }
  } else {
    try {
      if (isLike) {
        await db.like.create({ data: key });
      } else {
        await db.favorite.create({ data: key });
      }
      active = true;
    } catch {
      active = true; // 并发已插入
    }
  }

  const delta = active ? 1 : -1;
  const updated = await db.prompt.update({
    where: { id: pid },
    data: isLike
      ? { likeCount: { increment: delta } }
      : { favoriteCount: { increment: delta } },
    select: { likeCount: true, favoriteCount: true },
  });

  return NextResponse.json({
    active,
    count: isLike ? updated.likeCount : updated.favoriteCount,
  });
}
