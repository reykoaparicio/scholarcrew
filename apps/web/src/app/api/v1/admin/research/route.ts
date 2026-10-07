import { body, route } from "@/server/http";
import { enqueueResearch } from "@scholarcrew/core/admin";
import { ResearchInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "admin" }, async ({ deps, actor, req }) => {
  await enqueueResearch(deps, actor, await body(req, ResearchInput));
});
