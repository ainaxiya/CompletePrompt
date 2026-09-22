// 纯函数模块（前后端通用）：媒体项规范化与外链识别

export type MediaType = "image" | "video" | "embed";
export interface MediaItem {
  type: MediaType;
  url: string;
  poster?: string;
  /** 媒体角色：cover=作品封面，node=画布节点产物 */
  role?: "cover" | "node";
  /** 所属提示词分段序号（对应正文中的 [N]），未绑定分段的节点图在顶部画廊展示 */
  section?: number;
  /** 画布节点编号（对应正文中的「图片节点 12 / 视频节点 3」） */
  nodeNo?: number;
  /** 节点媒体的原始类型（视频节点只保存截图时，用 image 展示并标记来源为 video） */
  nodeKind?: "image" | "video";
  /** 原始资源地址（溯源用） */
  sourceUrl?: string;
  alt?: string;
}

const IMG_RE = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;
const VID_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export function normalizeEmbed(rawUrl: string): MediaItem | null {
  const url = rawUrl.trim();
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;

  // YouTube
  if (host.endsWith("youtube.com") || host === "youtu.be") {
    let id = "";
    if (host === "youtu.be") id = path.slice(1).split("/")[0];
    else if (path === "/watch") id = u.searchParams.get("v") || "";
    else if (path.startsWith("/embed/") || path.startsWith("/shorts/"))
      id = path.split("/")[2] || "";
    if (id) {
      return { type: "embed", url: `https://www.youtube.com/embed/${id}` };
    }
  }
  // Bilibili
  if (host.endsWith("bilibili.com")) {
    const bv = path.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    if (bv) {
      const p = u.searchParams.get("p");
      return {
        type: "embed",
        url: `https://player.bilibili.com/player.html?bvid=${bv}${p ? `&page=${p}` : ""}&autoplay=0`,
      };
    }
  }
  return null;
}

// 用户粘贴的链接：按扩展名 / 平台识别为 image / video / embed
export function mediaFromUrl(rawUrl: string): MediaItem | null {
  const url = rawUrl.trim();
  if (!url) return null;
  const embed = normalizeEmbed(url);
  if (embed) return embed;
  if (IMG_RE.test(url)) return { type: "image", url };
  if (VID_RE.test(url)) return { type: "video", url };
  return null;
}
