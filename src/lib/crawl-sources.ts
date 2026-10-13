// 采集源注册表：新增采集站在此注册
export type CrawlSourceId = "libtv" | "jimeng";

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
  {
    id: "jimeng",
    name: "即梦AI",
    url: "https://jimeng.jianying.com/",
    description:
      "即梦AI 创作灵感社区（图片为主）。一键获取最新作品列表，勾选后采集提示词与图片入库。",
    enabled: true,
  },
];

export function getCrawlSource(id: string): CrawlSource | undefined {
  return CRAWL_SOURCES.find((s) => s.id === id && s.enabled);
}
