import { body, route } from "@/server/http";
import { forgetFact, updateFact } from "@scholarcrew/core/memory";
import { FactPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ req, deps, actor, params }) =>
  updateFact(deps, actor, params.id, await body(req, FactPatch)),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await forgetFact(deps, actor, params.id);
});
