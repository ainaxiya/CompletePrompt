import { MembershipForm } from "@/components/admin/SettingsForms";
export const dynamic = "force-dynamic";
export const metadata = { title: "会员设置" };
export default function Page() {
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">会员设置</h1>
      <MembershipForm />
    </div>
  );
}
