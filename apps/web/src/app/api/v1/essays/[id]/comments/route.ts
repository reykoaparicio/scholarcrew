import { route } from "@/server/http";
import { listComments } from "@scholarcrew/core/essays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  listComments(deps, actor, params.id),
);
