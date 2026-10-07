import { json, route } from "@/server/http";
import { requestAppealOutline } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  json(await requestAppealOutline(deps, actor, params.id), 202),
);
