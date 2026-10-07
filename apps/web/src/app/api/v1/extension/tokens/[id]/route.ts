import { route } from "@/server/http";
import { revokeApiToken } from "@scholarcrew/core/apitokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await revokeApiToken(deps, actor, params.id);
});
