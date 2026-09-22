import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 公开接口：返回所有已启用分类（按 sort 升序）
export async function GET() {
  const cats = await db.category.findMany({
    orderBy: { sort: "asc" },
    select: { id: true, name: true, nameEn: true, slug: true },
  });
  return NextResponse.json(cats);
}
