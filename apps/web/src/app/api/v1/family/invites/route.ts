import { body, route } from "@/server/http";
import { invite } from "@scholarcrew/core/family";
import { InviteInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InviteBody = InviteInput;

export const POST = route(
  { auth: "user", rate: { key: "family.invite", limit: 20, windowSeconds: 86_400 } },
  async ({ req, deps, actor }) => {
    await invite(deps, actor, await body(req, InviteBody));
  },
);
