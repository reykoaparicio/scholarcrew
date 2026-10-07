import { body, json, route } from "@/server/http";
import { acceptStudyPlan } from "@scholarcrew/core/prep";
import { StudyPlanInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await acceptStudyPlan(deps, actor, await body(req, StudyPlanInput)), 201),
);
