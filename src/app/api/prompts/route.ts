import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { syncPromptToMeili } from "@/lib/meili";
import { getSettings } from "@/lib/settings";
import { detectLang } from "@/lib/langdetect";
import { normalizeEmbed, type MediaItem } from "@/lib/media";
import { getCategorySlugs } from "@/lib/categories";
import { sanitizeRich } from "@/lib/sanitize.server";
import { isHtmlContent, stripHtml, extractFirstImage, makeExcerpt } from "@/lib/rich";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["text", "image", "video", "audio"] as const;

// 允许绝对 http(s) 链接（转载）与站内相对路径（本地上传 /uploads/...）
const mediaUrl = z
  .string()
  .max(1000)
  .refine((v) => {
    if (v.startsWith("/")) return true;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Invalid url");

const mediaSchema = z.object({
  type: z.enum(["image", "video", "embed"]),
  url: mediaUrl,
  poster: mediaUrl.optional(),
});

const createSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.enum(VALID_TYPES).default("text"),
  category: z.string().max(50).optional(),
  model: z.string().max(60).optional().nullable(),
  tags: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  content: z.string().min(1).max(100_000),
  coverUrl: z.string().max(1000).optional().nullable(),
  media: z.array(mediaSchema).max(12).optional().default([]),
});

// GET /api/prompts?page=&type=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const rawType = searchParams.get("type");
  const type = rawType && VALID_TYPES.includes(rawType as any) ? rawType : undefined;
  const where = { status: "published", ...(type ? { type } : {}) };
  const [list, total] = await Promise.all([
    db.prompt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 24,
      take: 24,
      select: {
        id: true, title: true, type: true, tags: true,
        sourceAuthor: true, likeCount: true, viewCount: true, createdAt: true,
      },
    }),
    db.prompt.count({ where }),
  ]);
  return NextResponse.json({ list, total, page });
}

// POST /api/prompts 发布
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const settings = await getSettings();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  const d = parsed.data;

  if (d.content.length > settings.publish.maxContentLen) {
    return NextResponse.json({ error: "内容超出长度限制" }, { status: 400 });
  }

  // 分类校验：必须是后台已存在的分类，否则取第一个分类
  const slugs = await getCategorySlugs();
  const category = slugs.includes(d.category || "") ? d.category! : slugs[0] || "其他";
  const media = (d.media || []).slice(0, settings.publish.maxMediaPerPrompt).map((m) =>
    m.type === "embed" ? normalizeEmbed(m.url) ?? m : m
  ).filter(Boolean) as MediaItem[];

  // 富文本清洗；历史纯文本保留并按空行加 [n] 分段标记
  const rawContent = d.content;
  const content = isHtmlContent(rawContent)
    ? sanitizeRich(rawContent)
    : rawContent
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((l, i) => `[${i + 1}] 提示词 ${i + 1}\n${l}`)
        .join("\n\n");

  // 封面：显式上传 > 内容中第一张图 > 媒体库首图
  const coverUrl =
    d.coverUrl || extractFirstImage(content) || media.find((m) => m.type === "image")?.url || null;

  // 简介为空时自动从内容提取
  const description = d.description?.trim() || makeExcerpt(content) || null;

  const tags = (d.tags || "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  const language = detectLang(d.title + "\n" + stripHtml(content));
  const status = settings.publish.mode === "review" ? "pending" : "published";

  const prompt = await db.prompt.create({
    data: {
      userId: user.id,
      title: d.title,
      content,
      description,
      type: d.type,
      category,
      language,
      model: d.model || null,
      tags,
      media: media as any,
      coverUrl,
      status,
    },
  });

  // 仅已发布内容进入搜索索引；待审核通过后由后台补建索引
  if (status === "published") {
    try {
      await syncPromptToMeili(prompt);
    } catch (e) {
      console.warn("[meili] index prompt failed:", prompt.id, e);
    }
  }

  return NextResponse.json({ id: prompt.id, status });
}
