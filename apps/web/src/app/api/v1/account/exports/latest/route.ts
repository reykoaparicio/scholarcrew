import { route } from "@/server/http";
import { latestExport } from "@scholarcrew/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** D27: Settings shows the newest export that hasn't expired (any status), or null. */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => latestExport(deps, actor));
