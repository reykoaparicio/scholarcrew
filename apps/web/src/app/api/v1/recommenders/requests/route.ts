import { body, json, route } from "@/server/http";
import { requestRecommendation } from "@scholarcrew/core/colleges";
import { RecRequestInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { auth: "user", rate: { key: "recommenders.request", limit: 10, windowSeconds: 86_400 } },
  async ({ deps, actor, req }) => json(await requestRecommendation(deps, actor, await body(req, RecRequestInput)), 201),
);
