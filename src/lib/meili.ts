import { MeiliSearch } from "meilisearch";
import { stripHtml } from "./rich";

export const meili = new MeiliSearch({
  host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY || "",
});

export async function searchPrompts(
  q: string,
  opts: { page?: number; type?: string; category?: string; language?: string; tag?: string; sort?: string } = {}
) {
  const index = meili.index("prompts");
  const page = opts.page || 1;
  const filter: string[] = [];
  if (opts.type) filter.push(`type = "${opts.type}"`);
  if (opts.category) filter.push(`category = "${opts.category}"`);
  if (opts.language) filter.push(`language = "${opts.language}"`);
  if (opts.tag) filter.push(`tags = "${opts.tag}"`);
  const sort: string[] = [];
  if (opts.sort === "likes") sort.push("likeCount:desc");
  else if (opts.sort === "new") sort.push("createdAtTs:desc");
  const res = await index.search(q, {
    page,
    hitsPerPage: 24,
    filter: filter.length ? filter : undefined,
    sort: sort.length ? sort : undefined,
  });
  return res;
}

// 把一条 prompt 完整同步进索引（审核通过/后台编辑后调用）
export async function syncPromptToMeili(p: {
  id: number; title: string; content: string; description: string | null;
  type: string; category: string; language: string; tags: string[];
  likeCount: number; viewCount: number; createdAt: Date;
  sourceAuthor?: string | null; promptCode?: string | null;
  coverUrl?: string | null; featured?: boolean;
}) {
  await meili.index("prompts").addDocuments(
    [
      {
        id: p.id,
        title: p.title,
        content: stripHtml(p.content).slice(0, 15000),
        description: (p.description || "").slice(0, 2000),
        type: p.type,
        category: p.category,
        language: p.language,
        tags: p.tags,
        sourceAuthor: p.sourceAuthor ?? null,
        promptCode: p.promptCode ?? null,
        coverUrl: p.coverUrl ?? null,
        featured: !!p.featured,
        likeCount: p.likeCount,
        viewCount: p.viewCount,
        createdAtTs: Math.floor(p.createdAt.getTime() / 1000),
      },
    ],
    { primaryKey: "id" }
  );
}

export async function removePromptFromMeili(id: number) {
  await meili.index("prompts").deleteDocument(id);
}
