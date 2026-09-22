import { db } from "./db";

// 简单内存缓存：分类变更不频繁，缓存 30 秒
let cache: { slugs: string[]; ts: number } | null = null;
const TTL = 30_000;

export async function getCategorySlugs(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL) return cache.slugs;
  const rows = await db.category.findMany({ select: { slug: true } });
  const slugs = rows.map((r) => r.slug);
  cache = { slugs, ts: now };
  return slugs;
}

export function invalidateCategoryCache() {
  cache = null;
}
