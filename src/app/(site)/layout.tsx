import Link from "next/link";
import Script from "next/script";
import SiteHeader from "@/components/SiteHeader";
import MobileTabBar from "@/components/MobileTabBar";
import { getPublicSite } from "@/lib/settings";

export const dynamic = "force-dynamic";

// 前台布局：导航 + 主内容 + 页脚（后台不走此布局）
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getPublicSite();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader siteName={site.siteName} logoIcon={site.logoIcon || undefined} />
      {/* pb-24：为手机端底部 Tab 栏（52px + 安全区）预留空间，md 起 Tab 隐藏恢复常规 */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 md:pb-8">{children}</main>

      <footer className="site-footer mt-8 border-t border-zinc-800/80 bg-zinc-950 pb-16 md:pb-0">
        <div className="mx-auto w-full max-w-6xl px-4">
          {/* 上部：品牌 + 导航 */}
          <div className="flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={site.logoIcon || "/logo/icon.png"}
                  alt={site.siteName}
                  className="h-8 w-8 rounded-lg object-cover"
                />
                <span className="text-base font-semibold tracking-wide text-zinc-100">
                  {site.siteName}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {site.footerText}
              </p>
            </div>

            <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
              <Link href="/" className="text-zinc-400 transition hover:text-emerald-300">
                首页
              </Link>
              <Link href="/hot" className="text-zinc-400 transition hover:text-emerald-300">
                热门
              </Link>
              <Link href="/categories" className="text-zinc-400 transition hover:text-emerald-300">
                分类
              </Link>
              <Link href="/search" className="text-zinc-400 transition hover:text-emerald-300">
                搜索
              </Link>
              <Link href="/publish" className="text-zinc-400 transition hover:text-emerald-300">
                发布提示词
              </Link>
              <Link href="/member" className="text-zinc-400 transition hover:text-emerald-300">
                会员中心
              </Link>
            </nav>
          </div>

          {/* 下部：版权条（橙色点缀） */}
          <div className="flex flex-col items-center justify-between gap-2 border-t border-zinc-800/70 py-4 text-xs text-zinc-500 sm:flex-row">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-royal-500 shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
              © {new Date().getFullYear()} {site.siteName}
            </span>
            <span>
              提示词数据来自公开社区，版权归原作者所有 · 如有需要联系站长{" "}
              <a
                href="https://t.me/QIUKUZI"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 underline decoration-zinc-600 underline-offset-2 transition hover:text-royal-400 hover:decoration-royal-500"
              >
                Telegram
              </a>
            </span>
          </div>
        </div>
      </footer>

          <Script id="aizhantj" strategy="afterInteractive">
        {`var _mtj = _mtj || [];
(function () {
  var mtj = document.createElement("script");
  mtj.src = "https://node91.aizhantj.com:21233/tjjs/?k=lcwaty9lmo1";
  var s = document.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(mtj, s);
})();`}
      </Script>

      {/* 手机端底部标签栏（md 起自动隐藏） */}
      <MobileTabBar />
    </div>
  );
}
