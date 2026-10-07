import { body, json, route } from "@/server/http";
import { createConversation, listConversations } from "@scholarcrew/core/crew";
import { ConversationInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor }) => listConversations(deps, actor));

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createConversation(deps, actor, await body(req, ConversationInput)), 201),
);
