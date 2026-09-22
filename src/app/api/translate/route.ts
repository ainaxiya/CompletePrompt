import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { translateText } from "@/lib/translate";
import { detectLang } from "@/lib/langdetect";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(20_000),
  target: z.enum(["zh", "en"]),
  source: z.enum(["zh", "en"]).optional(),
});

// POST /api/translate { text, target, source? }
// 源语言与目标语言一致时返回 { skipped: true }，前端不显示翻译框
export async function POST(req: NextRequest) {
  // 防翻译额度盗刷：每 IP 每分钟 20 次
  if (!rateLimit(`translate:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const source = parsed.data.source ?? detectLang(parsed.data.text);
  if (source === parsed.data.target) {
    return NextResponse.json({ skipped: true, sourceLang: source });
  }
  try {
    const r = await translateText(parsed.data.text, parsed.data.target, source);
    if (!r) return NextResponse.json({ skipped: true, sourceLang: source });
    return NextResponse.json({
      translated: r.translated,
      sourceLang: r.sourceLang,
      cached: r.cached,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "translation provider error", detail: String(e?.message || e).slice(0, 200) },
      { status: 502 }
    );
  }
}
