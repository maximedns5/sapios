import type { MetadataRoute } from "next";
import { SITE, SITE_URL } from "@/lib/site";

// Pages publiques indexables. Les textes légaux n'y entrent qu'une fois validés par le juriste
// (NEXT_PUBLIC_LEGAL_PAGES_READY) : avant, ils sont marqués « noindex ».
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL) return [];
  const paths = [
    "/",
    "/comment-nous-classons",
    "/contact",
    ...(SITE.legalPagesReady ? ["/cgu", "/conditions-recruteurs", "/confidentialite", "/mentions-legales"] : []),
  ];
  return paths.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
