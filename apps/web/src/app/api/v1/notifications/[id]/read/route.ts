import { route } from "@/server/http";
import { markRead } from "@scholarcrew/core/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await markRead(deps, actor, params.id);
});
