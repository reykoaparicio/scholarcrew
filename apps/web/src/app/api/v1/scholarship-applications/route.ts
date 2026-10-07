import { body, json, route, studentIdParam } from "@/server/http";
import { getBoard, saveScholarship } from "@scholarcrew/core/scholarships";
import { Id } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveInput = z.strictObject({ scholarshipId: Id });

export const GET = route({ auth: "user" }, async ({ deps, actor, url }) =>
  getBoard(deps, actor, studentIdParam({ actor, url })),
);

export const POST = route({ auth: "user" }, async ({ deps, actor, req }) =>
  json(await saveScholarship(deps, actor, await body(req, SaveInput)), 201),
);
