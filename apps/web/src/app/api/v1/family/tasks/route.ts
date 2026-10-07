import { route } from "@/server/http";
import { listTasks } from "@scholarcrew/core/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listTasks(deps, actor));
