import { body, json, route, studentIdParam } from "@/server/http";
import { createOffer, listOffers } from "@scholarcrew/core/money";
import { CreateOfferInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listOffers(deps, actor, studentIdParam({ actor, url })),
);

// The award letter is uploaded first through POST /documents (plan 13); this enqueues offer.parse.
export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createOffer(deps, actor, await body(req, CreateOfferInput)), 201),
);
