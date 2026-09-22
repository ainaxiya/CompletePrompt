import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// 允许上传的文件名（固定白名单，防止任意文件覆盖）
const ALLOWED_FILES: Record<string, { dir: string; exts: string[] }> = {
  "logo-icon-120.png": { dir: "public", exts: ["image/png", "image/webp"] },
  "favicon.ico": { dir: "public", exts: ["image/x-icon", "image/vnd.microsoft.icon", "image/png"] },
  "app-icon.png": { dir: "public", exts: ["image/png", "image/webp"] },
};

// POST /api/admin/settings/upload — 上传站点 LOGO/图标
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { user, ok } = await requirePerm(PERMISSIONS.SETTING_WRITE);
  if (!user || !ok) return NextResponse.json({ error: "no permission" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const filename = formData.get("filename") as string | null;

  if (!file || !filename) {
    return NextResponse.json({ error: "缺少文件或文件名" }, { status: 400 });
  }

  const conf = ALLOWED_FILES[filename];
  if (!conf) {
    return NextResponse.json({ error: "不允许的文件名" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "文件大小不能超过 2MB" }, { status: 400 });
  }

  if (!conf.exts.includes(file.type)) {
    return NextResponse.json({ error: `文件类型不允许：${file.type}` }, { status: 400 });
  }

  const projectRoot = path.resolve(process.cwd());
  const dir = path.join(projectRoot, conf.dir);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  // 返回可访问的 URL 路径
  const url = `/${filename}`;

  await logAdminAction({
    userId: admin.id,
    action: "update",
    targetType: "setting",
    detail: JSON.stringify({ upload: filename }),
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true, url, filename });
}
