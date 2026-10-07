import { body, route } from "@/server/http";
import { resolveReport } from "@scholarcrew/core/admin";
import { ResolveReportInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) =>
  resolveReport(deps, actor, params.id, await body(req, ResolveReportInput)),
);
