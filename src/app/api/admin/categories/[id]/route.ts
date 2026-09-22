import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateCategoryCache } from "@/lib/categories";

export const dynamic = "force-dynamic";

// 更新单个分类
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  const nameEn = (body?.nameEn || "").trim();
  if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const cat = await db.category.findUnique({ where: { id: Number(id) } });
  if (!cat) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 名称变化需要同步更新引用此分类的 Prompt.category，保证关联不丢
  const oldSlug = cat.slug;
  const newSlug = name;

  const dup = await db.category.findFirst({
    where: { OR: [{ name }, { slug: newSlug }], NOT: { id: cat.id } },
  });
  if (dup) return NextResponse.json({ error: "分类名已存在" }, { status: 409 });

  await db.$transaction(async (tx) => {
    await tx.category.update({
      where: { id: cat.id },
      data: { name, nameEn: nameEn || name, slug: newSlug },
    });
    if (oldSlug !== newSlug) {
      await tx.prompt.updateMany({
        where: { category: oldSlug },
        data: { category: newSlug },
      });
    }
  });

  invalidateCategoryCache();
  return NextResponse.json({ ok: true });
}

// 删除分类：若有提示词归属则拒绝删除（需先迁移）
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const cat = await db.category.findUnique({ where: { id: Number(id) } });
  if (!cat) return NextResponse.json({ error: "not found" }, { status: 404 });

  const count = await db.prompt.count({ where: { category: cat.slug } });
  if (count > 0) {
    return NextResponse.json(
      { error: `该分类下还有 ${count} 条提示词，请先迁移或删除后再操作` },
      { status: 409 }
    );
  }

  await db.category.delete({ where: { id: cat.id } });
  invalidateCategoryCache();
  return NextResponse.json({ ok: true });
}
