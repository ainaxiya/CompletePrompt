import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ADMIN_BASE } from "@/lib/admin-path";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "操作日志" };

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  batch_update: "批量操作",
  login: "登录",
  logout: "登出",
};

const TARGET_LABELS: Record<string, string> = {
  prompt: "提示词",
  user: "用户",
  category: "分类",
  role: "角色",
  setting: "设置",
  comment: "评论",
};

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; userId?: string; action?: string; targetType?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect(`/login?next=${encodeURIComponent(ADMIN_BASE)}`);

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1") || 1);
  const userId = sp.userId ? parseInt(sp.userId) || 0 : 0;
  const action = sp.action || "";
  const targetType = sp.targetType || "";

  const where: Prisma.AdminLogWhereInput = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;

  const [logs, total] = await Promise.all([
    db.adminLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { id: true, username: true, nickname: true } } },
    }),
    db.adminLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const buildUrl = (p: Partial<{ page: string; userId: string; action: string; targetType: string }>) => {
    const params = new URLSearchParams();
    const merged = { page: String(page), userId: userId ? String(userId) : "", action, targetType, ...p };
    if (merged.page && merged.page !== "1") params.set("page", merged.page);
    if (merged.userId) params.set("userId", merged.userId);
    if (merged.action) params.set("action", merged.action);
    if (merged.targetType) params.set("targetType", merged.targetType);
    const qs = params.toString();
    return `${ADMIN_BASE}/logs${qs ? "?" + qs : ""}`;
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">操作日志</h1>
      <p className="mb-5 text-sm text-zinc-500">
        管理员操作记录（只读）。共 {total} 条记录。
      </p>

      {/* 过滤栏 */}
      <form className="mb-4 flex flex-wrap gap-2">
        <select
          name="action"
          defaultValue={action}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none"
        >
          <option value="">全部操作</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          name="targetType"
          defaultValue={targetType}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none"
        >
          <option value="">全部对象</option>
          {Object.entries(TARGET_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          name="userId"
          type="number"
          defaultValue={userId || ""}
          placeholder="用户 ID"
          className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
        >
          筛选
        </button>
        {(action || targetType || userId) && (
          <Link
            href={`${ADMIN_BASE}/logs`}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            清除
          </Link>
        )}
      </form>

      {/* 日志表格 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 w-40">时间</th>
              <th className="px-3 py-2.5">管理员</th>
              <th className="px-3 py-2.5 w-20">操作</th>
              <th className="px-3 py-2.5 w-20">对象类型</th>
              <th className="px-3 py-2.5 w-20">对象 ID</th>
              <th className="px-3 py-2.5">详情</th>
              <th className="px-3 py-2.5 w-32">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-zinc-600">
                  暂无日志记录
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="align-top hover:bg-zinc-800/30">
                <td className="px-3 py-2.5 text-xs text-zinc-500">
                  {log.createdAt.toLocaleString("zh-CN", { hour12: false })}
                </td>
                <td className="px-3 py-2.5 text-zinc-300">
                  {log.user ? (
                    <span>
                      {log.user.nickname || log.user.username}
                      <span className="ml-1 text-xs text-zinc-500">#{log.user.id}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-600">已删除</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {log.targetType ? TARGET_LABELS[log.targetType] || log.targetType : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">
                  {log.targetId || "—"}
                </td>
                <td className="px-3 py-2.5">
                  {log.detail ? (
                    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-all text-xs text-zinc-500">
                      {log.detail.length > 300
                        ? log.detail.slice(0, 300) + "…"
                        : log.detail}
                    </pre>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{log.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
        <span>
          共 {total} 条，{page} / {Math.max(1, totalPages)}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
            >
              上一页
            </Link>
          ) : (
            <button disabled className="rounded-lg bg-zinc-800 px-3 py-1.5 opacity-40">
              上一页
            </button>
          )}
          {page < totalPages ? (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
            >
              下一页
            </Link>
          ) : (
            <button disabled className="rounded-lg bg-zinc-800 px-3 py-1.5 opacity-40">
              下一页
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
