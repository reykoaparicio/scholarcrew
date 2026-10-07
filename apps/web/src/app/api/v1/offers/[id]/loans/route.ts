import { route } from "@/server/http";
import { loanEstimates } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  loanEstimates(deps, actor, params.id),
);
