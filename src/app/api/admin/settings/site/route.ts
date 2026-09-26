import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const DEFAULT_SITE = {
  siteName: "完整提示词",
  siteNameEn: "CompletePrompt",
  siteDescription: "",
  searchKeywords: "",
  footerText: "",
  logoIcon: "",
  favicon: "",
  appIcon: "",
  meiliSyncSeconds: 30,
};

// GET /api/admin/settings/site
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.SETTING_READ);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const row = await db.siteSetting.findUnique({ where: { key: "site" } });
  let data = { ...DEFAULT_SITE };
  if (row) {
    try {
      data = { ...DEFAULT_SITE, ...JSON.parse(row.value) };
    } catch {}
  }
  return NextResponse.json(data);
}

const siteSchema = z.object({
  siteName: z.string().max(100).optional(),
  siteNameEn: z.string().max(100).optional(),
  siteDescription: z.string().max(2000).optional(),
  searchKeywords: z.string().max(500).optional(),
  footerText: z.string().max(500).optional(),
  logoIcon: z.string().max(500).optional(),
  favicon: z.string().max(500).optional(),
  appIcon: z.string().max(500).optional(),
  // Meilisearch 自动同步间隔（秒）：0 = 关闭自动同步，仅手动重建索引
  meiliSyncSeconds: z.coerce.number().int().min(0).max(86400).optional(),
});

// PUT /api/admin/settings/site
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.SETTING_WRITE);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const parsed = siteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }

  // 读取现有值合并
  const row = await db.siteSetting.findUnique({ where: { key: "site" } });
  let current = { ...DEFAULT_SITE };
  if (row) {
    try {
      current = { ...DEFAULT_SITE, ...JSON.parse(row.value) };
    } catch {}
  }
  const merged = { ...current, ...parsed.data };

  // 走 saveSetting：落库同时清空设置缓存，前台立即生效
  await saveSetting("site", merged);

  await logAdminAction({
    adminId: admin.id,
    action: "update",
    targetType: "setting",
    detail: JSON.stringify({ section: "site", keys: Object.keys(parsed.data) }),
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true, data: merged });
}
