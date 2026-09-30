import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { getCrawlSource } from "@/lib/crawl-sources";
import { fetchLibtvFeed, filterCollectableItems, parseCnDate, type LibtvFeedItem } from "@/lib/crawl-libtv";

export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.literal("libtv"),
  pages: z.number().int().min(1).max(8).optional(),
});

function toTags(it: LibtvFeedItem): string[] {
  return (it.tags || [])
    .map((t) => String(t.tagLabel || "").trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 30));
}

// POST /api/admin/collect/fetch  一键获取远端最新作品
// 流程：拉 feed → 逐条探测作品画布 → 未公开提示词的作品直接剔除，不进待采集列表
export async function POST(req: NextRequest) {
  const { admin, ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const { source } = parsed.data;
  if (!getCrawlSource(source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });
  const pages = parsed.data.pages ?? 3;

  let feed: Awaited<ReturnType<typeof fetchLibtvFeed>>;
  try {
    feed = await fetchLibtvFeed(pages);
  } catch (e: any) {
    return NextResponse.json({ error: "拉取失败：" + String(e?.message || e).slice(0, 160) }, { status: 502 });
  }

  // 探测：未公开画布的作品不采集（探测接口临时失败的保守保留）
  const { collectable: items, emptyItems, probeErrors } = await filterCollectableItems(feed.items, 5);

  // 已入库/列表中已存在的空画布作品：new/failed 直接清除（重试永远失败）；collected 保留（历史上可采过）
  const emptyIds = emptyItems.map((it) => it.projectUuid);
  const removedStale = emptyIds.length
    ? (
        await db.crawlItem.deleteMany({
          where: { source, remoteId: { in: emptyIds }, status: { in: ["new", "failed"] } },
        })
      ).count
    : 0;

  const remoteIds = items.map((it) => it.projectUuid);
  const existing = await db.crawlItem.findMany({
    where: { source, remoteId: { in: remoteIds } },
    select: { id: true, remoteId: true, status: true, collectedAt: true },
  });
  const exMap = new Map(existing.map((x) => [x.remoteId, x]));

  let newCount = 0;
  let updatedCount = 0;
  let collectedTouched = 0;
  for (const it of items) {
    const tags = toTags(it);
    const remoteUpdatedAt = parseCnDate(it.updateAt);
    const remoteCreatedAt = parseCnDate(it.publishAt || it.createAt);
    const ex = exMap.get(it.projectUuid);
    if (!ex) {
      await db.crawlItem.create({
        data: {
          source,
          remoteId: it.projectUuid,
          templateUuid: it.templateUuid || null,
          title: String(it.name || "未命名作品").slice(0, 200),
          author: it.nickname ? String(it.nickname).slice(0, 80) : null,
          coverUrl: it.coverUrl || null,
          tags,
          likeCount: Number(it.likeCount) || 0,
          remoteCreatedAt,
          remoteUpdatedAt,
        },
      });
      newCount++;
    } else {
      await db.crawlItem.update({
        where: { id: ex.id },
        data: {
          templateUuid: it.templateUuid || null,
          title: String(it.name || "未命名作品").slice(0, 200),
          author: it.nickname ? String(it.nickname).slice(0, 80) : null,
          coverUrl: it.coverUrl || null,
          tags,
          likeCount: Number(it.likeCount) || 0,
          remoteCreatedAt: remoteCreatedAt ?? undefined,
          remoteUpdatedAt: remoteUpdatedAt ?? undefined,
        },
      });
      if (ex.status === "collected" && remoteUpdatedAt && ex.collectedAt && remoteUpdatedAt > ex.collectedAt) {
        updatedCount++;
      }
      if (ex.status === "collected") collectedTouched++;
    }
  }

  await logAdminAction({
    adminId: admin.id,
    action: "collect_fetch",
    targetType: "crawl_source",
    detail: `${source} feed ${feed.items.length}条：可采${items.length} 未公开画布剔除${emptyItems.length} 清理历史残留${removedStale} 新发现${newCount}`,
    ip: await getClientIp(),
  });

  return NextResponse.json({
    fetched: feed.items.length,
    collectable: items.length,
    skippedEmpty: emptyItems.length,
    removedStale,
    probeErrors,
    newCount,
    collectedTouched,
    updatedCount,
    hasMore: feed.hasMore,
  });
}
