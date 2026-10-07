import { body, query, route } from "@/server/http";
import { listAidRules, upsertAidRule } from "@scholarcrew/core/admin";
import { AidRuleInput, AwardYear } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AwardYearFilter = z.object({ awardYear: AwardYear.optional() });

// Stored rows whose value doesn't parse as FederalLoanRates are skipped by the core.
export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listAidRules(deps, actor, query(url, AwardYearFilter)),
);

// Upserts on (awardYear, key) and stamps verifiedAt; audited as aid_rule_upserted.
export const PUT = route({ auth: "admin" }, async ({ deps, actor, req }) =>
  upsertAidRule(deps, actor, await body(req, AidRuleInput)),
);
