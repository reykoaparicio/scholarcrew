import { route } from "@/server/http";
import { revokeHelperLink } from "@scholarcrew/core/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await revokeHelperLink(deps, actor, params.id);
});
