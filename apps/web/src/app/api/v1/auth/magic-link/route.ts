import { PUBLIC_BODY_LIMIT, body, route } from "@/server/http";
import { requestMagicLink } from "@scholarcrew/core/auth";
import { MagicLinkRequest } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "none", csrf: true }, async ({ req, deps, ip }) => {
  const input = await body(req, MagicLinkRequest, PUBLIC_BODY_LIMIT);
  await requestMagicLink(deps, { email: input.email, ip });
});
