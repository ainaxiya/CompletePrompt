import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  username: z
    .string()
    .min(3, "账号至少 3 位")
    .max(20, "账号最多 20 位")
    .regex(/^[A-Za-z0-9_\-]+$/, "账号只能包含字母、数字、下划线、连字符"),
  nickname: z.string().max(20).optional().default(""),
  password: z.string().min(6, "密码至少 6 位").max(72),
  isSuper: z.boolean().optional().default(false),
  adminRoleId: z.number().int().positive().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional().default("active"),
});

// GET /api/admin/admins  管理员列表（仅超管）
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!admin.isSuper) return NextResponse.json({ error: "仅超级管理员可访问" }, { status: 403 });

  const list = await db.adminAccount.findMany({
    orderBy: [{ isSuper: "desc" }, { id: "asc" }],
    include: { adminRole: { select: { name: true } } },
  });
  return NextResponse.json({
    list: list.map(({ passwordHash, ...rest }) => rest),
  });
}

// POST /api/admin/admins  新建管理员
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!admin.isSuper) return NextResponse.json({ error: "仅超级管理员可操作" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  const d = parsed.data;

  // 账号唯一
  const dup = await db.adminAccount.findUnique({ where: { username: d.username } });
  if (dup) return NextResponse.json({ error: "管理员账号已存在" }, { status: 409 });
  // 不能与前台会员账号重名（历史迁移的 admin_legacy/importer 记录除外）
  const dupUser = await db.user.findFirst({ where: { username: d.username, role: "user" } });
  if (dupUser) return NextResponse.json({ error: "该账号名已被会员占用" }, { status: 409 });

  // 非超管必须绑定有效角色
  let roleId: number | null = null;
  if (!d.isSuper) {
    roleId = d.adminRoleId ?? null;
    if (!roleId) return NextResponse.json({ error: "请为管理员选择权限角色" }, { status: 400 });
    const role = await db.adminRole.findUnique({ where: { id: roleId } });
    if (!role) return NextResponse.json({ error: "权限角色不存在" }, { status: 400 });
  }

  const ip = (await getClientIp()) || undefined;
  const created = await db.adminAccount.create({
    data: {
      username: d.username,
      nickname: d.nickname || null,
      passwordHash: await bcrypt.hash(d.password, 10),
      isSuper: d.isSuper,
      adminRoleId: d.isSuper ? null : roleId,
      status: d.status,
      createdIp: ip,
    },
  });

  await logAdminAction({
    adminId: admin.id,
    action: "create",
    targetType: "admin",
    targetId: created.id,
    detail: JSON.stringify({ username: created.username, isSuper: created.isSuper }),
    ip,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
