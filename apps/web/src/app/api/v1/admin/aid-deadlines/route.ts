import { body, query, route } from "@/server/http";
import { listAidDeadlinesForAdmin, upsertAidDeadline } from "@scholarcrew/core/admin";
import { AidDeadlineInput, AwardYear } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AwardYearFilter = z.object({ awardYear: AwardYear.optional() });

// Ordered by award year, then deadline, then program.
export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listAidDeadlinesForAdmin(deps, actor, query(url, AwardYearFilter)),
);

// No `id` inserts; an `id` updates that row (unknown id is 404). Audited as aid_deadline_upserted.
export const PUT = route({ auth: "admin" }, async ({ deps, actor, req }) =>
  upsertAidDeadline(deps, actor, await body(req, AidDeadlineInput)),
);
