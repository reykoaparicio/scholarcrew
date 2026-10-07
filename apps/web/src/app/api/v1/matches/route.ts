import { route, studentIdParam } from "@/server/http";
import { listMatches } from "@scholarcrew/core/scholarships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listMatches(deps, actor, studentIdParam({ actor, url })),
);
