import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { getCrawlSource } from "@/lib/crawl-sources";
import { fetchLibtvFeed, filterCollectableItems, parseCnDate, type LibtvFeedItem } from "@/lib/crawl-libtv";
import { fetchJimengFeed, filterCollectableJimengItems, type JimengFeedItem } from "@/lib/crawl-jimeng";

export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.enum(["libtv", "jimeng"]),
  pages: z.number().int().min(1).max(8).optional(),
});

function libtvTags(it: LibtvFeedItem): string[] {
  return (it.tags || [])
    .map((t) => String(t.tagLabel || "").trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 30));
}

// 即梦 tags 约定（入库时前 4 个会被剥离）：
//   [0] 提示词  [1] 模型名  [2] 作品形态 image|video  [3] 视频地址（仅视频作品，短时效签名）
function jimengTags(it: JimengFeedItem): string[] {
  const tags: string[] = [];
  if (it.prompt) tags.push(it.prompt.slice(0, 500));
  if (it.modelName) tags.push(it.modelName.slice(0, 50));
  tags.push(it.workType);
  if (it.videoUrl) tags.push(it.videoUrl.slice(0, 2000));
  return tags;
}

// POST /api/admin/collect/fetch  一键获取远端最新作品
export async function POST(req: NextRequest) {
  const { admin, ok } = await requirePerm(PERMISSIONS.CRAWL_MANAGE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const { source } = parsed.data;
  if (!getCrawlSource(source)) return NextResponse.json({ error: "unknown source" }, { status: 400 });
  const pages = parsed.data.pages ?? 3;

  if (source === "jimeng") {
    return handleJimengFetch(admin.id, source, pages);
  }
  return handleLibtvFetch(admin.id, source, pages);
}

// ─── LIBTV 采集 ───
async function handleLibtvFetch(adminId: number, source: string, pages: number) {
  let feed: Awaited<ReturnType<typeof fetchLibtvFeed>>;
  try {
    feed = await fetchLibtvFeed(pages);
  } catch (e: any) {
    return NextResponse.json({ error: "拉取失败：" + String(e?.message || e).slice(0, 160) }, { status: 502 });
  }

  const { collectable: items, emptyItems, probeErrors } = await filterCollectableItems(feed.items, 5);

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
    const tags = libtvTags(it);
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
    adminId,
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

// ─── 即梦 采集 ───
async function handleJimengFetch(adminId: number, source: string, pages: number) {
  let feed: Awaited<ReturnType<typeof fetchJimengFeed>>;
  try {
    feed = await fetchJimengFeed(pages);
  } catch (e: any) {
    return NextResponse.json({ error: "拉取失败：" + String(e?.message || e).slice(0, 160) }, { status: 502 });
  }

  // 即梦：有提示词+图即可采（无需额外探测，feed 已含全部数据）
  const { collectable: items, emptyItems } = filterCollectableJimengItems(feed.items);

  const emptyIds = emptyItems.map((it) => it.itemId);
  const removedStale = emptyIds.length
    ? (
        await db.crawlItem.deleteMany({
          where: { source, remoteId: { in: emptyIds }, status: { in: ["new", "failed"] } },
        })
      ).count
    : 0;

  const remoteIds = items.map((it) => it.itemId);
  const existing = await db.crawlItem.findMany({
    where: { source, remoteId: { in: remoteIds } },
    select: { id: true, remoteId: true, status: true, collectedAt: true },
  });
  const exMap = new Map(existing.map((x) => [x.remoteId, x]));

  let newCount = 0;
  let updatedCount = 0;
  let collectedTouched = 0;
  for (const it of items) {
    const tags = jimengTags(it);
    const remoteCreatedAt = it.createTime;
    const remoteUpdatedAt = it.updateTime;
    const title = it.title || (it.workType === "video" ? "即梦AI视频作品" : "即梦AI作品");
    const ex = exMap.get(it.itemId);
    if (!ex) {
      await db.crawlItem.create({
        data: {
          source,
          remoteId: it.itemId,
          templateUuid: null, // 即梦无 templateUuid
          title: title.slice(0, 200),
          author: it.authorName.slice(0, 80),
          coverUrl: it.coverUrl || null,
          tags,
          likeCount: it.likeCount,
          remoteCreatedAt,
          remoteUpdatedAt,
        },
      });
      newCount++;
    } else {
      await db.crawlItem.update({
        where: { id: ex.id },
        data: {
          title: title.slice(0, 200),
          author: it.authorName.slice(0, 80),
          coverUrl: it.coverUrl || null,
          tags,
          likeCount: it.likeCount,
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
    adminId,
    action: "collect_fetch",
    targetType: "crawl_source",
    detail: `${source} feed ${feed.items.length}条：可采${items.length} 无提示词剔除${emptyItems.length} 清理历史残留${removedStale} 新发现${newCount}`,
    ip: await getClientIp(),
  });

  return NextResponse.json({
    fetched: feed.items.length,
    collectable: items.length,
    skippedEmpty: emptyItems.length,
    removedStale,
    probeErrors: 0,
    newCount,
    collectedTouched,
    updatedCount,
    hasMore: feed.hasMore,
  });
}
