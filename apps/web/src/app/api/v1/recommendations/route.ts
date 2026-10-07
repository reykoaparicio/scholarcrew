import { route } from "@/server/http";
import { listRecRequests } from "@scholarcrew/core/colleges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// D33: past requests, newest first. helperLinkId matches GET /helper-links; the URL itself is shown only at creation.
export const GET = route({ auth: "user" }, async ({ deps, actor }) => listRecRequests(deps, actor));
