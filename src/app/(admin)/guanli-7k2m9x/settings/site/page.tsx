import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ADMIN_BASE } from "@/lib/admin-path";
import SiteSettingsForm from "@/components/admin/SiteSettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "网站设置" };

const DEFAULT_SITE = {
  siteName: "完整提示词",
  siteNameEn: "CompletePrompt",
  siteDescription: "",
  searchKeywords: "",
  footerText: "",
  allowRegister: true,
  logoIcon: "",
  favicon: "",
  appIcon: "",
};

export default async function AdminSiteSettingsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect(`/login?next=${encodeURIComponent(ADMIN_BASE)}`);

  const row = await db.siteSetting.findUnique({ where: { key: "site" } });
  let initial = { ...DEFAULT_SITE };
  if (row) {
    try {
      initial = { ...DEFAULT_SITE, ...JSON.parse(row.value) };
    } catch {}
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">网站设置</h1>
      <p className="mb-5 text-sm text-zinc-500">
        管理网站基本信息、SEO 关键字、页脚文字与站点图标。
      </p>
      <SiteSettingsForm initial={initial} />
    </div>
  );
}
