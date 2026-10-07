import { route } from "@/server/http";
import { removeMember } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ userId: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await removeMember(deps, actor, params.userId);
});
