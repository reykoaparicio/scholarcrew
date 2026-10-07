import { route, studentIdParam } from "@/server/http";
import { listAidDeadlines } from "@scholarcrew/core/aid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listAidDeadlines(deps, actor, studentIdParam({ actor, url })),
);
