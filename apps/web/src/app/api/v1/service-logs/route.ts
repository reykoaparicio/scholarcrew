import { body, json, route, studentIdParam } from "@/server/http";
import { addServiceLog, listServiceLogs } from "@scholarcrew/core/impact";
import { ServiceLogInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listServiceLogs(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addServiceLog(deps, actor, await body(req, ServiceLogInput)), 201),
);
