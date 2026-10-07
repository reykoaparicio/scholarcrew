import { body, json, route } from "@/server/http";
import { assertUser } from "@scholarcrew/core/access";
import { listDecisions, recordDecision } from "@scholarcrew/core/memory";
import { DecisionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => {
  assertUser(actor);
  return listDecisions(deps, actor, actor.userId);
});

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await recordDecision(deps, actor, await body(req, DecisionInput)), 201),
);
