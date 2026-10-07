import { route } from "@/server/http";
import { confirmOffer } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  confirmOffer(deps, actor, params.id),
);
