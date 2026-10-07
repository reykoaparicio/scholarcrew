import { buildSitemap, collectSitemapListings } from "@/components/public/seo";
import { getDeps } from "@/server/deps";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const deps = getDeps();
  return buildSitemap(deps.config.appUrl, await collectSitemapListings(deps));
}
