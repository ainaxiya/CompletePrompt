import UserManager from "@/components/admin/UserManager";
export const dynamic = "force-dynamic";
export const metadata = { title: "用户管理" };
export default function Page() {
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">用户管理</h1>
      <UserManager />
    </div>
  );
}
