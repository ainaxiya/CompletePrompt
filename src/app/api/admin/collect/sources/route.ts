import { NextResponse } from "next/server";
import { PERMISSIONS, requirePerm } from "@/lib/rbac";
import { CRAWL_SOURCES } from "@/lib/crawl-sources";

export const dynamic = "force-dynamic";

// GET /api/admin/collect/sources
export async function GET() {
  const { ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ sources: CRAWL_SOURCES });
}
