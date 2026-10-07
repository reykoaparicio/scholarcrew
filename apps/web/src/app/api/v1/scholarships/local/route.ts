import { body, json, route } from "@/server/http";
import { submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { LocalSubmissionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { auth: "user", rate: { key: "scholarships.local", limit: 10, windowSeconds: 86_400 } },
  async ({ deps, actor, req }) =>
    json(await submitLocalScholarship(deps, actor, await body(req, LocalSubmissionInput)), 201),
);
