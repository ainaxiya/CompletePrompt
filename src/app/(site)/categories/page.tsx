import Link from "next/link";
import { db } from "@/lib/db";
import CategoryIcon from "@/components/CategoryIcon";
import { getCategoryMeta } from "@/lib/category-meta";
import { getServerLocale, translate as t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "分类浏览" };

// 创作类型元信息（与详情页 /type 列表页保持一致）
const TYPE_META: Record<string, { zh: string; en: string; icon: string; cls: string; desc: { zh: string; en: string } }> = {
  text:  { zh: "文本创作", en: "Text",  icon: "📝", cls: "bg-sky-500/15 text-sky-300",
           desc: { zh: "写作、对话、代码、角色设定等纯文本提示词", en: "Pure text prompts for writing, chat, code, roles" } },
  image: { zh: "文生图",   en: "Image", icon: "🎨", cls: "bg-emerald-500/15 text-emerald-300",
           desc: { zh: "Midjourney、SD、即梦等 AI 绘画提示词", en: "AI art prompts for Midjourney, SD, Jimeng, etc." } },
  video: { zh: "文生视频", en: "Video", icon: "🎬", cls: "bg-violet-500/15 text-violet-300",
           desc: { zh: "即梦、可灵、Runway 等 AI 视频生成提示词", en: "AI video prompts for Jimeng, Kling, Runway, etc." } },
  audio: { zh: "文生音频", en: "Audio", icon: "🎵", cls: "bg-amber-500/15 text-amber-300",
           desc: { zh: "音乐、配音、音效等 AI 音频生成提示词", en: "AI audio prompts for music, voice, SFX" } },
};
const TYPE_ORDER = ["text", "image", "video", "audio"];

export default async function CategoriesPage() {
  const locale = await getServerLocale();

  const [cats, groups, typeGroups] = await Promise.all([
    db.category.findMany({ orderBy: { sort: "asc" } }),
    db.prompt.groupBy({
      by: ["category"],
      where: { status: "published" },
      _count: { _all: true },
    }),
    db.prompt.groupBy({
      by: ["type"],
      where: { status: "published" },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(groups.map((g) => [g.category, g._count._all]));
  const typeCounts = new Map(typeGroups.map((g) => [g.type, g._count._all]));

  return (
    <div>
      <div className="py-8 text-center sm:py-10">
        <span className="inline-block rounded-full border border-royal-500/40 bg-royal-500/10 px-3.5 py-1 text-xs font-medium tracking-wider text-royal-300">
          {t(locale, "cat.badge")}
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          {t(locale, "cat.heroTitle")}
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          {t(locale, "cat.heroSub", { n: cats.length })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cats.map((c) => {
          const meta = getCategoryMeta(c.slug);
          const n = counts.get(c.slug) || 0;
          const name = locale === "zh" ? c.name : c.nameEn;
          const desc = meta.desc[locale];
          return (
            <Link
              key={c.id}
              href={`/category/${encodeURIComponent(c.slug)}`}
              className="group flex min-h-[190px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:-translate-y-0.5 hover:border-emerald-600/50 hover:bg-zinc-900"
            >
              <span
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${meta.bg} ${meta.fg}`}
              >
                <CategoryIcon icon={meta.icon} className="h-6 w-6" />
              </span>
              <h2 className="mb-1.5 text-base font-semibold text-zinc-100 group-hover:text-emerald-300">
                {name}
              </h2>
              <p className="mb-4 line-clamp-2 flex-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
              <div className="flex items-end justify-between">
                <span className="text-xs text-zinc-500">{t(locale, "cat.count", { n })}</span>
                <span className="flex items-center gap-1 text-xs text-zinc-400 transition group-hover:text-emerald-400">
                  {t(locale, "cat.browse")}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 按创作类型浏览 */}
      <div className="mt-12 border-t border-zinc-800/70 pt-10">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
            {t(locale, "type.sectionTitle")}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {t(locale, "type.sectionSub", { n: TYPE_ORDER.length })}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TYPE_ORDER.map((type) => {
            const meta = TYPE_META[type];
            const n = typeCounts.get(type) || 0;
            const name = locale === "zh" ? meta.zh : meta.en;
            const desc = meta.desc[locale];
            return (
              <Link
                key={type}
                href={`/type/${type}`}
                className="group flex min-h-[170px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:-translate-y-0.5 hover:border-emerald-600/50 hover:bg-zinc-900"
              >
                <span
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${meta.cls}`}
                >
                  {meta.icon}
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-zinc-100 group-hover:text-emerald-300">
                  {name}
                </h3>
                <p className="mb-4 line-clamp-2 flex-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
                <div className="flex items-end justify-between">
                  <span className="text-xs text-zinc-500">{t(locale, "cat.count", { n })}</span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400 transition group-hover:text-emerald-400">
                    {t(locale, "cat.browse")}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
