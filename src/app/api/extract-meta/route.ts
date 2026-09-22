import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractTags, makeExcerpt, stripHtml } from "@/lib/rich";
import { getTagVocab } from "@/lib/tag-vocab.server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 在文本中贪心选择候选词：长词优先，字符位置不重叠
function selectTags(text: string, vocab: string[], fallback: string[], limit: number): string[] {
  const claimed = new Array(text.length).fill(false);
  const picked: string[] = [];

  const tryClaim = (term: string): boolean => {
    let from = 0;
    // 一个词可能出现多次，取第一个未被占用的位置
    while (from <= text.length - term.length) {
      const idx = text.indexOf(term, from);
      if (idx < 0) return false;
      from = idx + 1;
      let overlap = false;
      for (let i = idx; i < idx + term.length; i++) {
        if (claimed[i]) { overlap = true; break; }
      }
      if (overlap) continue;
      for (let i = idx; i < idx + term.length; i++) claimed[i] = true;
      picked.push(term);
      return true;
    }
    return false;
  };

  // 1) 语料词库命中（词库已按长度/粘合度排序），长词优先
  for (const term of vocab) {
    if (picked.length >= limit) break;
    if (term.length < 2 || text.indexOf(term) < 0) continue;
    tryClaim(term);
  }
  // 2) 词库不足时，用本文词频候选补足
  if (picked.length < Math.min(3, limit)) {
    for (const term of fallback.sort((a, b) => b.length - a.length)) {
      if (picked.length >= limit) break;
      tryClaim(term);
    }
  }
  return picked.slice(0, limit);
}

// POST /api/extract-meta { content, title? } → { tags, description }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await req.json().catch(() => null);

  // 预热请求不耗额度但仍限流
  if (!rateLimit(`extract:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  // 预热：页面挂载时静默触发语料词库构建
  if (body?.warm === true) {
    await getTagVocab().catch(() => null);
    return NextResponse.json({ ok: true });
  }

  const rawContent: string = body?.content || "";
  if (!rawContent.trim()) return NextResponse.json({ error: "内容为空" }, { status: 400 });

  const text = stripHtml(`${body?.title || ""}\n${rawContent}`).slice(0, 4000);

  // 语料挖掘词库（30 分钟缓存）+ 已有活动标签
  const [vocab, tagRows] = await Promise.all([
    getTagVocab(),
    db.prompt.findMany({
      where: { status: "published" },
      orderBy: { id: "desc" },
      select: { tags: true },
      take: 6000,
    }),
  ]);
  const counter = new Map<string, number>();
  for (const r of tagRows) for (const tg of r.tags) counter.set(tg, (counter.get(tg) || 0) + 1);
  const activityTags = [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([t]) => t)
    .filter((t) => /^[一-鿿A-Za-z0-9 ]{2,12}$/.test(t));

  // 活动标签（如 网络安全）也参与匹配，置于语料词之后
  const fallback = extractTags(rawContent, [], 12);
  const tags = selectTags(text, [...vocab, ...activityTags], fallback, 8);
  const description = makeExcerpt(rawContent);

  return NextResponse.json({ tags, description });
}
