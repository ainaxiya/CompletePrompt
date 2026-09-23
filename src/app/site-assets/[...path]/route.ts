import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// 品牌图标动态服务：
// Next.js 只对外提供 build 时已存在于 public/ 的静态文件，运行时上传的文件直接 404。
// 因此后台上传的 LOGO/favicon/appIcon 不依赖 public 静态服务，而由本路由从磁盘读取返回。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 与上传接口 ALLOWED_FILES 的 key 一致（固定白名单，防任意文件读取）
const ALLOWED_NAMES = new Set(["logo-icon-120.png", "favicon.ico", "app-icon.png"]);
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const parts = (await params).path || [];
  // 只接受单层文件名，禁止子目录与路径穿越
  if (parts.length !== 1 || !ALLOWED_NAMES.has(parts[0])) {
    return new NextResponse(null, { status: 404 });
  }
  const name = parts[0];

  const publicDir = path.join(process.cwd(), "public");
  // 新位置 public/site-assets/；兼容早期直接写 public 根目录的旧文件
  const candidates = [
    path.join(publicDir, "site-assets", name),
    path.join(publicDir, name),
  ];

  let buf: Buffer | null = null;
  for (const c of candidates) {
    try {
      buf = await readFile(c);
      break;
    } catch {
      // 试下一个候选路径
    }
  }
  if (!buf) return new NextResponse(null, { status: 404 });

  const ext = path.extname(name).toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
