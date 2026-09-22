import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncPromptToMeili, removePromptFromMeili } from "@/lib/meili";
import { detectLang } from "@/lib/langdetect";
import { normalizeEmbed, type MediaItem } from "@/lib/media";
import { getCategorySlugs } from "@/lib/categories";
import { sanitizeRich } from "@/lib/sanitize.server";
import { isHtmlContent, stripHtml, extractFirstImage, makeExcerpt } from "@/lib/rich";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const p = await db.prompt.findUnique({
    where: { id: parseInt(id) },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(p);
}

const patchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  type: z.enum(["text", "image", "video", "audio"]).optional(),
  category: z.string().max(50).optional(),
  model: z.string().max(60).nullable().optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().min(1).max(100_000).optional(),
  coverUrl: z.string().max(1000).nullable().optional(),
  status: z.enum(["draft", "pending", "published", "rejected"]).optional(),
  featured: z.boolean().optional(),
  hot: z.boolean().optional(),
  rejectReason: z.string().max(500).nullable().optional(),
  media: z
    .array(z.object({
      type: z.enum(["image", "video", "embed"]),
      url: z.string().max(1000).refine((v) => {
        if (v.startsWith("/")) return true;
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      }, "Invalid url"),
      poster: z.string().max(1000).optional(),
    }))
    .max(12)
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const pid = parseInt(id);
  const existing = await db.prompt.findUnique({ where: { id: pid } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "bad params" }, { status: 400 });
  }
  const d: any = { ...parsed.data };
  if (d.category) {
    const slugs = await getCategorySlugs();
    if (!slugs.includes(d.category)) d.category = existing.category;
  }
  if (d.media) {
    d.media = (d.media as MediaItem[])
      .map((m) => (m.type === "embed" ? normalizeEmbed(m.url) ?? m : m))
      .filter(Boolean);
  }
  if (typeof d.content === "string") {
    d.content = isHtmlContent(d.content) ? sanitizeRich(d.content) : d.content.trim();
  }
  // 封面：显式值优先；未提供但内容变更时，从内容首图/媒体库自动提取
  const effectiveContent = d.content || existing.content;
  if ("coverUrl" in d || "content" in d) {
    d.coverUrl =
      d.coverUrl ||
      extractFirstImage(effectiveContent) ||
      (d.media ? (d.media as MediaItem[]).find((m) => m.type === "image")?.url || null : existing.coverUrl);
  }
  // 仅当本次提交显式清空简介且带内容时自动提取；未提交简介则保持原值
  if ((d.description === "" || d.description === null) && "content" in d) {
    d.description = makeExcerpt(effectiveContent) || existing.description;
  } else if (d.description === null || d.description === undefined) {
    delete d.description;
  }
  if (d.content || d.title) {
    d.language = detectLang(`${d.title || existing.title}\n${stripHtml(effectiveContent)}`);
  }
  // 首次发布时记录发布时间
  if (d.status === "published" && !existing.publishedAt) {
    d.publishedAt = new Date();
  }

  const updated = await db.prompt.update({ where: { id: pid }, data: d });

  // 搜索索引同步
  try {
    if (updated.status === "published") await syncPromptToMeili(updated);
    else await removePromptFromMeili(pid);
  } catch (e) {
    console.warn("[meili] admin sync failed:", pid, e);
  }

  return NextResponse.json({ ok: true, status: updated.status });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const pid = parseInt(id);
  await db.prompt.delete({ where: { id: pid } }).catch(() => null);
  try {
    await removePromptFromMeili(pid);
  } catch {}
  return NextResponse.json({ ok: true });
}
