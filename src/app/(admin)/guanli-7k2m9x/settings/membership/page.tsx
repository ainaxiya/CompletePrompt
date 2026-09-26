import { RegisterSettingsForm } from "@/components/admin/SettingsForms";
export const dynamic = "force-dynamic";
export const metadata = { title: "注册设置" };
export default function Page() {
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">注册设置</h1>
      <RegisterSettingsForm />
    </div>
  );
}
