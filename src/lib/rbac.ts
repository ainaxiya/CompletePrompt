import { db } from "./db";
import { getCurrentUser } from "./auth";
import { headers } from "next/headers";
import { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_GROUPS } from "./permissions";

// 重新导出（服务端组件可用）
export { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_GROUPS };
// 客户端组件请 import from "@/lib/permissions"

export type Permission = string;

// ─── 权限检查 ───
export async function getUserPermissions(userId: number): Promise<Set<string>> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, adminRoleId: true, adminRole: { select: { permissions: true } } },
  });
  if (!user || user.role !== "admin") return new Set();

  // 没有分配角色 = 超级管理员（全部权限）
  if (!user.adminRoleId || !user.adminRole) return new Set(ALL_PERMISSIONS);
  return new Set(user.adminRole.permissions);
}

export async function hasPermission(userId: number, perm: Permission): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has("*") || perms.has(perm);
}

// ─── 在 API 路由中校验权限 ───
export async function requirePerm(perm: Permission) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") return { user: null, ok: false } as const;
  const ok = await hasPermission(user.id, perm);
  return { user, ok } as const;
}

// ─── 操作日志（只增不删） ───
export async function logAdminAction(params: {
  userId: number;
  action: string;
  targetType?: string;
  targetId?: number;
  detail?: string;
  ip?: string;
}) {
  try {
    await db.adminLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        detail: params.detail ?? null,
        ip: params.ip ?? null,
      },
    });
  } catch (e) {
    console.error("logAdminAction error:", e);
  }
}

// 从请求头获取 IP
export async function getClientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

// ─── 初始化默认角色（首次启动时调用） ───
export async function ensureDefaultRoles() {
  const count = await db.adminRole.count();
  if (count > 0) return;

  await db.adminRole.createMany({
    data: [
      {
        name: "超级管理员",
        permissions: ["*"],
        description: "拥有全部权限",
      },
      {
        name: "内容管理员",
        permissions: ["prompt:read", "prompt:write", "prompt:delete", "prompt:feature", "prompt:batch", "category:read", "category:write", "comment:read", "comment:moderate"],
        description: "管理提示词、分类、评论",
      },
      {
        name: "用户管理员",
        permissions: ["user:read", "user:write", "user:delete", "log:read"],
        description: "管理用户和查看日志",
      },
      {
        name: "审计员",
        permissions: ["log:read", "prompt:read", "user:read"],
        description: "只读权限，仅查看",
      },
    ],
  });

  // 将现有的 admin 用户分配为超级管理员
  const admins = await db.user.findMany({ where: { role: "admin" } });
  for (const a of admins) {
    const superRole = await db.adminRole.findFirst({ where: { name: "超级管理员" } });
    if (superRole) {
      await db.user.update({ where: { id: a.id }, data: { adminRoleId: superRole.id } });
    }
  }
}
