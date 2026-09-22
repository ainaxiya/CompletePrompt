import PromptManager from "@/components/admin/PromptManager";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "提示词管理" };

export default async function AdminPromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const VALID_STATUS = ["", "pending", "published", "rejected", "draft"];
  const catSlugs = (await db.category.findMany({ select: { slug: true } })).map((c) => c.slug);
  const initialCategory = catSlugs.includes(sp.category || "") ? sp.category || "" : "";
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">提示词管理</h1>
      <PromptManager
        initialQ={sp.q || ""}
        initialStatus={VALID_STATUS.includes(sp.status || "") ? sp.status || "" : ""}
        initialCategory={initialCategory}
      />
    </div>
  );
}
