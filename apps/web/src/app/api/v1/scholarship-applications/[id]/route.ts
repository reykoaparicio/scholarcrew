import { body, route } from "@/server/http";
import { updateApplication } from "@scholarcrew/core/scholarships";
import { ApplicationPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateApplication(deps, actor, params.id, await body(req, ApplicationPatch)),
);
