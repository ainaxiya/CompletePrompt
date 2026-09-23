import type { Metadata } from "next";
import "./globals.css";
import { getPublicSite } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getPublicSite();
  const titleDefault = `${site.siteName} - ${site.siteNameEn}`;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
    title: {
      default: titleDefault,
      template: `%s | ${site.siteName}`,
    },
    description: site.description,
    keywords: site.keywords,
    icons: {
      icon: site.favicon,
      apple: site.appleIcon,
      other: [
        { url: site.favicon32, sizes: "32x32", type: "image/png" },
        { url: site.icon192, sizes: "192x192", type: "image/png" },
        { url: site.appIcon, sizes: "512x512", type: "image/png" },
      ],
    },
    openGraph: {
      title: titleDefault,
      description: site.description,
      // 后台上传了自定义图标时优先用作分享图，否则用内置 og 图
      images: site.appIcon !== "/icon-512.png" ? [site.appIcon] : ["/og-image.png"],
      siteName: site.siteName,
    },
  };
}

// 根布局：仅最小文档壳。前台/后台各自使用路由组布局，互不嵌套。
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
