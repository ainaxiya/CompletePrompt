import CategoryManager from "@/components/admin/CategoryManager";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "分类管理" };

export default async function AdminCategoriesPage() {
  const categories = await db.category.findMany({
    orderBy: { sort: "asc" },
    select: { id: true, name: true, nameEn: true, slug: true, sort: true },
  });
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">分类管理</h1>
      <p className="mb-5 text-sm text-zinc-500">
        管理提示词分类，支持新增、编辑、删除与排序。前台分类导航将按此处排序展示。
      </p>
      <CategoryManager initial={categories} />
    </div>
  );
}
