import type { Metadata } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
    title: {
      default: `${settings.basic.siteName} - AI Prompt Community`,
      template: `%s | ${settings.basic.siteName}`,
    },
    description: settings.basic.siteDescription,
    keywords: ["AI提示词", "prompt", "Midjourney", "即梦", "可灵", "AI绘画", "AI视频", "CompletePrompt", "完整提示词"],
    icons: {
      icon: "/favicon.ico",
      apple: "/apple-touch-icon.png",
      other: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    openGraph: {
      title: `${settings.basic.siteName} - AI Prompt Community`,
      description: settings.basic.siteDescription,
      images: ["/og-image.png"],
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
