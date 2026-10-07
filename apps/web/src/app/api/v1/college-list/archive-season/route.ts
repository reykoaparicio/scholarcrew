import { route } from "@/server/http";
import { archiveSeason } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => archiveSeason(deps, actor));
