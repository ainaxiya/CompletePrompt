import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nickname: z.string().max(20).optional(),
  email: z.string().email("邮箱格式不正确").max(100).or(z.literal("")).optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{6,20}$/, "手机号格式不正确")
    .or(z.literal(""))
    .optional(),
  avatar: z.string().url().max(500).or(z.literal("")).optional(),
  bio: z.string().max(500).optional(),
  status: z.enum(["active", "banned"]).optional(),
  allowPublish: z.boolean().optional(),
  // 评论禁言/解除（独立于登录封禁）
  commentBanned: z.boolean().optional(),
  newPassword: z.string().min(6, "新密码至少 6 位").max(72).optional(),
});

// PATCH /api/admin/users/:id  会员全字段修改 / 重置密码（账号不可改）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { admin, ok } = await requirePerm(PERMISSIONS.USER_WRITE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const uid = parseInt(id);
  const target = await db.user.findUnique({ where: { id: uid } });
  if (!target || target.role !== "user") {
    return NextResponse.json({ error: "会员不存在" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  const d = parsed.data;

  const email = d.email !== undefined ? d.email.trim() || null : undefined;
  const phone = d.phone !== undefined ? d.phone.trim() || null : undefined;

  // 唯一性校验（排除自己）
  if (email) {
    const dup = await db.user.findFirst({ where: { email, NOT: { id: uid } } });
    if (dup) return NextResponse.json({ error: "邮箱已被其他账号使用" }, { status: 409 });
  }
  if (phone) {
    const dup = await db.user.findFirst({ where: { phone, NOT: { id: uid } } });
    if (dup) return NextResponse.json({ error: "手机号已被其他账号使用" }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (d.nickname !== undefined) data.nickname = d.nickname.trim() || null;
  if (email !== undefined) data.email = email;
  if (phone !== undefined) data.phone = phone;
  if (d.avatar !== undefined) data.avatar = d.avatar || null;
  if (d.bio !== undefined) data.bio = d.bio.trim() || null;
  if (d.status !== undefined) data.status = d.status;
  if (d.allowPublish !== undefined) data.allowPublish = d.allowPublish;
  if (d.commentBanned !== undefined) data.commentBanned = d.commentBanned;
  if (d.newPassword) data.passwordHash = await bcrypt.hash(d.newPassword, 10);

  const u = await db.user.update({ where: { id: uid }, data });
  await logAdminAction({
    adminId: admin!.id,
    action: "update",
    targetType: "user",
    targetId: uid,
    detail: JSON.stringify({ fields: Object.keys(d), resetPassword: !!d.newPassword }),
    ip: (await getClientIp()) || undefined,
  });

  return NextResponse.json({
    ok: true,
    status: u.status,
    allowPublish: u.allowPublish,
    nickname: u.nickname,
    email: u.email,
    phone: u.phone,
  });
}

// DELETE /api/admin/users/:id  删除会员（其提示词保留但解除关联前禁止直接删，避免内容孤儿）
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { admin, ok } = await requirePerm(PERMISSIONS.USER_DELETE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const uid = parseInt(id);
  const target = await db.user.findUnique({ where: { id: uid } });
  if (!target || target.role !== "user") {
    return NextResponse.json({ error: "会员不存在" }, { status: 404 });
  }

  const promptCount = await db.prompt.count({ where: { userId: uid } });
  if (promptCount > 0) {
    return NextResponse.json(
      { error: `该会员有 ${promptCount} 条提示词，请先处理其内容（改派或删除）后再删除账号` },
      { status: 400 }
    );
  }

  // 无内容后清理互动数据再删号（评论点赞外键指向 User，须先清）
  await db.$transaction([
    db.like.deleteMany({ where: { userId: uid } }),
    db.favorite.deleteMany({ where: { userId: uid } }),
    db.commentLike.deleteMany({ where: { userId: uid } }),
    db.comment.deleteMany({ where: { userId: uid } }),
    db.user.delete({ where: { id: uid } }),
  ]);

  await logAdminAction({
    adminId: admin!.id,
    action: "delete",
    targetType: "user",
    targetId: uid,
    detail: JSON.stringify({ username: target.username }),
    ip: (await getClientIp()) || undefined,
  });
  return NextResponse.json({ ok: true });
}
