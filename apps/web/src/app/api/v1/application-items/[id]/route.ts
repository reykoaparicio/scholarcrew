import { body, route } from "@/server/http";
import { updateApplicationItem } from "@scholarcrew/core/colleges";
import { ApplicationItemPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateApplicationItem(deps, actor, params.id, await body(req, ApplicationItemPatch)),
);
