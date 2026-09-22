import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// 公开配置：发布页/注册页使用，不含敏感信息
export async function GET() {
  const s = await getSettings();
  return NextResponse.json({
    basic: {
      siteName: s.basic.siteName,
      allowRegister: s.basic.allowRegister,
    },
    publish: s.publish,
    membership: s.membership,
  });
}
