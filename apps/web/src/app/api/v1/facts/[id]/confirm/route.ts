import { route } from "@/server/http";
import { confirmCandidate } from "@scholarcrew/core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  confirmCandidate(deps, actor, params.id),
);
