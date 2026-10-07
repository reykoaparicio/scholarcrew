import { route } from "@/server/http";
import { getFamily } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** FamilyView, or null when the user isn't in a family. */
export const GET = route({ auth: "user" }, async ({ deps, actor }) => getFamily(deps, actor));
