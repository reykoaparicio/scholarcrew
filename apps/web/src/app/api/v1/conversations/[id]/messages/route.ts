import { body, json, query, route } from "@/server/http";
import { getMessages, sendMessage } from "@scholarcrew/core/crew";
import { SendMessageInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params, url }) =>
  getMessages(
    deps,
    actor,
    params.id,
    query(url, z.object({ before: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).optional() })),
  ),
);

// Core checks crisis first, then the crew-send rate and monthly allowance. Crisis replies are free.
export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  json(await sendMessage(deps, actor, params.id, await body(req, SendMessageInput)), 202),
);
