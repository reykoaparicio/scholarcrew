import { body, route } from "@/server/http";
import { updateTask } from "@scholarcrew/core/family";
import { FamilyTaskPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ req, deps, actor, params }) =>
  updateTask(deps, actor, params.id, await body(req, FamilyTaskPatch)),
);
