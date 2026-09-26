import { NextResponse } from "next/server";
import { clearAdminAuthCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearAdminAuthCookie();
  return NextResponse.json({ ok: true });
}
