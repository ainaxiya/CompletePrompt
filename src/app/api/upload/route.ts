import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { saveUserMedia, UploadError } from "@/lib/upload-core.server";

export const dynamic = "force-dynamic";

// POST /api/upload  multipart: file
// 用户投稿媒体单文件上传；批量上传由前端并发调用本接口（见 UniversalUploader）
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 上传限流：每 IP 每分钟 30 次（批量并发时按文件计）
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

    const saved = await saveUserMedia(file, {
      maxImageMB: settings.publish.maxImageMB,
      maxVideoMB: settings.publish.maxVideoMB,
    });
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[upload] failed:", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
