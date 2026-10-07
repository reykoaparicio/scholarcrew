import { json, route } from "@/server/http";
import { requestReview } from "@scholarcrew/core/essays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Counts toward the crew allowance; over the limit the core throws limit_reached (402).
export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  json(await requestReview(deps, actor, params.id), 202),
);
