import { body, route } from "@/server/http";
import { updateAidItem } from "@scholarcrew/core/aid";
import { AidChecklistPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The core lets the student update any item and a family parent update items assigned to "parent".
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateAidItem(deps, actor, params.id, await body(req, AidChecklistPatch)),
);
