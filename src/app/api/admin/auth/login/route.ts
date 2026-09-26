import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signAdminToken, setAdminAuthCookie } from "@/lib/auth";
import { logAdminAction, getClientIp } from "@/lib/rbac";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/admin/auth/login  管理员独立登录（与会员登录完全分离）
export async function POST(req: NextRequest) {
  // 防爆破：管理员登录更严格，每 IP 每分钟 8 次
  if (!rateLimit(`admin-login:${clientIp(req)}`, 8, 60_000)) {
    return NextResponse.json({ error: "尝试过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const { username, password } = (body || {}) as Record<string, string>;
  if (!username || !password) {
    return NextResponse.json({ error: "请输入管理员账号和密码" }, { status: 400 });
  }
  if (username.length > 64 || password.length > 128) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }

  const admin = await db.adminAccount.findUnique({ where: { username } });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }
  if (admin.status !== "active") {
    return NextResponse.json({ error: "该管理员账号已被禁用，请联系超级管理员" }, { status: 403 });
  }

  const ip = (await getClientIp()) || clientIp(req);
  await db.adminAccount.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  });

  await setAdminAuthCookie(await signAdminToken(admin.id));
  await logAdminAction({
    adminId: admin.id,
    action: "login",
    ip,
  });

  return NextResponse.json({
    id: admin.id,
    username: admin.username,
    nickname: admin.nickname,
    isSuper: admin.isSuper,
  });
}
