// 即梦AI (jimeng.jianying.com) 采集核心：feed 拉取 / 作品解析 / 内容与媒体计划构建
// 即梦作品为单作品单提示词（图片/视频两种形态），API 通过 JSONP 公开访问

export const JIMENG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Referer: "https://jimeng.jianying.com/ai-tool/explore",
  Origin: "https://jimeng.jianying.com",
} as const;

const EXPLORE_URL = "https://jimeng.jianying.com/jsonp/mweb/v1/get_explore";
const CATEGORY_LIST_URL = "https://jimeng.jianying.com/mweb/v1/get_explore_category_list";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 即梦 feed 单条作品 ───
export interface JimengFeedItem {
  itemId: string; // common_attr.id
  title: string;
  coverUrl: string | null;
  coverWidth: number;
  coverHeight: number;
  authorName: string;
  authorAvatar: string | null;
  prompt: string; // AI 提示词
  modelName: string; // 模型名称
  imageUrl: string | null; // 大图 URL（图片作品）
  imageWidth: number;
  imageHeight: number;
  workType: "image" | "video"; // 作品形态：图片 / 视频
  videoUrl: string | null; // 视频播放地址（仅视频作品，带短时效签名）
  videoDurationMs: number; // 视频时长（毫秒，仅视频作品）
  likeCount: number;
  usageCount: number;
  createTime: Date | null;
  updateTime: Date | null;
  effectType: number; // 9=图片, 53=视频
}

// 解析 JSONP 响应中的 JSON 数据
function parseJsonp(text: string): any {
  const start = text.indexOf("= ") + 2;
  const end = text.lastIndexOf(";(function");
  if (start < 2 || end < 0) throw new Error("JSONP 解析失败");
  return JSON.parse(text.substring(start, end));
}

// 从 common_attr 解析单条作品
function parseItem(raw: any): JimengFeedItem | null {
  const attr = raw?.common_attr;
  if (!attr?.id) return null;

  const effectType = Number(attr.effect_type) || 9;
  const isVideo = effectType === 53 && !!raw?.video;

  // 图片作品：提示词在 text2image_params；视频作品：提示词在 text2video_params.video_gen_inputs.prompt
  const t2i = raw?.aigc_image_params?.text2image_params;
  const t2v = raw?.aigc_image_params?.text2video_params;
  const largeImg = raw?.image?.large_images;
  const videoInfo = raw?.video;

  let prompt = "";
  let modelName = "";
  if (isVideo) {
    prompt = t2v?.video_gen_inputs?.prompt ? String(t2v.video_gen_inputs.prompt).trim() : "";
    modelName = t2v?.model_config?.model_name ? String(t2v.model_config.model_name) : "";
  } else {
    prompt = t2i?.prompt ? String(t2i.prompt).trim() : "";
    modelName = t2i?.model_config?.model_name ? String(t2i.model_config.model_name) : "";
  }

  // 视频地址：transcoded_video.origin.video_url（短时效签名，入库时可能已过期，仅用于截帧）
  const videoUrl = isVideo ? videoInfo?.transcoded_video?.origin?.video_url || null : null;
  const videoDurationMs = isVideo ? Number(videoInfo?.duration_ms) || 0 : 0;

  return {
    itemId: String(attr.id),
    title: String(attr.title || "").slice(0, 200),
    coverUrl: attr.cover_url || null,
    coverWidth: Number(attr.cover_width) || 0,
    coverHeight: Number(attr.cover_height) || 0,
    authorName: raw?.author?.name ? String(raw.author.name).slice(0, 80) : "匿名用户",
    authorAvatar: raw?.author?.avatar_url || null,
    prompt,
    modelName,
    imageUrl: largeImg?.image_url || null,
    imageWidth: Number(largeImg?.width) || 0,
    imageHeight: Number(largeImg?.height) || 0,
    workType: isVideo ? "video" : "image",
    videoUrl,
    videoDurationMs,
    likeCount: Number(raw?.statistic?.favorite_num) || 0,
    usageCount: Number(raw?.statistic?.usage_num) || 0,
    createTime: attr.create_time ? new Date(Number(attr.create_time) * 1000) : null,
    updateTime: attr.update_time ? new Date(Number(attr.update_time) * 1000) : null,
    effectType,
  };
}

