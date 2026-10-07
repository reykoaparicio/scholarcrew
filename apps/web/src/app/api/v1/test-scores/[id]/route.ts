import { route } from "@/server/http";
import { deleteTestScore } from "@scholarcrew/core/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteTestScore(deps, actor, params.id);
});
