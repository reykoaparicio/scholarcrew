import { route, studentIdParam } from "@/server/http";
import { getRequirementProgress } from "@scholarcrew/core/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getRequirementProgress(deps, actor, studentIdParam({ actor, url })),
);
