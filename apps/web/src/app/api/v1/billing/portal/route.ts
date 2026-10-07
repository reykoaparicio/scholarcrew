import { route } from "@/server/http";
import { createPortal } from "@scholarcrew/core/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor }) => createPortal(deps, actor));
