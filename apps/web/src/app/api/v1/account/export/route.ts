import { json, route } from "@/server/http";
import { requestExport } from "@scholarcrew/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { auth: "user", rate: { key: "account.export", limit: 5, windowSeconds: 86_400 } },
  async ({ deps, actor }) => json(await requestExport(deps, actor), 201),
);
