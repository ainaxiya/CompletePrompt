import CollectManager from "@/components/admin/CollectManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "采集管理" };

export default function Page() {
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">采集管理</h1>
      <CollectManager />
    </div>
  );
}
