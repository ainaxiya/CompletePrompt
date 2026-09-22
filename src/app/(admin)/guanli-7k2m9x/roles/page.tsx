import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ADMIN_BASE } from "@/lib/admin-path";
import RoleManager from "@/components/admin/RoleManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "角色权限" };

export default async function AdminRolesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect(`/login?next=${encodeURIComponent(ADMIN_BASE)}`);

  const roles = await db.adminRole.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { users: true } } },
  });

  const initial = roles.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: r.permissions,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    userCount: r._count.users,
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">角色权限</h1>
      <p className="mb-5 text-sm text-zinc-500">
        管理后台角色与权限分配。拥有 "*" 权限的角色为超级管理员，拥有全部权限。
      </p>
      <RoleManager initial={initial} />
    </div>
  );
}
