import { body, json, route } from "@/server/http";
import { listVersions, saveVersion } from "@scholarcrew/core/essays";
import { SaveVersionInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) =>
  listVersions(deps, actor, params.id),
);

// A stale baseVersion is a 409 conflict from the core; the editor reloads and asks the student.
export const POST = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  json(await saveVersion(deps, actor, params.id, await body(req, SaveVersionInput)), 201),
);
