import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { safeNextPath } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/lang?locale=en&next=/p/1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale") === "en" ? "en" : "zh";
  // 仅允许站内路径，防开放重定向
  const next = safeNextPath(searchParams.get("next"));
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // 相对路径 Location：浏览器按当前域名解析，反代/多域名下都不会跳错
  return new NextResponse(null, { status: 307, headers: { Location: next } });
}
