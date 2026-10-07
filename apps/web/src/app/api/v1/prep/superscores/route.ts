import { route, studentIdParam } from "@/server/http";
import { getSuperscores } from "@scholarcrew/core/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getSuperscores(deps, actor, studentIdParam({ actor, url })),
);
