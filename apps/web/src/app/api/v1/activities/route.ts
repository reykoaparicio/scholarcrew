import { body, route, studentIdParam } from "@/server/http";
import { listActivities, upsertActivity } from "@scholarcrew/core/impact";
import { ActivityInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listActivities(deps, actor, studentIdParam({ actor, url })),
);

// PUT upserts by (owner, position): position 1..10 is the slot on the Common App list.
export const PUT = route({ auth: "user" }, async ({ deps, actor, req }) =>
  upsertActivity(deps, actor, await body(req, ActivityInput)),
);
