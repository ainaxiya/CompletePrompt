import CommentManager from "@/components/admin/CommentManager";
export const dynamic = "force-dynamic";
export const metadata = { title: "评论管理" };
export default function Page() {
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">评论管理</h1>
      <CommentManager />
    </div>
  );
}
