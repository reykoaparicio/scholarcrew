import { route } from "@/server/http";
import { getScholarship } from "@scholarcrew/core/scholarships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ idOrSlug: string }>({ auth: "optional" }, async ({ deps, actor, params }) =>
  getScholarship(deps, actor, params.idOrSlug),
);
