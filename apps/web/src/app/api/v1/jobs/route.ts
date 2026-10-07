import { query, route } from "@/server/http";
import { listJobs } from "@scholarcrew/core/crew";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// D28: the crew panel's background job list. active=1 keeps queued and working jobs; core defaults limit to 20.
const JobsQuery = z.object({
  active: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listJobs(deps, actor, query(url, JobsQuery)),
);
