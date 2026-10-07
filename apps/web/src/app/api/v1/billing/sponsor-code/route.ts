import { body, route } from "@/server/http";
import { redeemSponsorCode } from "@scholarcrew/core/billing";
import { SponsorCodeInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { auth: "user", rate: { key: "billing.sponsor", limit: 10, windowSeconds: 3600 } },
  async ({ req, deps, actor }) => {
    const { code } = await body(req, SponsorCodeInput);
    return redeemSponsorCode(deps, actor, code);
  },
);
