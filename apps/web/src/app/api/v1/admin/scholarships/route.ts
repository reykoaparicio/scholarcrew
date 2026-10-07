import { body, json, query, route } from "@/server/http";
import { listScholarships, upsertScholarship } from "@scholarcrew/core/admin";
import { CatalogStatus, ScholarshipUpsertInput } from "@scholarcrew/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fieldsOf(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// D36: every listing in any status, 50 per page, newest edit first; `q` matches name, provider, or slug.
const ListingFilter = z.object({
  status: CatalogStatus.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const GET = route({ auth: "admin" }, async ({ deps, actor, url }) =>
  listScholarships(deps, actor, query(url, ListingFilter)),
);

// POST always creates: any id in the body is replaced with null. Edits go through PATCH /admin/scholarships/:id.
const CreateListing = z.preprocess((raw) => ({ ...fieldsOf(raw), id: null }), ScholarshipUpsertInput);

export const POST = route({ auth: "admin" }, async ({ deps, actor, req }) =>
  json(await upsertScholarship(deps, actor, await body(req, CreateListing)), 201),
);
