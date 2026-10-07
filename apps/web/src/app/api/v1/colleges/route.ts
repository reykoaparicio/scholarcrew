import { query, route } from "@/server/http";
import { searchColleges } from "@scholarcrew/core/colleges";
import { CollegeQueryParams } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  searchColleges(deps, actor, query(url, CollegeQueryParams)),
);
