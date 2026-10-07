import { body, json, route } from "@/server/http";
import { addPlanItem } from "@scholarcrew/core/plan";
import { PlanItemInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addPlanItem(deps, actor, await body(req, PlanItemInput)), 201),
);
