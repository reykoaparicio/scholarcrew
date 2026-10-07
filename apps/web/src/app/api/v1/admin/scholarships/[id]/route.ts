import { body, route } from "@/server/http";
import { getScholarshipForAdmin, upsertScholarship } from "@scholarcrew/core/admin";
import { ScholarshipUpsertInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fieldsOf(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// D36: the editor loads drafts, flagged, and retired listings too (the public detail route hides them).
export const GET = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, params }) =>
  getScholarshipForAdmin(deps, actor, params.id),
);

// The full listing is sent on every edit; the path id wins over any id in the body.
export const PATCH = route<{ id: string }>({ auth: "admin" }, async ({ deps, actor, req, params }) => {
  const input = await body(
    req,
    z.preprocess((raw) => ({ ...fieldsOf(raw), id: params.id }), ScholarshipUpsertInput),
  );
  return upsertScholarship(deps, actor, input);
});
