import { body, json, route } from "@/server/http";
import { createHelperLink, listHelperLinks } from "@scholarcrew/core/helpers";
import { HelperLinkInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listHelperLinks(deps, actor));

/** The URL (with the token) is in this response only; the list never includes it. */
export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await createHelperLink(deps, actor, await body(req, HelperLinkInput)), 201),
);
