import { body, route } from "@/server/http";
import { getScholarship, reportListing } from "@scholarcrew/core/scholarships";
import { ReportInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withPathId(raw: unknown, scholarshipId: string): Record<string, unknown> {
  const fields = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { ...fields, scholarshipId };
}

// The segment is [idOrSlug] (it shares the level with the detail route), so a slug resolves to its id first.
// A listing the caller can't see is 404 here, the same as on the detail page.
export const POST = route<{ idOrSlug: string }>({ auth: "user" }, async ({ deps, actor, req, params }) => {
  const listing = await getScholarship(deps, actor, params.idOrSlug);
  const input = await body(
    req,
    z.preprocess((raw) => withPathId(raw, listing.id), ReportInput),
  );
  await reportListing(deps, actor, input);
});
