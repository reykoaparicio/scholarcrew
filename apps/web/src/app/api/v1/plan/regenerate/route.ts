import { json, route } from "@/server/http";
import { requestWeeklyPlan } from "@scholarcrew/core/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 16's "Plan my week" button (R2C-5). The payload has no `source`, so the worker counts it as a "user" plan against
// the monthly allowance; the Monday `plan.weekly.fanout` starts system plans through 08 `startWeeklyPlan`, which don't count.
export const POST = route({ auth: "user" }, async ({ deps, actor }) => json(await requestWeeklyPlan(deps, actor), 202));
