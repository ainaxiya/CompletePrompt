import "server-only";

import { writeFile, mkdir } from "fs/promises";
import path from "path";

// 用户媒体上传的统一服务端核心：类型识别（magic-byte）→ 校验 → 落盘。
// /api/upload（单文件，前端批量时并发调用）复用本模块；头像/品牌图因处理逻辑不同走各自路由。

export type MediaKind = "jpg" | "png" | "webp" | "gif" | "mp4" | "webm";

export class UploadError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const IMAGE_MIME: Record<string, boolean> = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
  "image/gif": true,
};
const VIDEO_MIME: Record<string, boolean> = {
  "video/mp4": true,
  "video/webm": true,
  "video/quicktime": true,
};

const KIND_EXT: Record<MediaKind, string> = {
  jpg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
  mp4: ".mp4",
  webm: ".mp4", // .mov 与 mp4 同属 ftyp 系列，统一存 .mp4 可正常播放
};
const IMAGE_KINDS: MediaKind[] = ["jpg", "png", "webp", "gif"];
const VIDEO_KINDS: MediaKind[] = ["mp4", "webm"];

/** 通过文件头签名识别真实类型，绝不信任浏览器给的 Content-Type */
export function sniffKind(buf: Buffer): MediaKind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  const head6 = buf.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return "gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "webp";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "mp4";
  return null;
}

export type SavedMedia = { url: string; type: "image" | "video"; size: number };

/**
 * 校验并保存一个用户上传的图片/视频到 public/uploads/YYYY/MM/。
 * 任何校验失败抛 UploadError（含 HTTP 状态码与中文/英文信息）。
 */
export async function saveUserMedia(
  file: File,
  opts: { maxImageMB: number; maxVideoMB: number }
): Promise<SavedMedia> {
  const claimedImage = !!IMAGE_MIME[file.type];
  const claimedVideo = !!VIDEO_MIME[file.type];
  if (!claimedImage && !claimedVideo) {
    throw new UploadError(400, "unsupported type");
  }
  const limitMB = claimedImage ? opts.maxImageMB : opts.maxVideoMB;
  if (file.size < 12) throw new UploadError(400, "invalid file");
  if (file.size > limitMB * 1024 * 1024) {
    throw new UploadError(413, `file exceeds ${limitMB}MB`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffKind(bytes);
  if (!kind) throw new UploadError(400, "file content not recognized");
  const realIsImage = IMAGE_KINDS.includes(kind);
  const realIsVideo = VIDEO_KINDS.includes(kind);
  if (claimedImage && !realIsImage) throw new UploadError(400, "type mismatch");
  if (claimedVideo && !realIsVideo) throw new UploadError(400, "type mismatch");

  const now = new Date();
  const ym = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(process.cwd(), "public", "uploads", ym);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${KIND_EXT[kind]}`;
  await writeFile(path.join(dir, name), bytes);

  return {
    url: `/uploads/${ym}/${name}`,
    type: realIsImage ? "image" : "video",
    size: file.size,
  };
}
