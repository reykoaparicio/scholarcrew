import { query, route } from "@/server/http";
import { listReports } from "@scholarcrew/core/admin";
import { ReportStatus } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReportFilter = z.object({ status: ReportStatus.optional() });

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listReports(deps, actor, query(url, ReportFilter).status),
);
