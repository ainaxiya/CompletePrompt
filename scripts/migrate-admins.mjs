// 管理员体系拆分迁移：User(role=admin) → AdminAccount 独立表
// 可重复执行（幂等）；执行前请先 prisma db push 同步新表结构。
// 用法：node scripts/migrate-admins.mjs
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const db = new PrismaClient();

async function main() {
  const legacyAdmins = await db.user.findMany({ where: { role: "admin" } });
  console.log(`发现旧版管理员 ${legacyAdmins.length} 个`);

  let created = 0;
  const migratedIds = [];

  for (const u of legacyAdmins) {
    const existed = await db.adminAccount.findUnique({ where: { id: u.id } });
    if (existed) {
      migratedIds.push(u.id);
      continue;
    }
    // 沿用旧约定：未分配角色 = 超级管理员
    await db.adminAccount.create({
      data: {
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        passwordHash: u.passwordHash || "!", // 理论上管理员都有密码；占位防止非空约束失败
        status: u.status === "active" ? "active" : "disabled",
        isSuper: !u.adminRoleId,
        adminRoleId: u.adminRoleId,
      },
    });
    created++;
    migratedIds.push(u.id);
  }

  // 回填历史操作日志的 adminId
  if (migratedIds.length) {
    const result = await db.$executeRawUnsafe(
      `UPDATE "AdminLog" SET "adminId" = "userId" WHERE "adminId" IS NULL AND "userId" = ANY($1::int[])`,
      migratedIds
    );
    console.log(`回填操作日志 adminId：${result} 条`);
  }

  // 旧管理员记录标记为 legacy（保留行以维持 prompt 外键，用户管理列表将隐藏）
  const marked = await db.user.updateMany({
    where: { id: { in: migratedIds }, role: "admin" },
    data: { role: "admin_legacy" },
  });
  console.log(`新建 AdminAccount ${created} 个；标记 admin_legacy 历史记录 ${marked.count} 个`);

  // 保证至少存在一个超级管理员
  const superCount = await db.adminAccount.count({ where: { isSuper: true, status: "active" } });
  if (superCount === 0) {
    console.warn("⚠️ 警告：没有任何启用状态的超级管理员，请在后台创建！");
  } else {
    console.log(`启用中的超级管理员 ${superCount} 个`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
