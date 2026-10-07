import { route } from "@/server/http";
import { getCatalogTask } from "@scholarcrew/core/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// D36: the review page loads one task with its payload; unknown ids are 404.
export const GET = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, params }) =>
  getCatalogTask(deps, actor, params.id),
);
