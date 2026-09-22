// Stage B：分段映射 → 下载图片/视频截图（sharp/ffmpeg）→ 更新 DB media、coverUrl
// 用法：
//   node scripts/liblib-import-media.mjs --dry-run          只统计不下载
//   node scripts/liblib-import-media.mjs --limit 20         小批量试跑
//   node scripts/liblib-import-media.mjs --works 123,456    指定作品
//   node scripts/liblib-import-media.mjs --force            重做已完成作品
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { loadCachedNodes, mapSections } from "./liblib-map.mjs";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data", "liblib");
const UPLOAD_ROOT = path.join(__dirname, "..", "public", "uploads", "liblib");
const STATE_JSON = path.join(DATA, "import-state.json");
const FFMPEG = "C:\\Users\\ainax\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffmpeg.exe";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
// 并发可通过环境变量覆盖（机器内存吃紧时降并发，避免 OOM）
const DL_CONC = +(process.env.DL_CONC || 8);
const FFMPEG_CONC = +(process.env.FFMPEG_CONC || 5);
const BUILD_CONC = +(process.env.BUILD_CONC || 4);
const CHUNK = 250;
// 单作品媒体上限：作品是大型工作流（中位 55 个媒体，部分 700+），全量 31 万文件不可行
const IMG_CAP = 12; // 每作品图片节点最多下载数
const VID_CAP = 6; // 每作品视频截图最多数
const URLS_PER_NODE = 2; // 批量结果节点（如 4 宫格）最多取几张

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const ONLY_WORKS = args.includes("--works")
  ? new Set(args[args.indexOf("--works") + 1].split(",").map(Number))
  : null;

const db = new PrismaClient();
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
const state = fs.existsSync(STATE_JSON) ? JSON.parse(fs.readFileSync(STATE_JSON, "utf8")) : { works: {} };
function saveState() {
  fs.writeFileSync(STATE_JSON, JSON.stringify(state));
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchBuf(url, retry = 3) {
  for (let i = 0; i < retry; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://www.liblib.tv/", Origin: "https://www.liblib.tv" },
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === retry - 1) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

// 简单信号量
function semaphore(max) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active < max && q.length) { active++; q.shift()(); }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      q.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => { active--; next(); })
      );
      next();
    });
}
const imgSem = semaphore(DL_CONC);
const ffSem = semaphore(FFMPEG_CONC);
const buildSem = semaphore(BUILD_CONC);

const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46],
  gif: [0x47, 0x49, 0x46],
};
function sniff(buf) {
  for (const [k, sig] of Object.entries(MAGIC)) {
    if (sig.every((b, i) => buf[i] === b)) return k;
  }
  return null;
}

