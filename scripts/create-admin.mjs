// 用法: node scripts/create-admin.mjs <username> <password>
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const username = process.argv[2] || "admin";
const password = process.argv[3] || "admin123456";

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const u = await db.user.upsert({
    where: { username },
    update: { role: "admin", passwordHash: hash, status: "active" },
    create: { username, passwordHash: hash, role: "admin", status: "active" },
  });
  console.log(`admin ready: id=${u.id} username=${u.username} password=${password}`);
}
main().finally(() => db.$disconnect());
