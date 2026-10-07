import { body, route } from "@/server/http";
import { removeCollege, updateCollegeEntry } from "@scholarcrew/core/colleges";
import { CollegeListPatch } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, req, params }) =>
  updateCollegeEntry(deps, actor, params.id, await body(req, CollegeListPatch)),
);

export const DELETE = route<{ id: string }>({ auth: "user" }, async ({ deps, actor, params }) => {
  await removeCollege(deps, actor, params.id);
});
