import { body, json, route } from "@/server/http";
import { assertUser } from "@scholarcrew/core/access";
import { createFact, listFacts } from "@scholarcrew/core/memory";
import { FactInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => {
  assertUser(actor);
  return listFacts(deps, actor, actor.userId);
});

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await createFact(deps, actor, await body(req, FactInput)), 201),
);
