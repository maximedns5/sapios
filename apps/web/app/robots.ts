import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Le site public est indexable ; l'espace recruteur et le back-office ne le sont pas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/recruteur"] }],
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL } : {}),
  };
}
