import { route } from "@/server/http";
import { rejectCandidate } from "@scholarcrew/core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  rejectCandidate(deps, actor, params.id),
);
