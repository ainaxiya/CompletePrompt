import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "banned"]).optional(),
  membershipLevel: z.string().max(20).optional(),
  membershipDays: z.number().int().min(0).max(3650).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const uid = parseInt(id);
  if (uid === admin.id) {
    return NextResponse.json({ error: "不能修改自己的角色/状态" }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const d: any = { ...parsed.data };

  // 会员开通：从今天起 N 天；null/0 取消
  if ("membershipDays" in d) {
    const days = d.membershipDays;
    delete d.membershipDays;
    if (days) {
      const base = new Date();
      d.membershipUntil = new Date(base.getTime() + days * 86400_000);
    } else {
      d.membershipUntil = null;
      d.membershipLevel = "free";
    }
  }

  const u = await db.user.update({ where: { id: uid }, data: d });
  return NextResponse.json({
    ok: true,
    role: u.role,
    status: u.status,
    membershipLevel: u.membershipLevel,
    membershipUntil: u.membershipUntil,
  });
}
