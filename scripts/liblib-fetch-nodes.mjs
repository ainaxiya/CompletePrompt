// Stage A：为所有匹配作品抓取 community template detail，缓存紧凑节点数据
// 断点续跑：data/liblib/nodes/<templateUuid>.json 已存在则跳过
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { extractNodes, saveCachedNodes, loadCachedNodes, CACHE_DIR } from "./liblib-map.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data", "liblib");
const WORKS_JSON = path.join(DATA, "works.json");
const db = new PrismaClient();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const H = { "User-Agent": UA, "x-language": "zh", Origin: "https://www.liblib.tv", Referer: "https://www.liblib.tv/" };
const CONC = 5;

async function fetchDetail(templateUuid, retry = 5) {
  for (let i = 0; i < retry; i++) {
    try {
      const r = await fetch(
        `https://api.liblib.tv/api/community/project/template/detail?projectTemplateUuid=${templateUuid}`,
        { headers: H, signal: AbortSignal.timeout(30000) }
      );
      const j = await r.json();
      if (j.code === 0) return { ok: true, detail: j.data.detail };
      if (j.code === 10051) return { ok: false, gone: true, code: j.code };
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      if (i === retry - 1) return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: "retries" };
}

const feed = JSON.parse(fs.readFileSync(path.join(DATA, "feed.json"), "utf8")).items;
const prompts = await db.prompt.findMany({
  where: { sourceSite: "liblib.tv" },
  select: { id: true, title: true, type: true, sourceUrl: true },
});
const re = /sourceProjectUuid=([0-9a-f-]{32,36})/i;
const jobs = [];
const works = {};
for (const p of prompts) {
  const uuid = (p.sourceUrl || "").match(re)?.[1];
  const item = uuid && feed[uuid];
  if (!item) continue;
  jobs.push({ promptId: p.id, dbType: p.type, item });
  works[p.id] = {
    templateUuid: item.templateUuid,
    projectUuid: uuid,
    title: p.title,
    dbType: p.type,
    coverUrl: item.coverUrl || null,
    finalOutput: item.finalOutput || null,
  };
}
fs.mkdirSync(CACHE_DIR, { recursive: true });
console.log("matched jobs:", jobs.length);

let done = 0, cached = 0, gone = 0, failed = 0;
const failedList = [];
async function worker(queue) {
  while (queue.length) {
    const job = queue.shift();
    const { promptId, item } = job;
    if (loadCachedNodes(item.templateUuid)) { cached++; done++; continue; }
    const res = await fetchDetail(item.templateUuid);
    if (res.ok) {
      try {
        const nodes = extractNodes(res.detail.snapshotData);
        saveCachedNodes(item.templateUuid, nodes, {
          workId: promptId,
          title: works[promptId].title,
          coverUrl: item.coverUrl || null,
        });
      } catch (e) {
        failed++; failedList.push({ promptId, error: "parse:" + e.message });
      }
    } else if (res.gone) {
      gone++;
      works[promptId].gone = true;
    } else {
      failed++; failedList.push({ promptId, error: res.error });
    }
    done++;
    if (done % 50 === 0) {
      console.log(`progress ${done}/${jobs.length} cached=${cached} gone=${gone} failed=${failed}`);
      fs.writeFileSync(path.join(DATA, "fetch-failed.json"), JSON.stringify(failedList));
    }
  }
}
const queues = Array.from({ length: CONC }, () => []);
jobs.forEach((j, i) => queues[i % CONC].push(j));
await Promise.all(queues.map((q) => worker(q)));

fs.writeFileSync(WORKS_JSON, JSON.stringify(works));
fs.writeFileSync(path.join(DATA, "fetch-failed.json"), JSON.stringify(failedList));
console.log(`DONE total=${jobs.length} newCached=${done - cached - gone - failed} cached=${cached} gone=${gone} failed=${failed}`);
await db.$disconnect();
