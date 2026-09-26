import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncPromptToMeili } from "@/lib/meili";
import { detectLang } from "@/lib/langdetect";
import { getCategorySlugs } from "@/lib/categories";
import { sanitizeRich } from "@/lib/sanitize.server";
import { isHtmlContent, stripHtml, extractFirstImage, makeExcerpt } from "@/lib/rich";
import { getSystemUser } from "@/lib/system-user";

export const dynamic = "force-dynamic";

// GET /api/admin/prompts?page=&q=&status=&category=
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const q = (searchParams.get("q") || "").trim();
  const status = searchParams.get("status") || "";
  const category = searchParams.get("category") || "";
  const pageSize = 30;

  const where: any = {};
  if (["published", "pending", "rejected", "draft"].includes(status)) where.status = status;
  if (category) {
    const slugs = await getCategorySlugs();
    if (slugs.includes(category)) where.category = category;
  }
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }];

  const [list, total, counts] = await Promise.all([
    db.prompt.findMany({
      where,
      orderBy: [{ status: "asc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, username: true, nickname: true } },
        adminAuthor: { select: { id: true, username: true, nickname: true } },
      },
    }),
    db.prompt.count({ where }),
    db.prompt.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    list,
    total,
    page,
    pageSize,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
}

// 原作品/转载出处：站内相对路径或 http(s) 绝对链接
const sourceUrlRule = z
  .string()
  .max(500)
  .refine(
    (v) => {
      if (v.startsWith("/")) return true;
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    "原作品链接必须是 http(s) 地址"
  );

const createSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.enum(["text", "image", "video", "audio"]).default("text"),
  category: z.string().max(50).optional(),
  model: z.string().max(60).nullable().optional(),
  sourceUrl: sourceUrlRule.nullable().optional().or(z.literal("")),
  tags: z.array(z.string().max(30)).max(8).optional(),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().min(1).max(100_000),
  coverUrl: z.string().max(1000).nullable().optional(),
  // published | pending | draft（后台手动创建默认直接发布）
  status: z.enum(["published", "pending", "draft"]).optional(),
  featured: z.boolean().optional(),
  hot: z.boolean().optional(),
});

// POST /api/admin/prompts 后台手动新增
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  const d = parsed.data;

  const slugs = await getCategorySlugs();
  const category = slugs.includes(d.category || "") ? d.category! : slugs[0] || "其他";

  const content = isHtmlContent(d.content)
    ? sanitizeRich(d.content)
    : d.content
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((l, i) => `[${i + 1}] 提示词 ${i + 1}\n${l}`)
        .join("\n\n");

  const coverUrl = d.coverUrl || extractFirstImage(content) || null;
  const description = d.description?.trim() || makeExcerpt(content) || null;
  const language = detectLang(d.title + "\n" + stripHtml(content));
  const status = d.status || "published";

  // 管理员发布：userId 挂系统作者账号，真实操作者记 adminAuthorId
  const systemUser = await getSystemUser();
  const prompt = await db.prompt.create({
    data: {
      userId: systemUser.id,
      adminAuthorId: admin.id,
      title: d.title,
      content,
      description,
      type: d.type,
      category,
      language,
      model: d.model || null,
      tags: d.tags || [],
      coverUrl,
      sourceUrl: d.sourceUrl?.trim() || null,
      status,
      featured: d.featured || false,
      hot: d.hot || false,
      publishedAt: status === "published" ? new Date() : null,
    },
  });

  if (status === "published") {
    try {
      await syncPromptToMeili(prompt);
    } catch (e) {
      console.warn("[meili] admin create index failed:", prompt.id, e);
    }
  }

  return NextResponse.json({ id: prompt.id, status });
}
