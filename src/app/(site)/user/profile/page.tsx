import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import UserAvatar from "@/components/UserAvatar";
import ProfileForm, { type ProfileUser } from "./ProfileForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "个人中心" };

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/user/profile");

  // getCurrentUser 未返回 nickname/avatar/email/bio，重新查询完整资料
  const u = await db.user.findUnique({
    where: { id: me.id },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      bio: true,
      role: true,
      createdAt: true,
    },
  });
  if (!u) redirect("/login?next=/user/profile");

  // 序列化为 plain object（Date → ISO 字符串）传给 client 组件
  const profile: ProfileUser = {
    id: u.id,
    username: u.username,
    email: u.email,
    nickname: u.nickname,
    avatar: u.avatar,
    bio: u.bio,
    createdAt: u.createdAt.toISOString(),
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">个人中心</h1>

      {/* 基本信息卡片 */}
      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-4">
          <UserAvatar src={u.avatar} name={u.nickname || u.username} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-zinc-100">
                {u.nickname || u.username}
              </h2>
              {u.role === "admin" && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">
                  ADMIN
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500">@{u.username}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">邮箱</dt>
            <dd className="text-zinc-300">{u.email || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">注册时间</dt>
            <dd className="text-zinc-300">{u.createdAt.toISOString().slice(0, 10)}</dd>
          </div>
        </dl>
      </div>

      <ProfileForm initial={profile} />
    </div>
  );
}
