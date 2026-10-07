import { body, route } from "@/server/http";
import { archiveStory, updateStory } from "@scholarcrew/core/essays";
import { StoryPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateStory(deps, actor, params.id, await body(req, StoryPatch)),
);

// DELETE archives (ES-05): the story leaves the bank but past uses stay on record.
export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await archiveStory(deps, actor, params.id);
});
