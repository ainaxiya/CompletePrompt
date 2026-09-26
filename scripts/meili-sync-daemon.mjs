// Meilisearch 秒级增量同步守护进程（PM2 常驻）
//
// 作用：轮询 SiteSetting(site.meiliSyncSeconds) 配置的间隔，把数据库中
// updatedAt 大于水位线的提示词增量推送到 Meilisearch；下线/删除的文档从索引移除。
// 应用自身的增删改接口已实时同步，本进程是兜底（采集入库、直接改库、计数漂移等）。
//
// 启动：
//   pm2 start scripts/meili-sync-daemon.mjs --name CompletePrompt-MeiliSync
//   pm2 save
// 日志：pm2 logs CompletePrompt-MeiliSync
// 停止：pm2 stop CompletePrompt-MeiliSync
//
// 间隔在后台「网站设置 → 搜索索引」修改，下一轮询自动生效；填 0 = 暂停自动同步。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "..", ".meili-sync-state.json");

const db = new PrismaClient();
const meili = new MeiliSearch({
  host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY || "",
});
const index = meili.index("prompts");

const BATCH = 200;                 // 每批文档数
const DEFAULT_INTERVAL = 30;       // 默认 30 秒
const IDLE_TICK = 10_000;          // 关闭同步时的空转检查
const RECONCILE_EVERY = 10 * 60_000; // 每 10 分钟做一次硬删除对账

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ─── 水位线状态（持久化到本地文件，重启不丢） ───
function loadWatermark() {
  try {
    if (existsSync(STATE_FILE)) {
      const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      if (s.watermark) return new Date(s.watermark);
    }
  } catch {}
  // 首次启动：只同步近 2 分钟的变更，避免与现有索引重复全量
  return new Date(Date.now() - 120_000);
}
let watermark = loadWatermark();
function saveWatermark() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ watermark: watermark.toISOString() }));
  } catch (e) {
    console.error("save watermark failed:", e.message);
  }
}

// ─── 配置：直接查 SiteSetting，绕过 Next 层缓存 ───
async function getIntervalSeconds() {
  try {
    const row = await db.siteSetting.findUnique({ where: { key: "site" } });
    if (row) {
      const v = JSON.parse(row.value);
      const n = Number(v.meiliSyncSeconds);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {}
  return DEFAULT_INTERVAL;
}

// ─── 索引结构（与 src/lib/meili.ts 的文档保持一致） ───
function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toDoc(p) {
  return {
    id: p.id,
    title: p.title,
    content: stripHtml(p.content).slice(0, 15000),
    description: (p.description || "").slice(0, 2000),
    type: p.type,
    category: p.category,
    language: p.language,
    tags: p.tags,
    sourceAuthor: p.sourceAuthor || p.user?.username || null,
    promptCode: p.promptCode,
    coverUrl: p.coverUrl,
    featured: p.featured,
    likeCount: p.likeCount,
    viewCount: p.viewCount,
    createdAtTs: Math.floor(p.createdAt.getTime() / 1000),
  };
}

// ─── 增量同步一轮 ───
async function tick() {
  let touched = 0;
  for (;;) {
    const rows = await db.prompt.findMany({
      where: { updatedAt: { gt: watermark } },
      orderBy: { updatedAt: "asc" },
      take: BATCH,
      include: { user: { select: { username: true } } },
    });
    if (rows.length === 0) break;

    const upserts = rows.filter((p) => p.status === "published").map(toDoc);
    const deletes = rows.filter((p) => p.status !== "published").map((p) => p.id);

    if (upserts.length) await index.addDocuments(upserts, { primaryKey: "id" });
    if (deletes.length) await index.deleteDocuments(deletes);

    watermark = rows[rows.length - 1].updatedAt;
    saveWatermark();
    touched += rows.length;
    if (rows.length < BATCH) break;
  }
  if (touched) log(`incremental sync: ${touched} changed`);
  return touched;
}

// ─── 硬删除对账：索引里存在、DB 已不存在（或已下线）的文档清掉 ───
async function reconcile() {
  const indexedIds = new Set();
  let offset = 0;
  for (;;) {
    const docs = await index.getDocuments({ limit: 1000, offset, fields: ["id"] });
    if (!docs.results.length) break;
    for (const d of docs.results) indexedIds.add(Number(d.id));
    offset += docs.results.length;
    if (docs.results.length < 1000) break;
  }
  if (indexedIds.size === 0) return 0;

  const stale = [];
  for (const id of indexedIds) {
    const p = await db.prompt.findUnique({ where: { id }, select: { status: true } });
    if (!p || p.status !== "published") stale.push(id);
  }
  // 分块删除
  for (let i = 0; i < stale.length; i += 500) {
    await index.deleteDocuments(stale.slice(i, i + 500));
  }
  if (stale.length) log(`reconcile: removed ${stale.length} stale docs`);
  return stale.length;
}

async function ensureSettings() {
  try {
    await index.updateFilterableAttributes(["type", "tags", "category", "language"]);
    await index.updateSortableAttributes(["likeCount", "viewCount", "createdAtTs"]);
  } catch (e) {
    console.error("ensure index settings failed:", e.message);
  }
}

async function main() {
  log("MeiliSync daemon started, host =", process.env.MEILI_HOST || "http://127.0.0.1:7700");
  await ensureSettings();
  let lastReconcile = 0;

  for (;;) {
    const interval = await getIntervalSeconds();
    try {
      if (interval > 0) {
        await tick();
        if (Date.now() - lastReconcile > RECONCILE_EVERY) {
          await reconcile();
          lastReconcile = Date.now();
        }
        await new Promise((r) => setTimeout(r, interval * 1000));
      } else {
        // 自动同步已关闭：空转等待配置恢复
        await new Promise((r) => setTimeout(r, IDLE_TICK));
      }
    } catch (e) {
      console.error("sync tick failed:", e.message);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {}); // 常驻进程，不主动 disconnect

// PM2 stop / Ctrl+C 时保存水位
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    saveWatermark();
    await db.$disconnect().catch(() => {});
    process.exit(0);
  });
}
