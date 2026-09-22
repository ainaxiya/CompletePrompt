// 导入 data/prompts.jsonl 到 Postgres，并建立 Meilisearch 索引
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";

const prisma = new PrismaClient();
const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_KEY = process.env.MEILI_MASTER_KEY || "";
const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

const DATA = path.join(process.cwd(), "data", "prompts.jsonl");
if (!fs.existsSync(DATA)) {
  console.error("data/prompts.jsonl not found, run `npm run parse` first");
  process.exit(1);
}

// 流式逐行读取（文件 700MB+，超出 Node 单字符串上限）
async function* readLines(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line) yield line;
  }
}

// 1) 导入用户
const importer = await prisma.user.upsert({
  where: { username: "liblib" },
  update: {},
  create: {
    username: "liblib",
    bio: "LibTV（liblib.tv）公开作品创作过程提示词官方导入号",
    role: "importer",
  },
});

// 2) 批量入库（跳过已存在 sourceUrl）
const existing = new Set(
  (await prisma.prompt.findMany({ where: { sourceUrl: { not: null } }, select: { sourceUrl: true } }))
    .map((p) => p.sourceUrl)
);
const batch = [];
let inserted = 0;
let docs = [];

const flushInsert = async () => {
  if (!batch.length) return;
  const rows = batch.splice(0, batch.length);
  const res = await prisma.prompt.createMany({ data: rows });
  inserted += res.count;
};

for await (const line of readLines(DATA)) {
  const r = JSON.parse(line);
  if (r.sourceUrl && existing.has(r.sourceUrl)) continue;
  if (!r.sourceUrl && existing.size) {
    // 无链接记录按标题去重代价高，直接跳过策略：允许少量重复
  }
  batch.push({
    userId: importer.id,
    title: r.title,
    content: r.content,
    description: r.description,
    type: r.type,
    model: null,
    tags: r.tags.slice(0, 8),
    sourceSite: "liblib.tv",
    sourceAuthor: r.sourceAuthor,
    sourceUrl: r.sourceUrl,
    likeCount: r.likeCount || 0,
    viewCount: Math.floor(Math.random() * 200),
    createdAt: r.publishedAt ? new Date(r.publishedAt) : new Date(),
  });
  if (batch.length >= 500) await flushInsert();
}
await flushInsert();
console.log("inserted:", inserted);

// 3) Meilisearch 索引
const index = meili.index("prompts");
try {
  await meili.deleteIndex("prompts");
} catch {}
await meili.createIndex("prompts", { primaryKey: "id" });
await index.updateSettings({
  searchableAttributes: ["title", "tags", "description", "content", "sourceAuthor"],
  filterableAttributes: ["type", "tags"],
  sortableAttributes: ["likeCount", "createdAtTs", "viewCount"],
  rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
});

const total = await prisma.prompt.count();
const step = 1000;
for (let skip = 0; skip < total; skip += step) {
  const rows = await prisma.prompt.findMany({
    select: {
      id: true, title: true, content: true, description: true,
      type: true, tags: true, sourceAuthor: true, likeCount: true,
      viewCount: true, createdAt: true,
    },
    skip,
    take: step,
    orderBy: { id: "asc" },
  });
  docs = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content.slice(0, 15000), // 搜索索引截断，DB 保留全文
    description: (r.description || "").slice(0, 2000),
    type: r.type,
    tags: r.tags,
    sourceAuthor: r.sourceAuthor,
    likeCount: r.likeCount,
    viewCount: r.viewCount,
    createdAtTs: Math.floor((r.createdAt?.getTime() || 0) / 1000),
  }));
  await index.addDocuments(docs, { primaryKey: "id" });
  console.log(`meili indexed ${Math.min(skip + step, total)}/${total}`);
}

console.log("[SEED DONE] prompts:", total);
await prisma.$disconnect();
