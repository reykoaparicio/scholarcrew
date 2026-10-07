import { route, studentIdParam } from "@/server/http";
import { compareMyOffers } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  compareMyOffers(deps, actor, studentIdParam({ actor, url })),
);
