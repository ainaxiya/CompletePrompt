import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "hourly", priority: 1 },
    { url: base + "/search", changeFrequency: "daily", priority: 0.5 },
  ];
  try {
    const prompts = await db.prompt.findMany({
      where: { status: "published" },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: 20000,
    });
    return [
      ...staticPages,
      ...prompts.map((p) => ({
        url: `${base}/p/${p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}
