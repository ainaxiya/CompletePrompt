// 1) 导入 data/packs.jsonl 中的 2368 条提示词
// 2) 回填已有 liblib 提示词的 category="AI创作" / language="zh"
// 3) 重建 Meilisearch 索引（加入 category/language 可过滤）
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";

const prisma = new PrismaClient();
const meili = new MeiliSearch({
  host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY || "",
});

const DATA = path.join(process.cwd(), "data", "packs.jsonl");
if (!fs.existsSync(DATA)) {
  console.error("data/packs.jsonl not found, run `python scripts/parse_packs.py` first");
  process.exit(1);
}

async function* readLines(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) if (line) yield line;
}

// 1) 导入新提示词
const importer = await prisma.user.upsert({
  where: { username: "promptpacks" },
  update: {},
  create: {
    username: "promptpacks",
    bio: "提示词大全官方导入号（开发/视频/网络安全/游戏制作/其他 五大类中英文提示词包）",
    role: "importer",
  },
});

// 去重：同一 category+language+promptCode 已存在则跳过
const existing = new Set(
  (await prisma.prompt.findMany({
    where: { promptCode: { not: null } },
    select: { category: true, language: true, promptCode: true },
  })).map((p) => `${p.category}|${p.language}|${p.promptCode}`)
);

let inserted = 0, skipped = 0;
const batch = [];
const flush = async () => {
  if (!batch.length) return;
  const rows = batch.splice(0, batch.length);
  try {
    inserted += (await prisma.prompt.createMany({ data: rows })).count;
  } catch (e) {
    console.warn("batch insert warn:", e.message);
  }
};

for await (const line of readLines(DATA)) {
  const r = JSON.parse(line);
  const key = `${r.category}|${r.language}|${r.promptCode}`;
  if (existing.has(key)) {
    skipped++;
    continue;
  }
  existing.add(key);
  batch.push({
    userId: importer.id,
    title: r.title,
    content: r.content,
    description: r.description,
    type: "text",
    category: r.category,
    language: r.language,
    promptCode: r.promptCode,
    tags: r.tags,
    sourceSite: "promptpacks",
    sourceAuthor: null,
  });
  if (batch.length >= 500) await flush();
}
await flush();
console.log(`packs: inserted=${inserted} skipped=${skipped}`);

// 2) 回填 liblib 数据的分类与语言（仅未设置 category 的记录）
const liblibUpdated = await prisma.prompt.updateMany({
  where: { category: "其他", sourceSite: "liblib.tv" },
  data: { category: "AI创作", language: "zh" },
});
console.log(`liblib backfill: updated=${liblibUpdated.count}`);

// 3) 重建 Meili 索引
try {
  await meili.deleteIndex("prompts");
} catch {}
await meili.createIndex("prompts", { primaryKey: "id" });
await meili.index("prompts").updateSettings({
  searchableAttributes: ["title", "tags", "description", "content", "sourceAuthor", "promptCode"],
  filterableAttributes: ["type", "tags", "category", "language"],
  sortableAttributes: ["likeCount", "createdAtTs", "viewCount"],
  rankingRules: ["words", "typo", "proximity", "attribute", "exactness", "createdAtTs:desc"],
});

const total = await prisma.prompt.count();
const step = 1000;
for (let skip = 0; skip < total; skip += step) {
  const rows = await prisma.prompt.findMany({
    select: {
      id: true, title: true, content: true, description: true,
      type: true, category: true, language: true, tags: true,
      sourceAuthor: true, promptCode: true, likeCount: true, viewCount: true, createdAt: true,
    },
    skip, take: step, orderBy: { id: "asc" },
  });
  const docs = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: (r.content || "").slice(0, 15000),
    description: (r.description || "").slice(0, 2000),
    type: r.type,
    category: r.category,
    language: r.language,
    tags: r.tags,
    sourceAuthor: r.sourceAuthor,
    promptCode: r.promptCode,
    likeCount: r.likeCount,
    viewCount: r.viewCount,
    createdAtTs: Math.floor((r.createdAt?.getTime() || 0) / 1000),
  }));
  await meili.index("prompts").addDocuments(docs, { primaryKey: "id" });
  console.log(`meili indexed ${Math.min(skip + step, total)}/${total}`);
}

console.log(`[DONE] total prompts: ${total}`);
await prisma.$disconnect();
