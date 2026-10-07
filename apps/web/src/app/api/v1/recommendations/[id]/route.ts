import { body, route } from "@/server/http";
import { updateRecRequest } from "@scholarcrew/core/colleges";
import { RecRequestPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R2P-11 (CO-07): the student marks a letter agreed, submitted, or declined. `requested` is set only at creation,
// so RecRequestPatch refuses it (400); another student's id is 404.
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateRecRequest(deps, actor, params.id, await body(req, RecRequestPatch)),
);
