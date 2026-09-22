// 全量重建 Meili 索引（V2：含 category 过滤、coverUrl/featured 展示字段）
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";
import "dotenv/config";

const db = new PrismaClient();
const meili = new MeiliSearch({
  host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY || "",
});

async function main() {
  const index = meili.index("prompts");
  const total = await db.prompt.count({ where: { status: "published" } });
  console.log("published prompts:", total);

  let processed = 0;
  const take = 500;
  for (let skip = 0; skip < total; skip += take) {
    const rows = await db.prompt.findMany({
      where: { status: "published" },
      orderBy: { id: "asc" },
      skip,
      take,
      include: { user: { select: { username: true } } },
    });
    const docs = rows.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content.slice(0, 15000),
      description: (p.description || "").slice(0, 2000),
      type: p.type,
      category: p.category,
      language: p.language,
      tags: p.tags,
      sourceAuthor: p.sourceAuthor || p.user.username,
      promptCode: p.promptCode,
      coverUrl: p.coverUrl,
      featured: p.featured,
      likeCount: p.likeCount,
      viewCount: p.viewCount,
      createdAtTs: Math.floor(p.createdAt.getTime() / 1000),
    }));
    await index.addDocuments(docs, { primaryKey: "id" });
    processed += docs.length;
    process.stdout.write(`\rindexed ${processed}/${total}`);
  }
  console.log("\nwait task…");
  await index.updateSortableAttributes(["likeCount", "viewCount", "createdAtTs"]);
  await new Promise((r) => setTimeout(r, 3000));
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
