import { body, route } from "@/server/http";
import { updatePlanItem } from "@scholarcrew/core/plan";
import { PlanItemPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Not this week" is { weekStart: <next Monday> }; checking an item is { status: "done" }.
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updatePlanItem(deps, actor, params.id, await body(req, PlanItemPatch)),
);
