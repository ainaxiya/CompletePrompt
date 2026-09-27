// 采集源注册表：目前仅 LibLib TV（LibTV），后续新增站点在此扩展
export type CrawlSourceId = "libtv";

export interface CrawlSource {
  id: CrawlSourceId;
  name: string;
  url: string;
  description: string;
  enabled: boolean;
}

export const CRAWL_SOURCES: CrawlSource[] = [
  {
    id: "libtv",
    name: "LibLib TV",
    url: "https://www.liblib.tv/",
    description:
      "LibLib 社区 AI 创作作品流（图片/视频）。一键获取最新作品列表，勾选后采集提示词、封面与节点图片入库。",
    enabled: true,
  },
];

export function getCrawlSource(id: string): CrawlSource | undefined {
  return CRAWL_SOURCES.find((s) => s.id === id && s.enabled);
}
