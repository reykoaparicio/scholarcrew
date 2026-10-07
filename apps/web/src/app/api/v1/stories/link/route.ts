import { body, json, route } from "@/server/http";
import { linkStory } from "@scholarcrew/core/essays";
import { LinkStoryInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await linkStory(deps, actor, await body(req, LinkStoryInput)), 201),
);
