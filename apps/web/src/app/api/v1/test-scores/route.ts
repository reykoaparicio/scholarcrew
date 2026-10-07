import { body, json, route, studentIdParam } from "@/server/http";
import { addTestScore, listTestScores } from "@scholarcrew/core/prep";
import { TestScoreInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scores are owner-only in the core; anyone else gets 404.
export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listTestScores(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addTestScore(deps, actor, await body(req, TestScoreInput)), 201),
);
