import type { MetadataRoute } from "next";
import { ADMIN_BASE } from "@/lib/admin-path";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/login", "/register", "/publish", ADMIN_BASE],
      },
    ],
    sitemap: base + "/sitemap.xml",
  };
}
