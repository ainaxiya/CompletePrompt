import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "注册 / Sign up" };

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
