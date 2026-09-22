import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/comments?promptId=&page=&pageSize=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const promptId = parseInt(searchParams.get("promptId") || "0");
  if (!promptId) return NextResponse.json({ error: "promptId required" }, { status: 400 });

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 50)));

  const [list, total] = await Promise.all([
    db.comment.findMany({
      where: { promptId, status: "published" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
          },
        },
      },
    }),
    db.comment.count({ where: { promptId, status: "published" } }),
  ]);

  return NextResponse.json({ list, total, page, pageSize });
}

// POST /api/comments  创建评论（需登录）
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const promptId = Number(body?.promptId);
  const content = (body?.content || "").trim();
  const parentId = body?.parentId ? Number(body.parentId) : null;

  if (!promptId) return NextResponse.json({ error: "promptId required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "评论内容不能为空" }, { status: 400 });
  if (content.length > 5000) return NextResponse.json({ error: "评论内容过长" }, { status: 400 });

  const prompt = await db.prompt.findUnique({
    where: { id: promptId },
    select: { id: true, commentCount: true },
  });
  if (!prompt) return NextResponse.json({ error: "prompt not found" }, { status: 404 });

  // 校验父评论存在且同属此 prompt
  if (parentId) {
    const parent = await db.comment.findUnique({
      where: { id: parentId },
      select: { id: true, promptId: true },
    });
    if (!parent || parent.promptId !== promptId) {
      return NextResponse.json({ error: "parent comment invalid" }, { status: 400 });
    }
  }

  const comment = await db.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: {
        userId: user.id,
        promptId,
        content,
        parentId,
      },
      include: {
        user: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
      },
    });
    await tx.prompt.update({
      where: { id: promptId },
      data: { commentCount: { increment: 1 } },
    });
    return c;
  });

  return NextResponse.json(comment);
}
