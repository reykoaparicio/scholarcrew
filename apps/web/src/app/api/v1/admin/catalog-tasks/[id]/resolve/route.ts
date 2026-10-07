import { body, route } from "@/server/http";
import { resolveCatalogTask } from "@scholarcrew/core/admin";
import { CatalogTaskResolution } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) =>
  resolveCatalogTask(deps, actor, params.id, await body(req, CatalogTaskResolution)),
);