async function toWebp(buf, outPath) {
  await sharp(buf, { failOn: "none" })
    .rotate()
    .resize({ width: 1280, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(outPath);
}

async function downloadImage(url, filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return true;
  const buf = await fetchBuf(url);
  if (!sniff(buf)) throw new Error("not an image");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await toWebp(buf, filePath);
  return true;
}

async function screenshotVideo(url, outPath) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return true;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = outPath.replace(/\.webp$/, ".tmp.jpg");
  // 注意：并发由调用方 runTask 的 ffSem 控制，这里不能再次申请同一信号量（不可重入，会死锁）
  // 多个时间点尝试，规避片头黑场淡入（取平均亮度最高的一帧）
  const tries = ["1", "3", "0.5"];
  let best = null; // {mean, buf}
  for (const ss of tries) {
    try {
      await execFileP(
        FFMPEG,
        ["-nostdin", "-loglevel", "error", "-y", "-ss", ss, "-i", url, "-frames:v", "1", "-q:v", "4", "-vf", "scale=min(1280\\,iw):-2", tmp],
        { timeout: 90000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
      );
      const buf = fs.readFileSync(tmp);
      const st = await sharp(buf, { failOn: "none" }).grayscale().stats();
      const mean = st.channels[0].mean;
      if (!best || mean > best.mean) best = { mean, buf };
      if (mean >= 22) break; // 已足够亮
    } catch {
      /* 单个时间点失败则尝试下一个 */
    }
  }
  fs.rmSync(tmp, { force: true });
  if (!best) throw new Error("all frame attempts failed");
  await toWebp(best.buf, outPath);
  return true;
}

function nodeNoOf(node) {
  const m = node.name.match(/(?:图片|视频|音频)\s*(?:节点\s*)?(\d+)/);
  return m ? +m[1] : null;
}

const works = JSON.parse(fs.readFileSync(path.join(DATA, "works.json"), "utf8"));
const workIds = Object.keys(works).map(Number).filter((id) => {
  if (ONLY_WORKS) return ONLY_WORKS.has(id);
  if (!FORCE && state.works[id]?.status === "done") return false;
  return true;
});

const report = { works: 0, sections: 0, images: 0, frames: 0, covers: 0, fails: 0, noNodesCache: 0, badContent: 0, bytes: 0 };
const failSamples = [];
let tasksDone = 0;

console.log(`START workIds=${workIds.length} DL=${DL_CONC} FF=${FFMPEG_CONC} BUILD=${BUILD_CONC}`);

// 为单个作品构建下载计划（读 DB → 映射 → 优选 → tasks/media）
async function buildPlan(id) {
  return buildSem(async () => {
    const w = works[id];
    if (w.gone) return null;
    const nodes = loadCachedNodes(w.templateUuid);
    if (!nodes) { report.noNodesCache++; return null; }

    let content = "";
    try {
      const row = await db.prompt.findUnique({ where: { id }, select: { content: true } });
      content = row?.content || "";
    } catch {
      report.badContent++;
      return null;
    }
    if (!content.trim()) return null;

    const sections = parseSections(content);
    const { result: mapped } = mapSections(sections, nodes);

    const finalUrls = new Set();
    if (w.finalOutput) {
      if (Array.isArray(w.finalOutput)) w.finalOutput.forEach((u) => finalUrls.add(u));
      else finalUrls.add(String(w.finalOutput));
    }

    const workDir = path.join(UPLOAD_ROOT, String(id));
    const urlHash = (u) => crypto.createHash("sha1").update(u).digest("hex").slice(0, 16);
    const localPathFor = (kind, u) => {
      const file = path.join(workDir, `${kind}-${urlHash(u)}.webp`);
      return { file, localUrl: `/uploads/liblib/${id}/${path.basename(file)}` };
    };

    const candidates = [];
    const seenNodeUrl = new Set();
    let order = 0;
    for (const sec of sections) {
      const hit = mapped.get(sec.index);
      if (!hit) continue;
      const node = hit.node;
      if (node.kind === "audio") continue;
      node.urls.slice(0, URLS_PER_NODE).forEach((u) => {
        const key = node.nodeId + "|" + u;
        if (seenNodeUrl.has(key)) return;
        seenNodeUrl.add(key);
        candidates.push({ sec: sec.index, no: nodeNoOf(node), node, kind: node.kind, url: u, order: order++, final: finalUrls.has(u) });
      });
    }
    report.sections += mapped.size;

    const pickEven = (arr, cap) => {
      if (cap <= 0) return [];
      if (arr.length <= cap) return arr.slice();
      const out = [];
      for (let i = 0; i < cap; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (cap - 1))]);
      return out;
    };
    const imgsAll = candidates.filter((c) => c.kind === "image");
    const vidsAll = candidates.filter((c) => c.kind === "video");
    const finalPicks = candidates.filter((c) => c.final);
    const picked = new Map();
    for (const c of finalPicks) picked.set(c.order, c);
    for (const c of pickEven(imgsAll.filter((c) => !c.final), IMG_CAP - finalPicks.filter((c) => c.kind === "image").length))
      picked.set(c.order, c);
    for (const c of pickEven(vidsAll.filter((c) => !c.final), VID_CAP - finalPicks.filter((c) => c.kind === "video").length))
      picked.set(c.order, c);
    const selected = [...picked.values()].sort((a, b) => a.order - b.order);

    const tasks = [];
    const media = [];
    if (w.coverUrl) {
      tasks.push({ kind: "image", url: w.coverUrl, file: path.join(workDir, "cover.webp"), role: "cover" });
      media.push({ type: "image", role: "cover", url: `/uploads/liblib/${id}/cover.webp`, sourceUrl: w.coverUrl, alt: w.title });
    }
    for (const c of selected) {
      const { file, localUrl } = localPathFor(c.kind, c.url);
      tasks.push({ kind: c.kind === "video" ? "frame" : "image", url: c.url, file });
      media.push({
        type: "image",
        role: "node",
        url: localUrl,
        section: c.sec,
        nodeNo: c.no,
        nodeKind: c.kind,
        sourceUrl: c.url,
        alt: `${w.title}｜${c.node.name}${c.final ? "｜最终成品" : ""}`,
      });
    }
    return { id, w, tasks, media, imgN: selected.filter((c) => c.kind === "image").length, vidN: selected.filter((c) => c.kind === "video").length, mappedSections: mapped.size };
  });
}

