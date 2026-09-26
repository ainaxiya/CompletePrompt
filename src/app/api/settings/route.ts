import { NextResponse } from "next/server";
import { getSettings, getPublicSite } from "@/lib/settings";

export const dynamic = "force-dynamic";

// 公开配置：发布页/注册页使用，不含敏感信息
export async function GET() {
  const s = await getSettings();
  const site = await getPublicSite();
  return NextResponse.json({
    basic: {
      siteName: site.siteName,
      allowRegister: site.allowRegister,
    },
    // 注册页动态字段配置（off/optional/required）
    registerFields: site.registerFields,
    publish: s.publish,
    membership: s.membership,
  });
}
