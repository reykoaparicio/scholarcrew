import { body, route } from "@/server/http";
import { checkStoryReuse } from "@scholarcrew/core/essays";
import { StoryReuseCheckInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  checkStoryReuse(deps, actor, await body(req, StoryReuseCheckInput)),
);
