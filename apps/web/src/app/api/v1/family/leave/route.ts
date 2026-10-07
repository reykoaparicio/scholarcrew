import { route } from "@/server/http";
import { leaveFamily } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => {
  await leaveFamily(deps, actor);
});
