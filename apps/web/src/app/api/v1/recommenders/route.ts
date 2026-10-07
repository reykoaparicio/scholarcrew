import { body, json, route } from "@/server/http";
import { addRecommender, listRecommenders } from "@scholarcrew/core/colleges";
import { RecommenderInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listRecommenders(deps, actor));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addRecommender(deps, actor, await body(req, RecommenderInput)), 201),
);
