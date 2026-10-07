import { route } from "@/server/http";
import { deleteOffer, getOffer } from "@scholarcrew/core/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getOffer(deps, actor, params.id),
);

// R2P-8: removes a failed or unconfirmed letter (its lines cascade; the uploaded document stays). A confirmed
// offer is 409 conflict: it stays for comparisons and archives with the season (ME-07).
export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await deleteOffer(deps, actor, params.id);
});
