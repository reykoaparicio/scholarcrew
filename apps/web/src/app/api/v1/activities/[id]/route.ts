import { route } from "@/server/http";
import { deleteActivity } from "@scholarcrew/core/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, params, actor }) => {
  await deleteActivity(deps, actor, params.id);
});
