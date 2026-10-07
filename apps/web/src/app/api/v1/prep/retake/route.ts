import { body, json, route } from "@/server/http";
import { requestRetakeAnalysis } from "@scholarcrew/core/prep";
import { RetakeAnalysisInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await requestRetakeAnalysis(deps, actor, await body(req, RetakeAnalysisInput)), 202),
);
