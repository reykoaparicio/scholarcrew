import { body, route } from "@/server/http";
import { acceptInvite } from "@scholarcrew/core/family";
import { AcceptInviteInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  acceptInvite(deps, actor, await body(req, AcceptInviteInput)),
);