function runTask(task) {
  const sem = task.kind === "frame" ? ffSem : imgSem;
  const t0 = Date.now();
  if (task.kind === "frame" && process.env.DEBUG_FRAMES) console.log("ff-start", task.url.slice(-40));
  return sem(async () => {
    try {
      if (task.kind === "frame") await screenshotVideo(task.url, task.file);
      else await downloadImage(task.url, task.file);
      if (task.role === "cover") report.covers++;
      else if (task.kind === "frame") report.frames++;
      else report.images++;
      report.bytes += fs.statSync(task.file).size;
      if (task.kind === "frame" && process.env.DEBUG_FRAMES) console.log("ff-ok", ((Date.now() - t0) / 1000).toFixed(1) + "s");
      return null;
    } catch (e) {
      if (task.kind === "frame" && process.env.DEBUG_FRAMES) console.log("ff-err", ((Date.now() - t0) / 1000).toFixed(1) + "s", e.message.slice(0, 150));
      return { url: task.url, error: e.message };
    } finally {
      tasksDone++;
      if (tasksDone % 200 === 0) {
        console.log(
          `tasks ${tasksDone} works=${report.works} imgs=${report.images} frames=${report.frames} covers=${report.covers} fails=${report.fails} mb=${(report.bytes / 1048576).toFixed(0)}`
        );
      }
    }
  });
}

async function finalizePlan(plan, errors) {
  const { id, w, tasks, media, mappedSections } = plan;
  const failedUrls = new Set(errors.map((e) => e.url));
  const finalMedia = media.filter((m) => !failedUrls.has(m.sourceUrl));
  const coverOk = w.coverUrl && !failedUrls.has(w.coverUrl);
  let status = "done";
  if (errors.length) {
    status = errors.length === tasks.length ? "failed" : "partial";
    report.fails += errors.length;
    if (failSamples.length < 25) failSamples.push({ id, errors: errors.slice(0, 3) });
  }
  state.works[id] = { status, at: Date.now(), mediaCount: finalMedia.length, mappedSections, errors: errors.slice(0, 10) };
  try {
    await db.prompt.update({
      where: { id },
      data: { media: finalMedia, ...(coverOk ? { coverUrl: `/uploads/liblib/${id}/cover.webp` } : {}) },
    });
    report.works++;
  } catch (e) {
    state.works[id].status = "dberror";
    state.works[id].dbError = e.message;
  }
}

if (DRY) {
  for (const id of workIds) {
    const plan = await buildPlan(id);
    if (!plan) continue;
    report.works++;
    report.images += plan.imgN;
    report.frames += plan.vidN;
    if (plan.w.coverUrl) report.covers++;
  }
  console.log("DRY RUN", report);
} else {
  let cursor = 0;
  let usedLimit = 0;
  while (cursor < workIds.length && usedLimit < LIMIT) {
    const slice = workIds.slice(cursor, cursor + CHUNK);
    cursor += CHUNK;
    const plans = (await Promise.all(slice.map(buildPlan))).filter(Boolean).slice(0, Math.max(0, LIMIT - usedLimit));
    usedLimit += plans.length;
    // 全 chunk 任务一次性投递给全局并发池（跨作品并行，消除单作品慢帧阻塞）
    const settled = await Promise.all(
      plans.map(async (plan) => {
        const errors = (await Promise.all(plan.tasks.map(runTask))).filter(Boolean);
        await finalizePlan(plan, errors);
      })
    );
    await Promise.all(settled);
    saveState();
    console.log(`chunk done at=${cursor} works=${report.works}`);
  }
  saveState();
  fs.writeFileSync(path.join(DATA, "import-fails.json"), JSON.stringify(failSamples, null, 1));
  console.log("DONE", report);
}
await db.$disconnect();
