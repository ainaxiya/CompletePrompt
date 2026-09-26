import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { issueCaptcha } from "@/lib/captcha";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/captcha —— 登录用户领取算术验证码（仅评论触发式验证使用）
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 简单防刷：同 IP 每分钟最多 20 次
  if (!rateLimit(`captcha:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  return NextResponse.json(issueCaptcha());
}
