import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// 前台布局：导航 + 主内容 + 页脚（后台不走此布局）
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader siteName={settings.basic.siteName} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="site-footer mt-8 border-t border-zinc-800/80 bg-zinc-950">
        <div className="mx-auto w-full max-w-6xl px-4">
          {/* 上部：品牌 + 导航 */}
          <div className="flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/full-cn-dark.svg" alt="完整提示词" className="h-8 w-auto" />
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {settings.basic.footerText}
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
              © {new Date().getFullYear()} {settings.basic.siteName}
            </span>
            <span>提示词数据来自公开社区，版权归原作者所有</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
