import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// 现有分类（按出现次数排序）+ 对应英文名
const NAME_EN = {
  AI创作: "AI Art",
  开发: "Dev",
  视频: "Video",
  网络安全: "Security",
  游戏制作: "Game Dev",
  其他: "Other",
};

const list = await db.prompt.groupBy({
  by: ["category"],
  _count: { category: true },
  orderBy: { _count: { category: "desc" } },
});

console.log("现有分类：");
for (const r of list) {
  console.log(`  ${r.category} (${r._count.category})`);
}

let sort = 0;
for (const r of list) {
  const name = r.category || "其他";
  const slug = name; // 现有数据用中文名作 slug，保持 Prompt.category 兼容
  const nameEn = NAME_EN[name] || name;
  await db.category.upsert({
    where: { slug },
    create: { name, nameEn, slug, sort },
    update: { name, nameEn, sort },
  });
  console.log(`  upserted: ${name} -> ${nameEn} (sort=${sort})`);
  sort++;
}

const total = await db.category.count();
console.log(`\n完成，分类总数：${total}`);
await db.$disconnect();
