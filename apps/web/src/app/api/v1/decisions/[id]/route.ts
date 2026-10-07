import { route } from "@/server/http";
import { deleteDecision } from "@scholarcrew/core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteDecision(deps, actor, params.id);
});
