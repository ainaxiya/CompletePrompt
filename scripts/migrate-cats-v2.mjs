import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// 新分类（顺序即展示排序）
const NEW_CATS = [
  { name: "视频创作", nameEn: "Video Creation" },
  { name: "音频创作", nameEn: "Audio Creation" },
  { name: "图片创作", nameEn: "Image Creation" },
  { name: "编程开发", nameEn: "Programming" },
  { name: "游戏设计", nameEn: "Game Design" },
  { name: "网站开发", nameEn: "Web Development" },
  { name: "办公写作", nameEn: "Office & Writing" },
  { name: "网络安全", nameEn: "Cybersecurity" },
  { name: "科学物理", nameEn: "Science & Physics" },
  { name: "金融理财", nameEn: "Finance" },
  { name: "AI智能体", nameEn: "AI Agents" },
];

// AI创作按类型拆分；其他的文本是出图提示词→图片创作，视频→视频创作
async function migrate() {
  const rules = [
    { from: "AI创作", type: "image", to: "图片创作" },
    { from: "AI创作", type: "video", to: "视频创作" },
    { from: "AI创作", type: "audio", to: "音频创作" },
    { from: "AI创作", type: "text", to: "AI智能体" },
    { from: "其他", type: "text", to: "图片创作" },
    { from: "其他", type: "video", to: "视频创作" },
    { from: "视频", to: "视频创作" },
    { from: "开发", to: "编程开发" },
    { from: "游戏制作", to: "游戏设计" },
    { from: "网络安全", to: "网络安全" },
  ];

  for (const r of rules) {
    const where = { category: r.from, ...(r.type ? { type: r.type } : {}) };
    const res = await db.prompt.updateMany({ where, data: { category: r.to } });
    console.log(`${r.from}${r.type ? "/" + r.type : ""} -> ${r.to}: ${res.count}`);
  }

  // 兜底：任何仍引用旧分类的（防御性）
  const leftovers = await db.prompt.groupBy({ by: ["category"], _count: true });
  const newNames = new Set(NEW_CATS.map((c) => c.name));
  for (const l of leftovers) {
    if (!newNames.has(l.category)) {
      const res = await db.prompt.updateMany({ where: { category: l.category }, data: { category: "办公写作" } });
      console.log(`兜底 ${l.category} -> 办公写作: ${res.count}`);
    }
  }

  // 重建分类表
  await db.category.deleteMany({});
  await db.category.createMany({
    data: NEW_CATS.map((c, i) => ({ ...c, slug: c.name, sort: i })),
  });

  const after = await db.prompt.groupBy({ by: ["category"], _count: true, orderBy: { category: "asc" } });
  console.log("\n迁移后分布：");
  for (const r of after) console.log(`  ${r.category}: ${r._count}`);
  await db.$disconnect();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
