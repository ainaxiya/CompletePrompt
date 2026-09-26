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
  // basic/membership 设置页已下线（基本设置并入网站设置，会员设置改为注册设置）
  if (!["publish", "register"].includes(section)) {
    return NextResponse.json({ error: "bad section" }, { status: 400 });
  }
  await saveSetting(section, body.value);
  return NextResponse.json({ ok: true });
}
