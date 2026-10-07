import { body, route } from "@/server/http";
import { getBudget, setBudget } from "@scholarcrew/core/family";
import { FamilyBudgetInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** FamilyBudget, or null before a parent shares one. */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => getBudget(deps, actor));

export const PUT = route({ auth: "user" }, async ({ req, deps, actor }) =>
  setBudget(deps, actor, await body(req, FamilyBudgetInput)),
);
