import { body, json, route } from "@/server/http";
import { createApiToken, listApiTokens } from "@scholarcrew/core/apitokens";
import { ApiTokenInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listApiTokens(deps, actor));

/** The secret is in this response only; core stores its sha256. */
export const POST = route({ auth: "user" }, async ({ req, deps, actor }) =>
  json(await createApiToken(deps, actor, await body(req, ApiTokenInput)), 201),
);
