import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PERMISSIONS, requirePerm, logAdminAction, getClientIp } from "@/lib/rbac";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 允许上传的文件名（固定白名单，防止任意文件覆盖）
const ALLOWED_FILES: Record<string, { exts: string[]; magic: number[][] }> = {
  "logo-icon-120.png": {
    exts: ["image/png", "image/webp"],
    magic: [[0x89, 0x50, 0x4e, 0x47], [0x52, 0x49, 0x46, 0x46]], // PNG / WebP(RIFF)
  },
  "favicon.ico": {
    exts: ["image/x-icon", "image/vnd.microsoft.icon", "image/png"],
    magic: [[0x00, 0x00, 0x01, 0x00], [0x89, 0x50, 0x4e, 0x47]], // ICO / PNG
  },
  "app-icon.png": {
    exts: ["image/png", "image/webp"],
    magic: [[0x89, 0x50, 0x4e, 0x47], [0x52, 0x49, 0x46, 0x46]],
  },
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// 校验文件头（magic bytes），防止伪装扩展名
function hasValidMagic(buf: Buffer, signatures: number[][]) {
  return signatures.some((sig) => sig.every((b, i) => buf[i] === b));
}

// POST /api/admin/settings/upload — 上传站点 LOGO/图标
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return jsonError("forbidden", 403);

    const { user, ok } = await requirePerm(PERMISSIONS.SETTING_WRITE);
    if (!user || !ok) return jsonError("no permission", 403);

    let file: File | null = null;
    let filename: string | null = null;
    try {
      const formData = await req.formData();
      file = formData.get("file") as File | null;
      filename = formData.get("filename") as string | null;
    } catch {
      return jsonError("上传数据解析失败（可能超过服务器/Nginx 上传大小限制）", 400);
    }

    if (!file || !filename) {
      return jsonError("缺少文件或文件名");
    }

    const conf = ALLOWED_FILES[filename];
    if (!conf) {
      return jsonError("不允许的文件名");
    }

    if (file.size === 0) return jsonError("文件为空");
    if (file.size > 2 * 1024 * 1024) {
      return jsonError("文件大小不能超过 2MB");
    }

    if (!conf.exts.includes(file.type)) {
      return jsonError(`文件类型不允许：${file.type || "未知"}`);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasValidMagic(bytes, conf.magic)) {
      return jsonError("文件内容与类型不符（已拦截）");
    }

    // 必须存到运行时可被 HTTP 访问的位置：Next.js 不服务 build 后新增的 public 根级文件，
    // 所以写入 public/site-assets/，由 /site-assets/[...path] 动态路由读取返回
    const dir = path.join(process.cwd(), "public", "site-assets");
    let filePath: string;
    try {
      await mkdir(dir, { recursive: true });
      filePath = path.join(dir, filename);
      await writeFile(filePath, bytes);
    } catch (e: any) {
      // 服务器上最常见：public 目录对运行用户（www）不可写
      console.error("[settings/upload] write failed:", e?.code, e?.message);
      return jsonError(
        `服务器写入失败（${e?.code || "未知错误"}），请检查项目 public 目录权限：chown -R www:www /www/wwwroot/CompletePrompt/public`,
        500
      );
    }

    // 走动态服务路由；v 参数破缓存，替换图标后浏览器立即拿到新文件
    const url = `/site-assets/${filename}?v=${Date.now()}`;

    await logAdminAction({
      userId: admin.id,
      action: "update",
      targetType: "setting",
      detail: JSON.stringify({ upload: filename, size: file.size }),
      ip: await getClientIp(),
    });

    return NextResponse.json({ ok: true, url, filename });
  } catch (e: any) {
    // 兜底：任何未预期异常都必须返回 JSON，避免前端 Unexpected end of JSON input
    console.error("[settings/upload] unhandled:", e);
    return jsonError(`服务器异常：${e?.message || "unknown"}`, 500);
  }
}
