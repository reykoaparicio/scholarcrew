import { query, route, studentIdParam } from "@/server/http";
import { getWeekPlan } from "@scholarcrew/core/plan";
import { IsoDate } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Non-strict, like studentIdParam's parser, so `week` and `studentId` share the query string.
const WeekParams = z.object({ week: IsoDate.optional() });

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) => {
  const { week } = query(url, WeekParams);
  return getWeekPlan(deps, actor, studentIdParam({ actor, url }), week);
});
