import { query, route } from "@/server/http";
import { searchAudit } from "@scholarcrew/core/admin";
import { AuditQueryParams } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  searchAudit(deps, actor, query(url, AuditQueryParams)),
);
