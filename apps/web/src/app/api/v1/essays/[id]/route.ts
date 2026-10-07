import { body, route } from "@/server/http";
import { getEssay, updateEssay } from "@scholarcrew/core/essays";
import { EssayPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  getEssay(deps, actor, params.id),
);

// R2P-14: owner edits to title, prompt, or status (drafting, ready, submitted); versions are untouched.
// EssayPatch refuses an empty object, so `{}` is 400.
export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateEssay(deps, actor, params.id, await body(req, EssayPatch)),
);
