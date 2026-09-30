import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm } from "@/lib/rbac";
import { getCrawlSource } from "@/lib/crawl-sources";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const VALID_STATUS = ["new", "collected", "failed"];

// GET /api/admin/collect/items?source=libtv&status=new&page=1
export async function GET(req: NextRequest) {
  const { ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") || "libtv";
  if (!getCrawlSource(source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });
  const status = VALID_STATUS.includes(searchParams.get("status") || "") ? searchParams.get("status")! : "";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const where: any = { source };
  if (status) where.status = status;

  const [list, total, counts, lastRow, running] = await Promise.all([
    db.crawlItem.findMany({
      where,
      orderBy: [{ remoteUpdatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.crawlItem.count({ where }),
    db.crawlItem.groupBy({ by: ["status"], where: { source }, _count: { _all: true } }),
    db.crawlItem.findFirst({ where: { source }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    db.crawlJob.findFirst({ where: { status: "running" }, orderBy: { id: "desc" } }),
  ]);

  return NextResponse.json({
    list,
    total,
    page,
    pageSize: PAGE_SIZE,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    lastFetchedAt: lastRow?.lastSeenAt || null,
    runningJob: running
      ? { id: running.id, total: running.total, done: running.done, succeeded: running.succeeded, failed: running.failed, lastError: running.lastError }
      : null,
  });
}
