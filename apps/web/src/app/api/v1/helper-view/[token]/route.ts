import { route } from "@/server/http";
import { resolveHelperToken } from "@scholarcrew/core/helpers";
import { getHelperView } from "@scholarcrew/core/helperview";
import { notFound } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No account: the token is the credential. Unknown, expired, and revoked links all look the same (404).
export const GET = route<{ token: string }>(
  { auth: "none", rate: { key: "helper-view", limit: 60, windowSeconds: 3600 } },
  async ({ deps, params }) => {
    const helper = await resolveHelperToken(deps, params.token);
    if (!helper) throw notFound("This link has expired or was turned off.");
    return getHelperView(deps, helper);
  },
);
