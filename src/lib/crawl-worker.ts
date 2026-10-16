// 采集入库后台任务执行器（在 Next 进程内异步运行，PM2 常驻期间可靠；进度落 CrawlJob 表）
import { mkdirSync, existsSync, statSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

import { db } from "./db";
import { syncPromptToMeili } from "./meili";
import {
  LIBTV_HEADERS,
  fetchLibtvDetail,
  buildWorkPayload,
  type MediaPlanItem,
} from "./crawl-libtv";
import {
  JIMENG_HEADERS,
  buildJimengPayload,
  type JimengFeedItem,
  type MediaPlanItem as JimengMediaPlanItem,
} from "./crawl-jimeng";

const execFileP = promisify(execFile);
// 生产机 apt 安装在 /usr/bin/ffmpeg；可用环境变量覆盖
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "liblib");
const IMPORTER_USERNAME = "libtv";
const JIMENG_IMPORTER_USERNAME = "jimeng";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 根据数据源选择请求头
function headersFor(source: string) {
  if (source === "jimeng") return JIMENG_HEADERS;
  return LIBTV_HEADERS;
}

async function fetchRemoteBuf(url: string, source = "libtv", retry = 3): Promise<Buffer> {
  const h = headersFor(source);
  for (let i = 0; i < retry; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": h["User-Agent"], Referer: h.Referer, Origin: (h as any).Origin || h.Referer },
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === retry - 1) throw e;
      await sleep(1200 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

const urlHash = (u: string) => crypto.createHash("sha1").update(u).digest("hex").slice(0, 16);

async function ensureImporter(source: string) {
  const username = source === "jimeng" ? JIMENG_IMPORTER_USERNAME : IMPORTER_USERNAME;
  const nickname = source === "jimeng" ? "即梦AI 采集" : "LibTV 采集";
  const bio = source === "jimeng" ? "即梦AI 创作灵感社区自动采集账号" : "LibLib TV 官方作品自动采集账号";
  return db.user.upsert({
    where: { username },
    update: {},
    create: { username, nickname, bio, role: "importer" },
  });
}

// 下载并 webp 化单张图片，返回本地 URL；失败返回 false
async function downloadImage(url: string, filePath: string, source = "libtv"): Promise<boolean> {
  if (existsSync(filePath) && statSync(filePath).size > 0) return true;
  try {
    const buf = await fetchRemoteBuf(url, source);
    mkdirSync(path.dirname(filePath), { recursive: true });
    await sharp(buf, { failOn: "none" })
      .rotate()
      .resize({ width: 1280, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(filePath);
    return true;
  } catch {
    return false;
  }
}

// 远程视频截帧：多个时间点尝试（规避片头黑场淡入），取平均亮度最高的一帧，webp 化
// 移植自 scripts/liblib-import-media.mjs（ffmpeg 走 PATH，-referer 带防盗链）
async function screenshotVideo(url: string, outPath: string, source = "libtv"): Promise<boolean> {
  if (existsSync(outPath) && statSync(outPath).size > 0) return true;
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = outPath.replace(/\.webp$/, ".tmp.jpg");
  const h = headersFor(source);
  const tries = ["1", "3", "0.5"];
  let best: { mean: number; buf: Buffer } | null = null;
  for (const ss of tries) {
    try {
      await execFileP(
        FFMPEG_BIN,
        [
          "-nostdin",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          ss,
          "-referer",
          h.Referer,
          "-user_agent",
          h["User-Agent"],
          "-i",
          url,
          "-frames:v",
          "1",
          "-q:v",
          "4",
          "-vf",
          "scale=min(1280\\,iw):-2",
          tmp,
        ],
        { timeout: 90000, maxBuffer: 8 * 1024 * 1024 }
      );
      const buf = readFileSync(tmp);
      const st = await sharp(buf, { failOn: "none" }).grayscale().stats();
      if (!best || st.channels[0].mean > best.mean) best = { mean: st.channels[0].mean, buf };
      if (st.channels[0].mean >= 22) break; // 已足够亮，不再尝试更早点位
    } catch {
      /* 单个时间点失败则尝试下一个 */
    } finally {
      rmSync(tmp, { force: true });
    }
  }
  if (!best) return false;
  try {
    await sharp(best.buf, { failOn: "none" })
      .rotate()
      .resize({ width: 1280, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(outPath);
    return true;
  } catch {
    return false;
  }
}

// ─── LIBTV 单条入库 ───
async function importLibtvItem(itemId: number, importerId: number, adminId: number) {
  const item = await db.crawlItem.findUnique({ where: { id: itemId } });
  if (!item || item.status === "collected") return { skipped: true };
  if (!item.templateUuid) throw new Error("缺少 templateUuid");

  const detail = await fetchLibtvDetail(item.templateUuid);
  const payload = buildWorkPayload(detail);
  if (!payload.content.trim()) throw new Error("作品快照中没有可采集的节点");

  const sourceUrl = `https://www.liblib.tv/canvas?sourceProjectUuid=${item.remoteId}`;
  const prompt = await db.prompt.create({
    data: {
      userId: importerId,
      title: item.title,
      content: payload.content,
      type: payload.type,
      category: payload.category,
      language: "zh",
      tags: item.tags,
      sourceSite: "liblib.tv",
      sourceAuthor: item.author,
      sourceUrl,
      likeCount: item.likeCount,
      status: "published",
      publishedAt: item.remoteCreatedAt ?? null,
      adminAuthorId: adminId,
    },
  });

  const workDir = path.join(UPLOAD_ROOT, String(prompt.id));
  const media: any[] = [];
  let coverOk = false;
  if (payload.coverUrl) {
    const coverPath = path.join(workDir, "cover.webp");
    coverOk = await downloadImage(payload.coverUrl, coverPath);
    if (coverOk) {
      media.push({
        type: "image",
        role: "cover",
        url: `/uploads/liblib/${prompt.id}/cover.webp`,
        sourceUrl: payload.coverUrl,
        alt: item.title,
      });
    }
  }
  let imgOk = 0;
  let frameOk = 0;
  for (const m of payload.mediaPlan as MediaPlanItem[]) {
    const prefix = m.kind === "video" ? "frame" : "image";
    const file = path.join(workDir, `${prefix}-${urlHash(m.url)}.webp`);
    const ok = m.kind === "video" ? await screenshotVideo(m.url, file) : await downloadImage(m.url, file);
    if (!ok) continue;
    if (m.kind === "video") frameOk++;
    else imgOk++;
    media.push({
      type: "image",
      role: "node",
      url: `/uploads/liblib/${prompt.id}/${path.basename(file)}`,
      section: m.section,
      nodeKind: m.kind,
      sourceUrl: m.url,
      alt: m.alt,
    });
    await sleep(80);
  }

  await db.prompt.update({
    where: { id: prompt.id },
    data: { media, ...(coverOk ? { coverUrl: `/uploads/liblib/${prompt.id}/cover.webp` } : {}) },
  });
  await syncPromptToMeili({
    id: prompt.id,
    title: prompt.title,
    content: prompt.content,
    description: null,
    type: prompt.type,
    category: prompt.category,
    language: prompt.language,
    tags: prompt.tags,
    likeCount: prompt.likeCount,
    viewCount: 0,
    createdAt: prompt.createdAt,
    sourceAuthor: prompt.sourceAuthor,
    coverUrl: coverOk ? `/uploads/liblib/${prompt.id}/cover.webp` : null,
  });

  await db.crawlItem.update({
    where: { id: item.id },
    data: { status: "collected", error: null, kind: payload.type, promptId: prompt.id, collectedAt: new Date() },
  });
  return { promptId: prompt.id, mediaCount: media.length, imgOk, frameOk, coverOk };
}

// ─── 即梦 单条入库 ───
async function importJimengItem(itemId: number, importerId: number, adminId: number) {
  const item = await db.crawlItem.findUnique({ where: { id: itemId } });
  if (!item || item.status === "collected") return { skipped: true };

  // 即梦数据已在 fetch 阶段存好（title/coverUrl/tags/likeCount），直接用 CrawlItem 构建
  // tags 约定：[0] 提示词  [1] 模型名  [2] 作品形态 image|video  [3] 视频地址（仅视频）
  const tags = item.tags;
  const workType: "image" | "video" = tags[2] === "video" ? "video" : "image";
  const jimengItem: JimengFeedItem = {
    itemId: item.remoteId,
    title: item.title,
    coverUrl: item.coverUrl,
    coverWidth: 0,
    coverHeight: 0,
    authorName: item.author || "匿名用户",
    authorAvatar: null,
    prompt: tags[0] || "",
    modelName: tags[1] || "",
    imageUrl: null,
    imageWidth: 0,
    imageHeight: 0,
    workType,
    videoUrl: workType === "video" ? tags[3] || null : null,
    videoDurationMs: 0,
    likeCount: item.likeCount,
    usageCount: 0,
    createTime: item.remoteCreatedAt,
    updateTime: item.remoteUpdatedAt,
    effectType: workType === "video" ? 53 : 9,
  };

  const payload = buildJimengPayload(jimengItem);
  if (!payload.content.trim()) throw new Error("作品无可采集内容");

  const sourceUrl = `https://jimeng.jianying.com/ai-tool/work/${item.remoteId}`;
  const prompt = await db.prompt.create({
    data: {
      userId: importerId,
      title: item.title,
      content: payload.content,
      type: payload.type,
      category: payload.category,
      language: "zh",
      tags: item.tags.filter((_, i) => i >= 4), // 前 4 个是提示词/模型名/形态/视频地址
      sourceSite: "jimeng.jianying.com",
      sourceAuthor: item.author,
      sourceUrl,
      likeCount: item.likeCount,
      status: "published",
      publishedAt: item.remoteCreatedAt ?? null,
      adminAuthorId: adminId,
    },
  });

  const workDir = path.join(UPLOAD_ROOT, String(prompt.id));
  const media: any[] = [];
  let coverOk = false;
  if (payload.coverUrl) {
    const coverPath = path.join(workDir, "cover.webp");
    coverOk = await downloadImage(payload.coverUrl, coverPath, "jimeng");
    if (coverOk) {
      media.push({
        type: "image",
        role: "cover",
        url: `/uploads/liblib/${prompt.id}/cover.webp`,
        sourceUrl: payload.coverUrl,
        alt: item.title,
      });
    }
  }
  let imgOk = 0;
  let frameOk = 0;
  for (const m of payload.mediaPlan as JimengMediaPlanItem[]) {
    const prefix = m.kind === "video" ? "frame" : "image";
    const file = path.join(workDir, `${prefix}-${urlHash(m.url)}.webp`);
    const ok = m.kind === "video" ? await screenshotVideo(m.url, file, "jimeng") : await downloadImage(m.url, file, "jimeng");
    if (!ok) continue;
    if (m.kind === "video") frameOk++;
    else imgOk++;
    media.push({
      type: "image",
      role: "node",
      url: `/uploads/liblib/${prompt.id}/${path.basename(file)}`,
      section: m.section,
      nodeKind: m.kind,
      sourceUrl: m.url,
      alt: m.alt,
    });
    await sleep(80);
  }

  await db.prompt.update({
    where: { id: prompt.id },
    data: { media, ...(coverOk ? { coverUrl: `/uploads/liblib/${prompt.id}/cover.webp` } : {}) },
  });
  await syncPromptToMeili({
    id: prompt.id,
    title: prompt.title,
    content: prompt.content,
    description: null,
    type: prompt.type,
    category: prompt.category,
    language: prompt.language,
    tags: prompt.tags,
    likeCount: prompt.likeCount,
    viewCount: 0,
    createdAt: prompt.createdAt,
    sourceAuthor: prompt.sourceAuthor,
    coverUrl: coverOk ? `/uploads/liblib/${prompt.id}/cover.webp` : null,
  });

  await db.crawlItem.update({
    where: { id: item.id },
    data: { status: "collected", error: null, kind: payload.type, promptId: prompt.id, collectedAt: new Date() },
  });
  return { promptId: prompt.id, mediaCount: media.length, imgOk, frameOk, coverOk };
}

export async function runCrawlJob(jobId: number) {
  const job = await db.crawlJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  let succeeded = 0;
  let failed = 0;
  const importFn = job.source === "jimeng" ? importJimengItem : importLibtvItem;
  try {
    const importer = await ensureImporter(job.source);
    for (const itemId of job.itemIds) {
      try {
        const r = await importFn(itemId, importer.id, job.adminId);
        if (!("skipped" in r)) succeeded++;
      } catch (e: any) {
        failed++;
        const msg = String(e?.message || e).slice(0, 300);
        await db.crawlItem.update({ where: { id: itemId }, data: { status: "failed", error: msg } }).catch(() => {});
        // 进度区只显示最后一条失败
        const it = await db.crawlItem.findUnique({ where: { id: itemId }, select: { title: true } }).catch(() => null);
        const lastError = `${it?.title ? `《${it.title}》：` : ""}${msg}`.slice(0, 300);
        const done = succeeded + failed;
        await db.crawlJob.update({
          where: { id: jobId },
          data: { done, succeeded, failed, lastError },
        });
        continue;
      }
      const done = succeeded + failed;
      await db.crawlJob.update({
        where: { id: jobId },
        data: { done, succeeded, failed },
      });
    }
    await db.crawlJob.update({
      where: { id: jobId },
      data: { status: "done", finishedAt: new Date(), message: failed ? `${failed} 条失败，可在失败列表重试` : null },
    });
  } catch (e: any) {
    await db.crawlJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        finishedAt: new Date(),
        message: "任务异常中断：" + String(e?.message || e).slice(0, 300),
        done: succeeded + failed,
        succeeded,
        failed: failed + 1,
      },
    });
  }
}

// 回收长时间卡死的 running 任务（PM2 重启等场景），返回清理数量
export async function reapStaleJobs(maxAgeMs = 45 * 60_000): Promise<number> {
  const r = await db.crawlJob.updateMany({
    where: { status: "running", createdAt: { lt: new Date(Date.now() - maxAgeMs) } },
    data: { status: "done", finishedAt: new Date(), message: "任务超时（可能因服务重启中断）" },
  });
  return r.count;
}

// 触发但不等待（API 路由调用后立即返回 jobId）
export function startCrawlJobInBackground(jobId: number) {
  void runCrawlJob(jobId).catch((e) => console.error("crawl job crashed:", e));
}
