import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { getSettings, saveSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean(),
  sensitiveWords: z.array(z.string().min(1).max(50)).max(3000),
});

export async function GET() {
  const { ok } = await requirePerm(PERMISSIONS.COMMENT_MODERATE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await getSettings();
  return NextResponse.json(s.comment);
}

export async function PUT(req: NextRequest) {
  const { user: admin, ok } = await requirePerm(PERMISSIONS.COMMENT_MODERATE);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "bad params" }, { status: 400 });
  }

  const before = (await getSettings()).comment;
  // 去空白、去重、去空串
  const words = Array.from(
    new Set(parsed.data.sensitiveWords.map((w) => w.trim()).filter(Boolean))
  ).slice(0, 3000);
  const value = { enabled: parsed.data.enabled, sensitiveWords: words };
  await saveSetting("comment", value);

  await logAdminAction({
    adminId: admin!.id,
    action: "update",
    targetType: "comment_settings",
    targetId: 0,
    detail: JSON.stringify({
      enabled: { from: before.enabled, to: value.enabled },
      wordCount: { from: before.sensitiveWords.length, to: words.length },
    }),
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true, value });
}
