import { body, route } from "@/server/http";
import { updateOfferLine } from "@scholarcrew/core/money";
import { OfferLinePatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateOfferLine(deps, actor, params.id, await body(req, OfferLinePatch)),
);
