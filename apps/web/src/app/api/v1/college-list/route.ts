import { body, json, route, studentIdParam } from "@/server/http";
import { addCollege, getCollegeList } from "@scholarcrew/core/colleges";
import { CollegeListInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getCollegeList(deps, actor, studentIdParam({ actor, url })),
);

// Over MAX_COLLEGE_LIST the core throws invalid_input with a readable message (D5); the route passes it through.
export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await addCollege(deps, actor, await body(req, CollegeListInput)), 201),
);
