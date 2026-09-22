import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signToken, setAuthCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // 防爆破：每 IP 每分钟最多 12 次登录尝试
  if (!rateLimit(`login:${clientIp(req)}`, 12, 60_000)) {
    return NextResponse.json({ error: "尝试过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const { username, password } = (body || {}) as Record<string, string>;
  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }
  // 长度上限：防止超长输入拖垮 bcrypt（bcrypt 只取前 72 字节）
  if (username.length > 64 || password.length > 128) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { username } });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  await setAuthCookie(await signToken(user.id));
  return NextResponse.json({ id: user.id, username: user.username });
}
