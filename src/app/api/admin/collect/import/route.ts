import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { getCrawlSource } from "@/lib/crawl-sources";
import { reapStaleJobs, startCrawlJobInBackground } from "@/lib/crawl-worker";

export const dynamic = "force-dynamic";

// 单次入库任务上限，避免一次拉取过久
const MAX_JOB_ITEMS = 100;

const schema = z
  .object({
    source: z.literal("libtv"),
    // all=true=全部待采集入库；否则按 ids 勾选入库（可含 failed 重试）
    all: z.boolean().optional(),
    ids: z.array(z.number().int().positive()).max(MAX_JOB_ITEMS).optional(),
  })
  .refine((d) => d.all === true || (Array.isArray(d.ids) && d.ids.length > 0), {
    message: "ids 不能为空，或使用 all=true",
  });

// POST /api/admin/collect/import
export async function POST(req: NextRequest) {
  const { admin, ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "bad params" }, { status: 400 });
  }
  const { source, all, ids } = parsed.data;
  if (!getCrawlSource(source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });

  await reapStaleJobs();
  const running = await db.crawlJob.findFirst({ where: { status: "running" } });
  if (running) return NextResponse.json({ error: "已有采集任务进行中，请等待完成" }, { status: 409 });

  let itemIds: number[] = [];
  if (all) {
    const rows = await db.crawlItem.findMany({
      where: { source, status: "new" },
      orderBy: [{ remoteUpdatedAt: "desc" }, { id: "desc" }],
      take: MAX_JOB_ITEMS,
      select: { id: true },
    });
    itemIds = rows.map((r) => r.id);
  } else {
    const rows = await db.crawlItem.findMany({
      where: { source, id: { in: ids! }, status: { in: ["new", "failed"] } },
      select: { id: true },
    });
    itemIds = rows.map((r) => r.id);
  }

  if (itemIds.length === 0) {
    return NextResponse.json({ error: all ? "当前没有待采集的条目" : "所选条目均不可采集" }, { status: 400 });
  }

  const job = await db.crawlJob.create({
    data: { source, itemIds, total: itemIds.length, adminId: admin.id },
  });
  // 异步执行，接口立即返回
  startCrawlJobInBackground(job.id);

  await logAdminAction({
    adminId: admin.id,
    action: "collect_import",
    targetType: "crawl_job",
    targetId: job.id,
    detail: `启动采集入库任务 #${job.id}，共 ${itemIds.length} 条`,
    ip: await getClientIp(),
  });

  return NextResponse.json({ jobId: job.id, total: itemIds.length });
}
