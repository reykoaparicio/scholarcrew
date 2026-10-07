import { body, route } from "@/server/http";
import { shareIncomeRangeToStudent } from "@scholarcrew/core/memory";
import { ShareIncomeInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) => {
  await shareIncomeRangeToStudent(deps, actor, await body(req, ShareIncomeInput));
});
