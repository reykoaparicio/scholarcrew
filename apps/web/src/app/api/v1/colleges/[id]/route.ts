import { route } from "@/server/http";
import { getCollege } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getCollege(deps, actor, params.id),
);
