// LibLib TV 采集核心：feed 流拉取 / template detail / 节点提取 / 内容与媒体计划构建
// 仅依赖全局 fetch 与（入库阶段的）sharp；视频截帧依赖 ffmpeg，服务器无 ffmpeg 时跳过视频媒体

export const LIBTV_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "x-language": "zh",
  Origin: "https://www.liblib.tv",
  Referer: "https://www.liblib.tv/",
} as const;

const FEED_URL = "https://api.liblib.tv/api/community/project/template/feed/stream";
const DETAIL_URL = "https://api.liblib.tv/api/community/project/template/detail";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 远端时间格式："2026年09月22日 17:07" ───
export function parseCnDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{4})年(\d{2})月(\d{2})日\s*(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── feed 流单页 ───
export interface LibtvFeedItem {
  templateUuid: string;
  projectUuid: string;
  name: string;
  description?: string | null;
  coverUrl?: string | null;
  finalOutput?: string | string[] | null;
  nickname?: string | null;
  likeCount?: number;
  tags?: { tagLabel?: string }[] | null;
  createAt?: string | null;
  updateAt?: string | null;
  publishAt?: string | null;
}

async function postFeedPage(page: number, tagId: number | null, retry = 4): Promise<{ list: LibtvFeedItem[]; hasMore: boolean }> {
  for (let i = 0; i < retry; i++) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(FEED_URL, {
        method: "POST",
        headers: { ...LIBTV_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          pageSize: 20,
          requestId: `adm-${tagId ?? "hot"}-${page}-${Math.random().toString(36).slice(2, 8)}`,
          tagId,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (r.status === 429) {
        await sleep(3000 * (i + 1));
        continue;
      }
      const j = await r.json();
      if (j.code === 0) return { list: j.data?.list || [], hasMore: !!j.data?.hasMore };
      await sleep(1500 * (i + 1));
    } catch (e) {
      clearTimeout(tm);
      if (i === retry - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error("feed request failed");
}

// 拉取热门流前 pages 页（每页 20 条，页间隔 250ms）
export async function fetchLibtvFeed(pages: number, onItem?: (it: LibtvFeedItem) => void): Promise<{ items: LibtvFeedItem[]; hasMore: boolean }> {
  const seen = new Set<string>();
  const out: LibtvFeedItem[] = [];
  let hasMore = true;
  for (let page = 1; page <= pages; page++) {
    const data = await postFeedPage(page, null);
    for (const it of data.list) {
      if (!it?.projectUuid || seen.has(it.projectUuid)) continue;
      seen.add(it.projectUuid);
      out.push(it);
      onItem?.(it);
    }
    hasMore = data.hasMore;
    if (!data.hasMore) break;
    if (page < pages) await sleep(250);
  }
  return { items: out, hasMore };
}

// ─── 作品详情（含 snapshotData） ───
export async function fetchLibtvDetail(templateUuid: string, retry = 4): Promise<any> {
  for (let i = 0; i < retry; i++) {
    try {
      const r = await fetch(`${DETAIL_URL}?projectTemplateUuid=${encodeURIComponent(templateUuid)}`, {
        headers: LIBTV_HEADERS,
        signal: AbortSignal.timeout(30000),
      });
      const j = await r.json();
      if (j.code === 0) return j.data.detail as any;
      if (j.code === 10051) throw new Error("作品已被作者删除或设为私有");
      await sleep(1200 * (i + 1));
    } catch (e) {
      if (i === retry - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error("detail request failed");
}

// ─── 从 snapshotData 提取有媒体产物的节点（移植自 scripts/liblib-map.mjs） ───
function safeParse(v: any): any {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export interface LibtvNode {
  nodeId: string;
  kind: string;
  name: string;
  urls: string[];
  prompt: string;
}

export function extractNodes(snapshotData: any): LibtvNode[] {
  const snap = typeof snapshotData === "string" ? JSON.parse(snapshotData) : snapshotData;
  const out: LibtvNode[] = [];
  for (const n of snap?.nodes || []) {
    const d = n.data || {};
    const urls = Array.isArray(d.url) ? d.url.filter(Boolean) : [];
    if (urls.length === 0) continue;
    const params = safeParse(d.params) || {};
    out.push({
      nodeId: String(n.id),
      kind: String(n.type || ""),
      name: String(d.name || "").trim(),
      urls,
      prompt: typeof params.prompt === "string" ? params.prompt : "",
    });
  }
  return out;
}

// ─── 探测作品画布是否公开可采 ───
// 返回：ok=有媒体节点可采；empty=画布未公开（跳过不采集）；error=探测失败（保守保留，入库时再判）
export type ProbeVerdict = "ok" | "empty" | "error";
export async function probeTemplate(templateUuid: string): Promise<{ verdict: ProbeVerdict; message?: string }> {
  try {
    const detail = await fetchLibtvDetail(templateUuid);
    return extractNodes(detail.snapshotData).length > 0 ? { verdict: "ok" } : { verdict: "empty" };
  } catch (e: any) {
    const msg = String(e?.message || e);
    // 作品删除/私有：等同不可采
    if (/删除|私有|不存在|10051/.test(msg)) return { verdict: "empty", message: msg.slice(0, 100) };
    return { verdict: "error", message: msg.slice(0, 100) };
  }
}

export interface FilterResult {
  collectable: LibtvFeedItem[];
  emptyItems: LibtvFeedItem[]; // 未公开画布（不采集）
  probeErrors: number; // 探测失败（保守当作可采保留）
}

// 并发探测 feed 列表，剔除未公开提示词画布的作品
export async function filterCollectableItems(items: LibtvFeedItem[], concurrency = 5): Promise<FilterResult> {
  const queue = items.slice();
  const collectable: LibtvFeedItem[] = [];
  const emptyItems: LibtvFeedItem[] = [];
  let probeErrors = 0;
  async function worker() {
    while (queue.length) {
      const it = queue.shift()!;
      if (!it.templateUuid) {
        emptyItems.push(it);
        continue;
      }
      const { verdict } = await probeTemplate(it.templateUuid);
      if (verdict === "empty") emptyItems.push(it);
      else {
        if (verdict === "error") probeErrors++;
        collectable.push(it);
      }
      await sleep(150); // 温和限速，规避 429
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  // 保持 feed 原顺序
  const order = new Map(items.map((it, i) => [it.projectUuid, i]));
  collectable.sort((a, b) => (order.get(a.projectUuid) || 0) - (order.get(b.projectUuid) || 0));
  return { collectable, emptyItems, probeErrors };
}

// ─── 构建入库内容与媒体下载计划 ───
export interface MediaPlanItem {
  section: number; // 对应正文 [N]
  kind: string;
  url: string;
  final: boolean;
  alt: string;
}

export interface WorkPayload {
  content: string;
  type: "image" | "video" | "audio" | "text";
  category: string;
  coverUrl: string | null;
  mediaPlan: MediaPlanItem[];
  imageNodeCount: number;
  videoNodeCount: number;
}

const KIND_HEAD: Record<string, string> = {
  image: "图片生成",
  video: "视频生成",
  audio: "音频生成",
  text: "文本",
};
const KIND_CATEGORY: Record<string, string> = {
  image: "图片创作",
  video: "视频创作",
  audio: "音频创作",
  text: "其他",
};
const IMG_CAP = 12; // 每作品图片节点下载上限
const VID_CAP = 6; // 每作品视频节点截帧上限
const URLS_PER_NODE = 1; // 每节点取 1 张，控制总体量

function evenPick<T>(arr: T[], cap: number): T[] {
  if (cap <= 0) return [];
  if (arr.length <= cap) return arr.slice();
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (cap - 1))]);
  return out;
}

export function buildWorkPayload(detail: any): WorkPayload {
  const nodes = extractNodes(detail.snapshotData);
  const title = String(detail.name || "").slice(0, 200);
  const finalSet = new Set<string>();
  const fo = detail.finalOutput;
  if (Array.isArray(fo)) fo.forEach((u) => finalSet.add(String(u)));
  else if (fo) finalSet.add(String(fo));

  // 正文分节（仅媒体节点）
  const sections: { n: LibtvNode; index: number }[] = [];
  const lines: string[] = [];
  nodes.forEach((n, i) => {
    const index = i + 1;
    sections.push({ n, index });
    const head = KIND_HEAD[n.kind] || "图片生成";
    const name = n.name || `${n.kind === "video" ? "视频节点" : "图片节点"} ${index}`;
    lines.push(`[${index}] ${head}｜｜${name}`);
    if (n.prompt.trim()) lines.push(`中文提示词：\n${n.prompt.trim()}`);
  });
  const content = lines.join("\n\n");

  // 媒体候选：图片节点直取图，视频节点走 ffmpeg 截帧（服务器需装 ffmpeg）
  const candidates: MediaPlanItem[] = [];
  for (const { n, index } of sections) {
    if (n.kind !== "image" && n.kind !== "video") continue;
    n.urls.slice(0, URLS_PER_NODE).forEach((url) => {
      candidates.push({ section: index, kind: n.kind, url, final: finalSet.has(url), alt: `${title}｜${n.name}${finalSet.has(url) ? "｜最终成品" : ""}` });
    });
  }
  // 最终成品全部优先，其余按类型均匀抽取
  const finalPicks = candidates.filter((c) => c.final);
  const imgRest = evenPick(
    candidates.filter((c) => c.kind === "image" && !c.final),
    IMG_CAP - finalPicks.filter((c) => c.kind === "image").length
  );
  const vidRest = evenPick(
    candidates.filter((c) => c.kind === "video" && !c.final),
    VID_CAP - finalPicks.filter((c) => c.kind === "video").length
  );
  const mediaPlan = [...finalPicks, ...imgRest, ...vidRest].sort((a, b) => a.section - b.section);

  const typeCount: Record<string, number> = {};
  for (const n of nodes) typeCount[n.kind] = (typeCount[n.kind] || 0) + 1;
  const type = (["video", "image", "audio", "text"].find((k) => (typeCount[k] || 0) > 0) || "text") as WorkPayload["type"];

  return {
    content,
    type,
    category: KIND_CATEGORY[type] || "其他",
    coverUrl: detail.coverUrl ? String(detail.coverUrl) : null,
    mediaPlan,
    imageNodeCount: typeCount.image || 0,
    videoNodeCount: typeCount.video || 0,
  };
}
