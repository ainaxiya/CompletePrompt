import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { getCrawlSource } from "@/lib/crawl-sources";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const VALID_STATUS = ["new", "collected", "failed"];
// 仅允许对待采集/失败条目做删除与不采集；已入库条目不在此列
const ACTABLE_STATUS = ["new", "failed"];

const idsSchema = z.object({
  source: z.enum(["libtv", "jimeng"]),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

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

// DELETE /api/admin/collect/items  批量删除（真实删除，下次一键获取会重新进来）
export async function DELETE(req: NextRequest) {
  const { admin, ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = idsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const { source, ids } = parsed.data;
  if (!getCrawlSource(source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });

  const res = await db.crawlItem.deleteMany({
    where: { source, id: { in: ids }, status: { in: ACTABLE_STATUS } },
  });

  await logAdminAction({
    adminId: admin.id,
    action: "collect_items_delete",
    targetType: "crawl_source",
    detail: `${source} 删除采集条目 ${res.count} 条（共选 ${ids.length} 条）`,
    ip: await getClientIp(),
  });
  return NextResponse.json({ deleted: res.count });
}

// PATCH /api/admin/collect/items  批量不采集（标记 skipped，从列表消失且后续获取不再进来）
export async function PATCH(req: NextRequest) {
  const { admin, ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = idsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const { source, ids } = parsed.data;
  if (!getCrawlSource(source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });

  const res = await db.crawlItem.updateMany({
    where: { source, id: { in: ids }, status: { in: ACTABLE_STATUS } },
    data: { status: "skipped", error: null },
  });

  await logAdminAction({
    adminId: admin.id,
    action: "collect_items_skip",
    targetType: "crawl_source",
    detail: `${source} 标记不采集 ${res.count} 条（共选 ${ids.length} 条）`,
    ip: await getClientIp(),
  });
  return NextResponse.json({ skipped: res.count });
}
