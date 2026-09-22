import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signToken, setAuthCookie } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9_\-]+$/, "用户名只能包含字母、数字、下划线、连字符"),
  password: z.string().min(6).max(72),
});

export async function POST(req: NextRequest) {
  // 防批量注册：每 IP 每 10 分钟最多 8 次
  if (!rateLimit(`register:${clientIp(req)}`, 8, 600_000)) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const settings = await getSettings();
  if (!settings.basic.allowRegister) {
    return NextResponse.json({ error: "registration closed" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "用户名 3-20 位（字母数字下划线），密码至少 6 位" }, { status: 400 });
  }
  const { username, password } = parsed.data;
  const exists = await db.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }
  const user = await db.user.create({
    data: { username, passwordHash: await bcrypt.hash(password, 10) },
  });
  await setAuthCookie(await signToken(user.id));
  return NextResponse.json({ id: user.id, username: user.username });
}
