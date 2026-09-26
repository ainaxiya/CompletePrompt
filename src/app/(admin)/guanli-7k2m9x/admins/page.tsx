import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminManager from "@/components/admin/AdminManager";
import { ADMIN_BASE } from "@/lib/admin-path";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理员设置" };

export default async function Page() {
  const admin = await requireAdmin();
  if (!admin) redirect(`${ADMIN_BASE}/login`);
  if (!admin.isSuper) redirect(ADMIN_BASE);
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">管理员设置</h1>
      <AdminManager currentAdminId={admin.id} />
    </div>
  );
}
