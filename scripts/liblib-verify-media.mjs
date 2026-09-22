// 最终校验：已导入作品的媒体文件有效性 + 图文一一对应复核
// 用法：node scripts/liblib-verify-media.mjs [抽样数=150]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { loadCachedNodes, mapSections } from "./liblib-map.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data", "liblib");
const PUB = path.join(__dirname, "..", "public");
const N = Number(process.argv[2] || 150);
const db = new PrismaClient();
const works = JSON.parse(fs.readFileSync(path.join(DATA, "works.json"), "utf8"));
const state = JSON.parse(fs.readFileSync(path.join(DATA, "import-state.json"), "utf8"));

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

const doneIds = Object.keys(state.works).filter((id) => state.works[id].status === "done" && works[id]);
// 等距抽样
const picked = [];
for (let i = 0; i < Math.min(N, doneIds.length); i++) {
  picked.push(doneIds[Math.round((i * (doneIds.length - 1)) / Math.max(1, Math.min(N, doneIds.length) - 1))]);
}

const issues = [];
let checkedFiles = 0;
let nodeItems = 0;
let coverItems = 0;
let sectionHit = 0;

for (const idStr of picked) {
  const id = Number(idStr);
  let p;
  try {
    p = await db.prompt.findUnique({ where: { id }, select: { title: true, content: true, media: true } });
  } catch {
    continue;
  }
  if (!p || !Array.isArray(p.media)) continue;
  const sections = parseSections(p.content || "");
  const nodes = loadCachedNodes(works[id].templateUuid);
  const mapped = nodes ? mapSections(sections, nodes).result : null;

  for (const m of p.media) {
    if (!m.url || !m.url.startsWith("/uploads/liblib/")) {
      issues.push({ id, type: "url", url: m.url });
      continue;
    }
    const fp = path.join(PUB, m.url);
    if (!fs.existsSync(fp)) {
      issues.push({ id, type: "missing-file", url: m.url });
      continue;
    }
    const sz = fs.statSync(fp).size;
    if (sz < 1500) issues.push({ id, type: "tiny-file", url: m.url, sz });
    try {
      const meta = await sharp(fp).metadata();
      if (!meta.width || !meta.height) issues.push({ id, type: "bad-image", url: m.url });
      checkedFiles++;
    } catch (e) {
      issues.push({ id, type: "unreadable", url: m.url, err: e.message });
    }

    if (m.role === "cover") {
      coverItems++;
    } else if (m.role === "node") {
      nodeItems++;
      const sec = sections.find((s) => s.index === m.section);
      if (!sec) {
        issues.push({ id, type: "section-not-found", section: m.section, url: m.url });
        continue;
      }
      sectionHit++;
      // 复核：重跑映射后该分段的节点 urls 必须包含该 sourceUrl
      if (mapped) {
        const hit = mapped.get(m.section);
        const ok = hit && hit.node.urls.includes(m.sourceUrl);
        if (!ok) issues.push({ id, type: "correspondence", section: m.section, node: hit?.node?.name });
      }
    }
  }
}

const result = {
  sampledWorks: picked.length,
  checkedFiles,
  coverItems,
  nodeItems,
  sectionHit,
  issueCount: issues.length,
  issues: issues.slice(0, 30),
};
const outStr = JSON.stringify(result, null, 1);
console.log(outStr);
fs.writeFileSync(path.join(DATA, "verify-300-result.json"), outStr, "utf8");
await db.$disconnect();
