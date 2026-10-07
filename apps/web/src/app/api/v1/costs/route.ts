import { route, studentIdParam } from "@/server/http";
import { getCosts } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getCosts(deps, actor, studentIdParam({ actor, url })),
);
