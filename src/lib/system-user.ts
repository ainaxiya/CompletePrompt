import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * 系统作者账号（User 表 role=importer）。
 *
 * 新管理员体系中 Prompt.userId 仍外键指向 User 表，而后台操作者是 AdminAccount。
 * 后台手动发布/编辑的提示词统一挂在系统账号下，真正作者通过 Prompt.adminAuthorId 关联管理员。
 * 该账号不允许前台登录（登录接口只接受 role=user），也不会出现在后台用户管理列表。
 */
export const SYSTEM_USERNAME = "system";

export async function getSystemUser() {
  const existing = await db.user.findUnique({ where: { username: SYSTEM_USERNAME } });
  if (existing) return existing;

  // 随机 48 位密码，任何人均无法登录
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex") + Date.now(), 10);
  return db.user.upsert({
    where: { username: SYSTEM_USERNAME },
    update: { role: "importer", allowPublish: true, status: "active" },
    create: {
      username: SYSTEM_USERNAME,
      nickname: "本站官方",
      passwordHash,
      role: "importer",
      status: "active",
      allowPublish: true,
      bio: "平台官方发布账号",
    },
  });
}
