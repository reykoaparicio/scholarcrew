import { route, studentIdParam } from "@/server/http";
import { getThisWeek } from "@scholarcrew/core/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parents need the deadlines share; the gap and sweep cards appear only with costs and scholarships shares.
export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getThisWeek(deps, actor, studentIdParam({ actor, url })),
);
