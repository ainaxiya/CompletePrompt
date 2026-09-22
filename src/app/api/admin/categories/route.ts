import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateCategoryCache } from "@/lib/categories";

export const dynamic = "force-dynamic";

function slugify(name: string) {
  // 优先用中文原名作 slug（兼容现有 Prompt.category 数据）
  const s = name.trim();
  if (!s) return "";
  return s;
}

// 列表（含各分类提示词数量）
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [cats, counts] = await Promise.all([
    db.category.findMany({ orderBy: { sort: "asc" } }),
    db.prompt.groupBy({ by: ["category"], _count: { category: true } }),
  ]);
  const map = new Map(counts.map((c) => [c.category, c._count.category]));
  return NextResponse.json(
    cats.map((c) => ({ ...c, promptCount: map.get(c.slug) || 0 }))
  );
}

// 新建
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  const nameEn = (body?.nameEn || "").trim();
  if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const slug = slugify(name);
  const exists = await db.category.findFirst({ where: { OR: [{ name }, { slug }] } });
  if (exists) return NextResponse.json({ error: "分类名已存在" }, { status: 409 });

  const maxSort = await db.category.aggregate({ _max: { sort: true } });
  const cat = await db.category.create({
    data: { name, nameEn: nameEn || name, slug, sort: (maxSort._max.sort ?? -1) + 1 },
  });
  invalidateCategoryCache();
  return NextResponse.json(cat);
}

// 批量排序：body.ids 为按新顺序排列的分类 id 数组
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids = body?.ids;
  if (!Array.isArray(ids)) return NextResponse.json({ error: "ids 必须为数组" }, { status: 400 });

  await db.$transaction(
    ids.map((id, i) =>
      db.category.update({ where: { id: Number(id) }, data: { sort: i } })
    )
  );
  invalidateCategoryCache();
  return NextResponse.json({ ok: true });
}
