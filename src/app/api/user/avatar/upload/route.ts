import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// 简单文件头校验
function sniffImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return true;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // GIF
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")
    return true;
  // WEBP
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return true;
  return false;
}

// POST /api/user/avatar/upload  用户头像上传
// FormData: file=<File>  → sharp 压缩为 webp，保存到 public/uploads/avatars/
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "文件过大（最大 5MB）" }, { status: 413 });
    }
    if (file.size < 12) {
      return NextResponse.json({ error: "invalid file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!sniffImage(buf)) {
      return NextResponse.json({ error: "unsupported file type, only image allowed" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(dir, { recursive: true });

    // sharp 压缩：resize 到 256x256 内（保持比例，cover 裁切），输出 webp
    const name = `${user.id}-${Date.now()}.webp`;
    const processed = await sharp(buf)
      .resize(256, 256, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();

    await writeFile(path.join(dir, name), processed);

    const url = `/uploads/avatars/${name}`;

    // 更新用户 avatar 字段
    await db.user.update({
      where: { id: user.id },
      data: { avatar: url },
    });

    return NextResponse.json({ url, type: "image", size: processed.length });
  } catch (e) {
    console.error("[avatar/upload] failed:", e);
    return NextResponse.json({ error: "图片处理失败，请更换图片后重试" }, { status: 500 });
  }
}
