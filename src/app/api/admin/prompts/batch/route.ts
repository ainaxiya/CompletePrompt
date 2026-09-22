import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { syncPromptToMeili, removePromptFromMeili } from "@/lib/meili";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const batchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum([
    "feature",
    "unfeature",
    "hot",
    "unhot",
    "publish",
    "unpublish",
    "delete",
  ]),
});

// POST /api/admin/prompts/batch — 批量操作
export async function POST(req: NextRequest) {
  const { user, ok } = await requirePerm(PERMISSIONS.PROMPT_BATCH);
  if (!ok || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }

  const { ids, action } = parsed.data;
  let affected = 0;

  switch (action) {
    case "feature": {
      const r = await db.prompt.updateMany({
        where: { id: { in: ids } },
        data: { featured: true },
      });
      affected = r.count;
      break;
    }
    case "unfeature": {
      const r = await db.prompt.updateMany({
        where: { id: { in: ids } },
        data: { featured: false },
      });
      affected = r.count;
      break;
    }
    case "hot": {
      const r = await db.prompt.updateMany({
        where: { id: { in: ids } },
        data: { hot: true },
      });
      affected = r.count;
      break;
    }
    case "unhot": {
      const r = await db.prompt.updateMany({
        where: { id: { in: ids } },
        data: { hot: false },
      });
      affected = r.count;
      break;
    }
    case "publish": {
      const r = await db.prompt.updateMany({
        where: { id: { in: ids } },
        data: { status: "published", rejectReason: null, publishedAt: new Date() },
      });
      affected = r.count;
      // 同步搜索索引：需要完整 prompt 对象
      const published = await db.prompt.findMany({
        where: { id: { in: ids }, status: "published" },
      });
      await Promise.all(published.map((p) => syncPromptToMeili(p).catch(() => {})));
      break;
    }
    case "unpublish": {
      const r = await db.prompt.updateMany({
        where: { id: { in: ids } },
        data: { status: "draft" },
      });
      affected = r.count;
      await Promise.all(ids.map((id) => removePromptFromMeili(id).catch(() => {})));
      break;
    }
    case "delete": {
      const r = await db.prompt.deleteMany({ where: { id: { in: ids } } });
      affected = r.count;
      await Promise.all(ids.map((id) => removePromptFromMeili(id).catch(() => {})));
      break;
    }
  }

  await logAdminAction({
    userId: user.id,
    action: "batch_update",
    targetType: "prompt",
    detail: JSON.stringify({ action, ids, affected }),
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true, affected, action });
}
