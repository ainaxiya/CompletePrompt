"use client";

import Link from "next/link";

/**
 * 通用分页组件：「首页 1 2 3 4 5 最后」
 * 数字窗口始终显示最多 5 个，随当前页滑动。
 *
 * 两种模式（二选一）：
 *  - 链接模式（服务端页面可用）：传 basePath + query，组件内部拼 ?page=N
 *  - 回调模式（客户端组件）：传 onPage(n)，渲染为按钮
 */
export default function Pagination({
  page,
  totalPages,
  basePath,
  query,
  onPage,
}: {
  page: number;
  totalPages: number;
  /** 链接模式：路径，如 /hot */
  basePath?: string;
  /** 链接模式：除 page 外要保留的查询参数 */
  query?: Record<string, string | number | undefined>;
  /** 回调模式 */
  onPage?: (n: number) => void;
}) {
  if (totalPages <= 1) return null;

  const WIN = 5;
  let start = Math.max(1, page - Math.floor(WIN / 2));
  const end = Math.min(totalPages, start + WIN - 1);
  if (end - start + 1 < WIN) start = Math.max(1, end - WIN + 1);

  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);

  const buildHref = (n: number): string => {
    const params = new URLSearchParams();
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") params.set(k, String(v));
      }
    }
    params.set("page", String(n));
    return `${basePath || ""}?${params.toString()}`;
  };

  const btn = "min-w-9 rounded-lg px-3 py-1.5 text-center text-sm transition";
  const idle = `${btn} bg-zinc-800 text-zinc-300 hover:bg-zinc-700`;
  const activeCls = `${btn} bg-emerald-500 font-medium text-zinc-950`;
  const disabledCls = `${btn} cursor-not-allowed bg-zinc-800/50 text-zinc-600`;

  const renderItem = (n: number, label: string, key: string) => {
    if (n === page && label === String(n)) {
      return (
        <span key={key} className={activeCls}>
          {label}
        </span>
      );
    }
    const isDisabled =
      (label === "首页" && page <= 1) || (label === "最后" && page >= totalPages);
    if (isDisabled) {
      return (
        <span key={key} className={disabledCls}>
          {label}
        </span>
      );
    }
    if (onPage) {
      return (
        <button key={key} type="button" onClick={() => onPage(n)} className={idle}>
          {label}
        </button>
      );
    }
    return (
      <Link key={key} href={buildHref(n)} className={idle}>
        {label}
      </Link>
    );
  };

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      {renderItem(1, "首页", "first")}
      {nums.map((n) => renderItem(n, String(n), `p${n}`))}
      {renderItem(totalPages, "最后", "last")}
    </nav>
  );
}
