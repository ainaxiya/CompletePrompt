// 黑帧修复：扫描 DB 中 nodeKind=video 的本地截帧，亮度不足则多时间点重截
// 用法：node scripts/liblib-fix-darkframes.mjs [--id 160]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, "..", "public");
const FFMPEG = "C:\\Users\\ainax\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffmpeg.exe";
const DARK_MEAN = 20;
const args = process.argv.slice(2);
const ONLY = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;

const db = new PrismaClient();

process.on("uncaughtException", (e) => {
  try {
    fs.writeFileSync(path.join(__dirname, "..", "data", "liblib", "fix-darkframes-result.json"),
      JSON.stringify({ fatal: e.message, stack: e.stack }, null, 1), "utf8");
  } catch {}
  process.exit(1);
});

function semaphore(max) {
  let active = 0;
  const q = [];
  const next = () => { if (active < max && q.length) { active++; q.shift()(); } };
  return (fn) =>
    new Promise((res, rej) => {
      q.push(() => fn().then(res, rej).finally(() => { active--; next(); }));
      next();
    });
}
const sem = semaphore(3);

async function brightness(buf) {
  const st = await sharp(buf, { failOn: "none" }).grayscale().stats();
  return st.channels[0].mean;
}

async function recapture(url, outFile) {
  const tmp = outFile.replace(/\.webp$/, ".fix.jpg");
  let best = null;
  for (const ss of ["3", "0.5", "2", "5"]) {
    try {
      await execFileP(
        FFMPEG,
        ["-nostdin", "-loglevel", "error", "-y", "-ss", ss, "-i", url, "-frames:v", "1", "-q:v", "4", "-vf", "scale=min(1280\\,iw):-2", tmp],
        { timeout: 90000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
      );
      const buf = fs.readFileSync(tmp);
      const mean = await brightness(buf);
      if (!best || mean > best.mean) best = { mean, buf };
      if (mean >= 22) break;
    } catch {}
  }
  fs.rmSync(tmp, { force: true });
  if (!best) throw new Error("recapture failed");
  await sharp(best.buf, { failOn: "none" })
    .rotate()
    .resize({ width: 1280, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(outFile);
  return best.mean;
}

// Use findUnique one-by-one to avoid Prisma findMany rust String error on some rows
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "liblib", "import-state.json"), "utf8"));
const doneIds = Object.keys(state.works).filter(id => state.works[id].status === "done");
const all = [];
for (const idStr of doneIds) {
  try {
    const p = await db.prompt.findUnique({ where: { id: Number(idStr) }, select: { id: true, media: true } });
    if (p) all.push(p);
  } catch {}
}

let scanned = 0, dark = 0, fixed = 0, failed = 0;
const failIds = [];
const jobs = [];
for (const p of all) {
  if (!p || !Array.isArray(p.media)) continue;
  const vids = p.media.filter((m) => m.role === "node" && m.nodeKind === "video" && m.url?.startsWith("/uploads/liblib/"));
  for (const m of vids) {
    jobs.push({ p, m });
  }
}

// 心跳进度文件（供进度面板读取）
const PROG_FILE = path.join(__dirname, "..", "data", "liblib", "fix-darkframes-progress.json");
const TOTAL_JOBS = jobs.length;
let activeJobs = 0;
function writeHeartbeat() {
  fs.writeFileSync(PROG_FILE, JSON.stringify({
    taskName: "darkframe-fix",
    total: TOTAL_JOBS,
    done: scanned,
    activeThreads: activeJobs,
    threadLabel: "scan/ffmpeg",
    startTime,
    extra: `dark=${dark} fixed=${fixed} failed=${failed}`,
  }), "utf8");
}
const startTime = new Date().toISOString();
writeHeartbeat();

await Promise.all(
  jobs.map(({ p, m }) =>
    sem(async () => {
      activeJobs++;
      try {
        const fp = path.join(PUB, m.url);
        if (!fs.existsSync(fp)) {
          // 上次运行在"先删后截"中途被杀：文件缺失，直接进入重截补齐
        } else {
          scanned++;
          if (scanned % 50 === 0) writeHeartbeat();
          let mean;
          try {
            mean = await brightness(fs.readFileSync(fp));
          } catch {
            return;
          }
          if (mean >= DARK_MEAN && fs.statSync(fp).size >= 1500) return;
        }
        dark++;
        writeHeartbeat();
        try {
          fs.rmSync(fp, { force: true });
          const newMean = await recapture(m.sourceUrl, fp);
          if (newMean < DARK_MEAN) {
            // 视频本身整体偏暗（夜景内容），保留最亮帧即可
          }
          fixed++;
          writeHeartbeat();
          if (fixed % 50 === 0) console.log(`fixed ${fixed}/${dark} scanned=${scanned}`);
        } catch (e) {
          failed++;
          writeHeartbeat();
          if (failIds.length < 20) failIds.push({ id: p.id, url: m.url, err: e.message.slice(0, 80) });
        }
      } finally {
        activeJobs--;
      }
    })
  )
);

const result = { scanned, dark, fixed, failed, failIds };
const outStr = JSON.stringify(result, null, 1);
console.log(outStr);
fs.writeFileSync(path.join(__dirname, "..", "data", "liblib", "fix-darkframes-result.json"), outStr, "utf8");
fs.writeFileSync(PROG_FILE, JSON.stringify({
  taskName: "darkframe-fix",
  total: TOTAL_JOBS,
  done: TOTAL_JOBS,
  activeThreads: 0,
  threadLabel: "scan/ffmpeg",
  startTime,
  extra: `DONE dark=${dark} fixed=${fixed} failed=${failed}`,
}), "utf8");
await db.$disconnect();
