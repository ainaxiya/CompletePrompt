// 干跑验证：抽取匹配作品，拉详情，统计分段↔节点映射质量
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { extractNodes, mapSections, saveCachedNodes } from "./liblib-map.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new PrismaClient();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const H = { "User-Agent": UA, "x-language": "zh", Origin: "https://www.liblib.tv", Referer: "https://www.liblib.tv/" };

function parseSections(content) {
  const re = /^\[(\d+)\]\s*(.+)$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(content))) marks.push({ pos: m.index, no: +m[1], label: m[2] });
  return marks.map((mk, i) => {
    const nl = content.indexOf("\n", mk.pos);
    const start = nl < 0 ? mk.pos : nl + 1;
    const end = i + 1 < marks.length ? marks[i + 1].pos : content.length;
    return { index: mk.no, label: mk.label, body: content.slice(start, end).trim() };
  });
}

async function fetchDetail(templateUuid, retry = 4) {
  for (let i = 0; i < retry; i++) {
    try {
      const r = await fetch(
        `https://api.liblib.tv/api/community/project/template/detail?projectTemplateUuid=${templateUuid}`,
        { headers: H, signal: AbortSignal.timeout(30000) }
      );
      const j = await r.json();
      if (j.code === 0) return j.data.detail;
      return { error: j.code, msg: j.msg };
    } catch (e) {
      if (i === retry - 1) return { error: -1, msg: e.message };
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const SAMPLE = Number(process.argv[2] || 40);
const feed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "liblib", "feed.json"), "utf8")).items;
const prompts0 = await db.prompt.findMany({
  where: { sourceSite: "liblib.tv" },
  select: { id: true, title: true, type: true, sourceUrl: true },
});
const prompts = prompts0;
const re = /sourceProjectUuid=([0-9a-f-]{32,36})/i;
const matched = prompts.filter((p) => feed[(p.sourceUrl || "").match(re)?.[1] || ""]);
console.log("matched works:", matched.length);

// 分层抽样：image / video 各一半，随机但固定种子
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const imgs = matched.filter((p) => p.type === "image");
const vids = matched.filter((p) => p.type === "video");
const others = matched.filter((p) => p.type !== "image" && p.type !== "video");
const pick = (arr, n) => {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c.slice(0, n);
};
const sample = [
  ...pick(imgs, Math.ceil(SAMPLE / 2)),
  ...pick(vids, Math.floor(SAMPLE / 2)),
  ...pick(others, 4),
];

const agg = { sections: 0, exactUnique: 0, exactPrompt: 0, normUnique: 0, normPrompt: 0, assigned: 0, promptOnly: 0, ambiguous: 0, textNode: 0, none: 0, fetchErr: 0 };
let worksOk = 0;
const sampleRows = [];
for (const p0 of sample) {
  let content = "";
  try {
    content = (await db.prompt.findUnique({ where: { id: p0.id }, select: { content: true } }))?.content || "";
  } catch {}
  const p = { ...p0, content };
  const item = feed[p.sourceUrl.match(re)[1]];
  const detail = await fetchDetail(item.templateUuid);
  if (detail.error) { agg.fetchErr++; console.log("FETCH ERR", p.title, detail.error, detail.msg); continue; }
  const nodes = extractNodes(detail.snapshotData);
  saveCachedNodes(item.templateUuid, nodes, { workId: p.id, title: p.title });
  const sections = parseSections(p.content);
  const { stats, ambigu } = mapSections(sections, nodes);
  worksOk++;
  agg.sections += sections.length;
  for (const k of ["exactUnique", "exactPrompt", "normUnique", "normPrompt", "assigned", "promptOnly", "ambiguous", "textNode", "none"]) agg[k] += stats[k];
  const mapped = sections.length - stats.ambiguous - stats.none - stats.textNode;
  sampleRows.push({
    id: p.id, type: p.type, title: p.title.slice(0, 22),
    nodes: nodes.length, secs: sections.length, mapped,
    amb: stats.ambiguous, text: stats.textNode, none: stats.none,
  });
  if (ambigu.length) {
    console.log("\nAMBIGU sample in", p.title);
    for (const a of ambigu.slice(0, 4)) console.log("  [" + a.sec + "]", a.label, "score", a.score);
  }
}
console.log("\n== works:", worksOk, "fetchErr:", agg.fetchErr);
console.log("sections:", agg.sections);
console.log(agg);
const denom = Math.max(1, agg.sections - agg.textNode);
const rate = ((denom - agg.ambiguous - agg.none) / denom * 100).toFixed(1);
console.log("mapped rate (excl text nodes):", rate + "%");
console.log("\nper work:");
for (const r of sampleRows) console.log(`  [${r.type}] ${r.title} nodes=${r.nodes} secs=${r.secs} mapped=${r.mapped} amb=${r.amb} text=${r.text} none=${r.none}`);
await db.$disconnect();
