import { body, json, route, studentIdParam } from "@/server/http";
import { createStory, listStories } from "@scholarcrew/core/essays";
import { StoryInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  listStories(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await createStory(deps, actor, await body(req, StoryInput)), 201),
);
