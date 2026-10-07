import { body, json, route, studentIdParam } from "@/server/http";
import { createEssay, listEssays } from "@scholarcrew/core/essays";
import { EssayInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listEssays(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createEssay(deps, actor, await body(req, EssayInput)), 201),
);
