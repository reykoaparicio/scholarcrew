import { body, route } from "@/server/http";
import { deleteServiceLog, updateServiceLog } from "@scholarcrew/core/impact";
import { ServiceLogPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateServiceLog(deps, actor, params.id, await body(req, ServiceLogPatch)),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteServiceLog(deps, actor, params.id);
});
