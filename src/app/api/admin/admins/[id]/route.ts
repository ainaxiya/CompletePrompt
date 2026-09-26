import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nickname: z.string().max(20).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  isSuper: z.boolean().optional(),
  adminRoleId: z.number().int().positive().nullable().optional(),
  newPassword: z.string().min(6, "新密码至少 6 位").max(72).optional(),
});

// PATCH /api/admin/admins/:id  全面修改（账号不可改）/ 重置密码
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const operator = await requireAdmin();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!operator.isSuper) return NextResponse.json({ error: "仅超级管理员可操作" }, { status: 403 });

  const { id } = await ctx.params;
  const aid = parseInt(id);
  const target = await db.adminAccount.findUnique({ where: { id: aid } });
  if (!target) return NextResponse.json({ error: "管理员不存在" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  const d = parsed.data;
  const isSelf = operator.id === target.id;

  // 自我保护：不能禁用/降级自己
  if (isSelf && d.status === "disabled") {
    return NextResponse.json({ error: "不能禁用当前登录的自己" }, { status: 400 });
  }
  if (isSelf && d.isSuper === false) {
    return NextResponse.json({ error: "不能取消自己的超级管理员权限" }, { status: 400 });
  }

  const nextIsSuper = d.isSuper ?? target.isSuper;
  const nextStatus = d.status ?? target.status;

  // 非超管必须绑定有效角色
  let nextRoleId: number | null = target.adminRoleId;
  if (!nextIsSuper) {
    if (d.adminRoleId !== undefined) nextRoleId = d.adminRoleId;
    if (!nextRoleId) return NextResponse.json({ error: "请为管理员选择权限角色" }, { status: 400 });
    const role = await db.adminRole.findUnique({ where: { id: nextRoleId } });
    if (!role) return NextResponse.json({ error: "权限角色不存在" }, { status: 400 });
  } else {
    nextRoleId = null;
  }

  // 最后一个启用超管保护
  if (target.isSuper && (!nextIsSuper || nextStatus !== "active")) {
    const activeSupers = await db.adminAccount.count({
      where: { isSuper: true, status: "active" },
    });
    if (activeSupers <= 1) {
      return NextResponse.json({ error: "至少保留一个启用状态的超级管理员" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {
    nickname: d.nickname !== undefined ? d.nickname || null : undefined,
    status: d.status,
    isSuper: d.isSuper,
    adminRoleId: d.isSuper !== undefined || d.adminRoleId !== undefined ? nextRoleId : undefined,
  };
  if (d.newPassword) data.passwordHash = await bcrypt.hash(d.newPassword, 10);

  const updated = await db.adminAccount.update({
    where: { id: aid },
    data,
    include: { adminRole: { select: { name: true } } },
  });

  await logAdminAction({
    adminId: operator.id,
    action: "update",
    targetType: "admin",
    targetId: aid,
    detail: JSON.stringify({
      fields: Object.keys(d),
      resetPassword: !!d.newPassword,
    }),
    ip: (await getClientIp()) || undefined,
  });

  const { passwordHash, ...safe } = updated;
  return NextResponse.json({ ok: true, admin: safe });
}

// DELETE /api/admin/admins/:id
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const operator = await requireAdmin();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!operator.isSuper) return NextResponse.json({ error: "仅超级管理员可操作" }, { status: 403 });

  const { id } = await ctx.params;
  const aid = parseInt(id);
  if (aid === operator.id) {
    return NextResponse.json({ error: "不能删除当前登录的自己" }, { status: 400 });
  }
  const target = await db.adminAccount.findUnique({ where: { id: aid } });
  if (!target) return NextResponse.json({ error: "管理员不存在" }, { status: 404 });

  if (target.isSuper && target.status === "active") {
    const activeSupers = await db.adminAccount.count({
      where: { isSuper: true, status: "active" },
    });
    if (activeSupers <= 1) {
      return NextResponse.json({ error: "至少保留一个启用状态的超级管理员" }, { status: 400 });
    }
  }

  // 该管理员发布过提示词/写过日志：软禁用更安全；但需求要求可删除。
  // 有外键关联（Prompt.adminAuthorId / AdminLog.adminId）时禁止物理删除
  const refs = await Promise.all([
    db.prompt.count({ where: { adminAuthorId: aid } }),
    db.adminLog.count({ where: { adminId: aid } }),
  ]);
  if (refs[0] > 0 || refs[1] > 0) {
    return NextResponse.json(
      { error: `该管理员存在发布内容或操作日志（${refs[0]} 条内容/${refs[1]} 条日志），不能删除，建议改为禁用` },
      { status: 400 }
    );
  }

  await db.adminAccount.delete({ where: { id: aid } });
  await logAdminAction({
    adminId: operator.id,
    action: "delete",
    targetType: "admin",
    targetId: aid,
    detail: JSON.stringify({ username: target.username }),
    ip: (await getClientIp()) || undefined,
  });
  return NextResponse.json({ ok: true });
}
