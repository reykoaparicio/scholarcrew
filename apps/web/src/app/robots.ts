import { buildRobots } from "@/components/public/seo";
import { getDeps } from "@/server/deps";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getDeps().config.appUrl);
}
