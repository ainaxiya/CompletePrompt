import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/user/profile  当前用户资料
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      bio: true,
      role: true,
      membershipLevel: true,
      membershipUntil: true,
      status: true,
      createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(user);
}

// PUT /api/user/profile  更新当前用户资料（nickname, avatar, bio）
export async function PUT(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const data: any = {};

  if (typeof body?.nickname === "string") {
    const nickname = body.nickname.trim();
    if (nickname.length > 30) {
      return NextResponse.json({ error: "昵称过长（最多 30 字符）" }, { status: 400 });
    }
    data.nickname = nickname || null;
  }
  if (typeof body?.avatar === "string") {
    // avatar 通常是上传后返回的路径 /uploads/avatars/xxx.webp
    if (body.avatar.length > 500) {
      return NextResponse.json({ error: "avatar 路径过长" }, { status: 400 });
    }
    data.avatar = body.avatar || null;
  }
  if (typeof body?.bio === "string") {
    const bio = body.bio.trim();
    if (bio.length > 500) {
      return NextResponse.json({ error: "简介过长（最多 500 字符）" }, { status: 400 });
    }
    data.bio = bio || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: currentUser.id },
    data,
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
      bio: true,
    },
  });

  return NextResponse.json(updated);
}
