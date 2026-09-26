import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp, ALL_PERMISSIONS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/admin/roles — 列出所有角色（含关联用户数）
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.ROLE_READ);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const roles = await db.adminRole.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { users: true, admins: true } } },
  });

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions,
      description: r.description,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userCount: r._count.users,
      adminCount: r._count.admins,
    })),
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string()).default([]),
});

// POST /api/admin/roles — 新建角色
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.ROLE_WRITE);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }

  // 校验权限值合法性（"*" 或在已知权限列表中）
  const valid = new Set(["*", ...ALL_PERMISSIONS]);
  const perms = parsed.data.permissions.filter((p) => valid.has(p));
  // 去重
  const permSet = [...new Set(perms)];

  const existing = await db.adminRole.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json({ error: "角色名已存在" }, { status: 400 });

  const role = await db.adminRole.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissions: permSet,
    },
  });

  await logAdminAction({
    adminId: admin.id,
    action: "create",
    targetType: "role",
    targetId: role.id,
    detail: JSON.stringify({ name: role.name, permissions: permSet }),
    ip: await getClientIp(),
  });

  return NextResponse.json({
    id: role.id,
    name: role.name,
    permissions: role.permissions,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    userCount: 0,
  });
}
