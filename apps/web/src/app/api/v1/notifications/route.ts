import { route } from "@/server/http";
import { listNotifications } from "@scholarcrew/core/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listNotifications(deps, actor));
