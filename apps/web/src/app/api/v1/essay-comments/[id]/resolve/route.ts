import { route } from "@/server/http";
import { resolveComment } from "@scholarcrew/core/essays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await resolveComment(deps, actor, params.id);
});
