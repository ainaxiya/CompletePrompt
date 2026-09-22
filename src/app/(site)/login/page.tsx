import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "登录 / Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
