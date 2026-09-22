import type { MediaItem } from "@/lib/media";

// 顶部画廊：只展示不属于任何分段的媒体（封面、未绑定节点）
export default function MediaGallery({ media }: { media: MediaItem[] }) {
  if (!media || media.length === 0) return null;
  return (
    <div className="mb-5 space-y-3">
      {media.map((m, i) => {
        if (m.type === "image") {
          return (
            <a
              key={i}
              href={m.url}
              target="_blank"
              rel="noopener"
              className="block overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={m.alt || ""}
                loading="lazy"
                className="mx-auto max-h-[620px] w-full object-contain"
              />
            </a>
          );
        }
        if (m.type === "video") {
          return (
            <video
              key={i}
              src={m.url}
              poster={m.poster}
              controls
              preload="metadata"
              className="aspect-video w-full rounded-xl border border-zinc-800 bg-black object-contain"
            />
          );
        }
        return (
          <div key={i} className="overflow-hidden rounded-xl border border-zinc-800 bg-black" style={{ aspectRatio: "16/9" }}>
            <iframe
              src={m.url}
              title={`embed-${i}`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      })}
    </div>
  );
}

// 分段内的节点图片（视频节点展示截帧并打上 VIDEO 角标）
export function SectionMedia({ items, altBase }: { items: MediaItem[]; altBase?: string }) {
  if (!items || items.length === 0) return null;
  const cols =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";
  return (
    <div className={`mt-3 grid gap-2 ${cols}`}>
      {items.map((m, i) => (
        <a
          key={i}
          href={m.url}
          target="_blank"
          rel="noopener"
          className={`group/media relative block overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 transition hover:border-emerald-500/50 ${
            items.length === 1 ? "" : "aspect-square"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.url}
            alt={m.alt || `${altBase || ""} ${m.nodeKind === "video" ? "视频截图" : "配图"} ${m.nodeNo ?? ""}`.trim()}
            loading="lazy"
            className={`w-full object-contain ${items.length === 1 ? "max-h-[520px]" : "h-full"}`}
          />
          {m.nodeKind === "video" && (
            <span className="absolute left-1.5 top-1.5 rounded bg-sky-500/90 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
              视频截图
            </span>
          )}
          {m.nodeNo != null && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
              {m.nodeKind === "video" ? "视频" : "图片"}节点 {m.nodeNo}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
