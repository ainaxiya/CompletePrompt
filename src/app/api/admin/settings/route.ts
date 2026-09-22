import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSettings, saveSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await getSettings());
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const section = body?.section;
  if (!["basic", "publish", "membership"].includes(section)) {
    return NextResponse.json({ error: "bad section" }, { status: 400 });
  }
  await saveSetting(section, body.value);
  return NextResponse.json({ ok: true });
}
