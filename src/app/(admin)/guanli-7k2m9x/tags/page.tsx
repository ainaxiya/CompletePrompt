import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import TagManager from "@/components/admin/TagManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tag 标签管理" };

export default async function AdminTagsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/guanli-7k2m9x/login");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Tag 标签管理</h1>
      <p className="mb-5 text-sm text-zinc-500">
        管理全站提示词标签：新增预设、重命名（自动合并到所有提示词）、删除（从所有提示词中移除）。
      </p>
      <TagManager />
    </div>
  );
}
