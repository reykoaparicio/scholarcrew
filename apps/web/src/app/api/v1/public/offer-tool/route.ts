import { PUBLIC_BODY_LIMIT, body, route } from "@/server/http";
import { publicOfferTool } from "@scholarcrew/core/money";
import { PublicOfferInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MO-11: no login, no storage, no model. Pure Ledger math behind a per-IP limit (SE-04) and the public body cap.
export const POST = route(
  { auth: "none", rate: { key: "offer-tool", limit: 30, windowSeconds: 3600 } },
  async ({ req }) => publicOfferTool(await body(req, PublicOfferInput, PUBLIC_BODY_LIMIT)),
);
