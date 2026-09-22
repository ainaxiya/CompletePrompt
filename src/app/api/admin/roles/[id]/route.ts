import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp, ALL_PERMISSIONS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

// PUT /api/admin/roles/[id] — 更新角色
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.ROLE_WRITE);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const { id } = await ctx.params;
  const rid = parseInt(id);
  const existing = await db.adminRole.findUnique({ where: { id: rid } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }

  const d: any = {};
  if (parsed.data.name !== undefined) {
    const dup = await db.adminRole.findUnique({ where: { name: parsed.data.name } });
    if (dup && dup.id !== rid) return NextResponse.json({ error: "角色名已存在" }, { status: 400 });
    d.name = parsed.data.name;
  }
  if (parsed.data.description !== undefined) d.description = parsed.data.description || null;
  if (parsed.data.permissions !== undefined) {
    const valid = new Set(["*", ...ALL_PERMISSIONS]);
    d.permissions = [...new Set(parsed.data.permissions.filter((p) => valid.has(p)))];
  }

  const role = await db.adminRole.update({ where: { id: rid }, data: d });

  await logAdminAction({
    userId: admin.id,
    action: "update",
    targetType: "role",
    targetId: rid,
    detail: JSON.stringify(d),
    ip: await getClientIp(),
  });

  return NextResponse.json({
    id: role.id,
    name: role.name,
    permissions: role.permissions,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  });
}

// DELETE /api/admin/roles/[id] — 删除角色（有关联用户时拒绝）
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.ROLE_DELETE);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const { id } = await ctx.params;
  const rid = parseInt(id);
  const existing = await db.adminRole.findUnique({
    where: { id: rid },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing._count.users > 0) {
    return NextResponse.json({ error: `该角色下还有 ${existing._count.users} 个用户，无法删除` }, { status: 400 });
  }

  await db.adminRole.delete({ where: { id: rid } });

  await logAdminAction({
    userId: admin.id,
    action: "delete",
    targetType: "role",
    targetId: rid,
    detail: JSON.stringify({ name: existing.name }),
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true });
}
