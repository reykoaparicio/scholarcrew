import { query, route } from "@/server/http";
import { listCatalogTasks } from "@scholarcrew/core/admin";
import { CatalogTaskKind, CatalogTaskStatus } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TaskFilter = z.object({ status: CatalogTaskStatus.optional(), kind: CatalogTaskKind.optional() });

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listCatalogTasks(deps, actor, query(url, TaskFilter)),
);
