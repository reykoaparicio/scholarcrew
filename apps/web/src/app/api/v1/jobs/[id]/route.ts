import { route } from "@/server/http";
import { getJob } from "@scholarcrew/core/crew";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getJob(deps, actor, params.id),
);
