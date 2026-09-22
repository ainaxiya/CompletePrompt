import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const VIDEO_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

// 真实文件头签名（不能信任浏览器提供的 Content-Type）
function sniffKind(buf: Buffer): "jpg" | "png" | "webp" | "gif" | "mp4" | "webm" | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  // GIF: GIF87a / GIF89a
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")
    return "gif";
  // WEBP: RIFF????WEBP
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "webp";
  // WebM/MKV: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  // MP4/MOV: 偏移 4 处为 "ftyp"
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "mp4";
  return null;
}

const SNIFF_TO_EXT: Record<string, string> = {
  jpg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
  mp4: ".mp4",
  webm: ".webm", // .mov 与 mp4 同属 ftyp 系列，统一存 .mp4 亦可播放
};

// POST /api/upload  multipart: file
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 上传限流：每 IP 每分钟 30 次
  if (!rateLimit(`upload:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const settings = await getSettings();
  if (!settings.publish.allowUpload) {
    return NextResponse.json({ error: "upload disabled" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }

  const claimedImage = !!IMAGE_EXT[file.type];
  const claimedVideo = !!VIDEO_EXT[file.type];
  if (!claimedImage && !claimedVideo) {
    return NextResponse.json({ error: "unsupported type" }, { status: 400 });
  }
  const limitMB = claimedImage ? settings.publish.maxImageMB : settings.publish.maxVideoMB;
  if (file.size > limitMB * 1024 * 1024) {
    return NextResponse.json({ error: `file exceeds ${limitMB}MB` }, { status: 413 });
  }
  if (file.size < 12) {
    return NextResponse.json({ error: "invalid file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // 文件头签名必须与声称的大类一致
  const kind = sniffKind(bytes);
  if (!kind) return NextResponse.json({ error: "file content not recognized" }, { status: 400 });
  const realIsImage = ["jpg", "png", "webp", "gif"].includes(kind);
  const realIsVideo = ["mp4", "webm"].includes(kind);
  if (claimedImage && !realIsImage) return NextResponse.json({ error: "type mismatch" }, { status: 400 });
  if (claimedVideo && !realIsVideo) return NextResponse.json({ error: "type mismatch" }, { status: 400 });

  const ext = SNIFF_TO_EXT[kind] || ".bin";
  const now = new Date();
  const ym = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(process.cwd(), "public", "uploads", ym);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  await writeFile(path.join(dir, name), bytes);

  const url = `/uploads/${ym}/${name}`;
  return NextResponse.json({ url, type: realIsImage ? "image" : "video", size: file.size });
}
