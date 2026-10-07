import { route } from "@/server/http";
import { revokeInvite } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await revokeInvite(deps, actor, params.id);
});