// 拉取 explore feed 一页
async function fetchExplorePage(
  offset: number,
  count: number,
  retry = 3
): Promise<{ items: JimengFeedItem[]; hasMore: boolean }> {
  const imageInfo = JSON.stringify({ width: 2048, height: 2048, format: "webp", image_scene_list: [] });
  const filter = JSON.stringify({ work_type_list: ["video", "image", "canvas"] });

  const params = new URLSearchParams({
    category_id: "11222",
    offset: String(offset),
    count: String(count),
    image_info: imageInfo,
    feed_refer: "feed_enterauto",
    filter,
    _callback: "crawl",
  });

  for (let i = 0; i < retry; i++) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(`${EXPLORE_URL}?${params}`, {
        headers: JIMENG_HEADERS,
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (r.status === 429) {
        await sleep(3000 * (i + 1));
        continue;
      }
      const text = await r.text();
      const json = parseJsonp(text);
      if (json.ret !== "0") throw new Error(`API 返回错误: ${json.errmsg || json.ret}`);

      const rawList = json.data?.item_list || [];
      const items: JimengFeedItem[] = [];
      for (const raw of rawList) {
        const item = parseItem(raw);
        if (item) items.push(item);
      }
      return { items, hasMore: !!json.data?.has_more };
    } catch (e) {
      clearTimeout(tm);
      if (i === retry - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error("feed request failed");
}

// 拉取即梦 explore feed（offset 分页，每页 20 条，页间隔 300ms）
export async function fetchJimengFeed(
  pages: number,
  onItem?: (it: JimengFeedItem) => void
): Promise<{ items: JimengFeedItem[]; hasMore: boolean }> {
  const seen = new Set<string>();
  const out: JimengFeedItem[] = [];
  let hasMore = true;
  const pageSize = 20;

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    const data = await fetchExplorePage(offset, pageSize);
    for (const it of data.items) {
      if (!it.itemId || seen.has(it.itemId)) continue;
      seen.add(it.itemId);
      out.push(it);
      onItem?.(it);
    }
    hasMore = data.hasMore;
    if (!data.hasMore) break;
    if (page < pages - 1) await sleep(300);
  }
  return { items: out, hasMore };
}

// ─── 探测作品是否可采（有提示词即可采） ───
export type ProbeVerdict = "ok" | "empty" | "error";
export function probeJimengItem(item: JimengFeedItem): { verdict: ProbeVerdict; message?: string } {
  if (!item.prompt.trim()) return { verdict: "empty", message: "作品无提示词" };
  if (item.workType === "video") {
    if (!item.coverUrl && !item.videoUrl) return { verdict: "empty", message: "视频作品无封面/视频地址" };
  } else {
    if (!item.coverUrl && !item.imageUrl) return { verdict: "empty", message: "作品无图片" };
  }
  return { verdict: "ok" };
}

// 并发探测，剔除不可采作品
export interface FilterResult {
  collectable: JimengFeedItem[];
  emptyItems: JimengFeedItem[];
  probeErrors: number;
}

export function filterCollectableJimengItems(items: JimengFeedItem[]): FilterResult {
  const collectable: JimengFeedItem[] = [];
  const emptyItems: JimengFeedItem[] = [];
  for (const it of items) {
    const { verdict } = probeJimengItem(it);
    if (verdict === "empty") emptyItems.push(it);
    else collectable.push(it);
  }
  return { collectable, emptyItems, probeErrors: 0 };
}

// ─── 构建入库内容与媒体计划 ───
export interface MediaPlanItem {
  section: number;
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

export function buildJimengPayload(item: JimengFeedItem): WorkPayload {
  // 即梦作品 = 单作品单提示词（图片 / 视频）
  const isVideo = item.workType === "video";
  const lines: string[] = [];
  const title = item.title || "即梦AI作品";
  lines.push(`[1] ${isVideo ? "视频生成" : "图片生成"}｜｜${title}`);
  if (item.prompt) lines.push(`中文提示词：\n${item.prompt}`);
  if (item.modelName) lines.push(`模型：${item.modelName}`);

  const mediaPlan: MediaPlanItem[] = [];
  if (isVideo) {
    // 视频作品：视频地址（截帧用，短时效签名） + 封面首帧图
    if (item.videoUrl) {
      mediaPlan.push({ section: 1, kind: "video", url: item.videoUrl, final: true, alt: title });
    }
    if (item.coverUrl) {
      mediaPlan.push({ section: 1, kind: "image", url: item.coverUrl, final: false, alt: `${title} 首帧` });
    }
  } else {
    // 图片作品：大图（优先）或封面
    const imgSrc = item.imageUrl || item.coverUrl;
    if (imgSrc) {
      mediaPlan.push({ section: 1, kind: "image", url: imgSrc, final: true, alt: title });
    }
  }

  return {
    content: lines.join("\n\n"),
    type: isVideo ? "video" : "image",
    category: isVideo ? "视频创作" : "图片创作",
    coverUrl: item.coverUrl,
    mediaPlan,
    imageNodeCount: isVideo ? 0 : 1,
    videoNodeCount: isVideo ? 1 : 0,
  };
}
