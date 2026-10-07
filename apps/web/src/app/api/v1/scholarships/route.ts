import { query, route } from "@/server/http";
import { searchScholarships } from "@scholarcrew/core/scholarships";
import { ScholarshipQueryParams } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed-out visitors get the public actor and see published public listings only. Every ScholarshipQueryParams
// field passes straight through, including `openOn` (keep listings still open on that date; F-18-3).
export const GET = route({ auth: "optional" }, async ({ deps, actor, url }) =>
  searchScholarships(deps, actor, query(url, ScholarshipQueryParams)),
);
