import { route } from "@/server/http";
import { getMe } from "@scholarcrew/core/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => getMe(deps, actor));
