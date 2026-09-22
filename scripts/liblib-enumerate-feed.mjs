// 枚举 LibTV 社区 feed：全部标签 + 无标签热门，分页到 hasMore=false
// 输出 data/liblib/feed.json：{ projectUuid: item }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data", "liblib");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "feed.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const FEED = "https://api.liblib.tv/api/community/project/template/feed/stream";
const H = {
  "User-Agent": UA,
  "Content-Type": "application/json",
  "x-language": "zh",
  Origin: "https://www.liblib.tv",
  Referer: "https://www.liblib.tv/",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function postJson(body, retry = 5) {
  for (let i = 0; i < retry; i++) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(FEED, { method: "POST", headers: H, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(tm);
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      const j = await r.json();
      if (j.code === 0) return j.data;
      await sleep(1500 * (i + 1));
    } catch (e) {
      clearTimeout(tm);
      console.log("  retry", i + 1, e.name, e.message?.slice(0, 60));
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error("feed request failed: " + JSON.stringify(body));
}

const map = new Map();
if (fs.existsSync(OUT)) {
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  for (const [k, v] of Object.entries(old.items || {})) map.set(k, v);
  console.log("resume with", map.size, "known items");
}
let totalReqs = 0;
function addItems(list, tag) {
  for (const it of list) {
    if (!it?.projectUuid) continue;
    const ex = map.get(it.projectUuid);
    const tags = new Set(ex?.feedTags || []);
    if (tag != null) tags.add(tag);
    map.set(it.projectUuid, { ...(ex || {}), ...it, feedTags: [...tags] });
  }
}
function save(doneTags) {
  fs.writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), doneTags, items: Object.fromEntries(map) }));
}

async function crawlTag(tagId, label) {
  let page = 1;
  let guard = 0;
  while (guard++ < 400) {
    const data = await postJson({ page, pageSize: 20, requestId: `c${tagId ?? "hot"}-${page}-${Math.random().toString(36).slice(2, 8)}`, tagId });
    totalReqs++;
    const list = data.list || [];
    addItems(list, tagId);
    if (page % 10 === 0 || !data.hasMore) {
      console.log(`[${label}] page ${page} +${list.length} total=${map.size} hasMore=${data.hasMore}`);
      save([...doneTags]);
    }
    if (!data.hasMore || list.length === 0) break;
    page++;
    await sleep(250);
  }
}

const TAGS = [null, 1900, 3057, 3050, 1000, 1200, 1800, 1100, 1300, 1500, 1600];
const doneTags = [];
if (fs.existsSync(OUT)) {
  try { doneTags.push(...(JSON.parse(fs.readFileSync(OUT, "utf8")).doneTags || [])); } catch {}
}
for (const tag of TAGS) {
  if (doneTags.includes(tag)) { console.log("skip done tag", tag); continue; }
  await crawlTag(tag, tag == null ? "hot" : String(tag));
  doneTags.push(tag);
  save(doneTags);
}
save(doneTags);
console.log(`DONE requests=${totalReqs} unique works=${map.size}`);
