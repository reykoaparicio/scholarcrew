import { route } from "@/server/http";
import { requestVerification } from "@scholarcrew/core/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(
  { auth: "user", rate: { key: "service-logs.verify", limit: 10, windowSeconds: 86_400 } },
  async ({ deps, actor, params }) => requestVerification(deps, actor, params.id),
);
