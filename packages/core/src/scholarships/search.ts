import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  profiles,
  scholarshipApplications,
  scholarships,
  sql,
} from "@scholarcrew/db";
import {
  type Actor,
  type IsoDate,
  type Page,
  type ScholarshipDetail,
  type ScholarshipQuery,
  type ScholarshipSummary,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { CoreDeps } from "../shared";
import { escapeLike, isUuid } from "./common";
import { isStale, toApplication, toScholarship, toSummary } from "./mappers";

const area = scholarships.localArea;
export const deadlineOrder = [sql`${scholarships.deadline} asc nulls last`, asc(scholarships.name)];
export const noScamFlags = sql`cardinality(${scholarships.scamFlags}) = 0`;

/** Still open on `day`: no deadline, or a deadline on or after it (F-18-3). */
export function openOnWhere(day: IsoDate): SQL {
  return or(isNull(scholarships.deadline), gte(scholarships.deadline, day)) as SQL;
}

/**
 * A listing that may stay in an open plan for `ownerId` (R2P-4): no scam flags, and either a public
 * published or stale listing or `ownerId`'s own submission (draft, published, or stale). Pass a user id,
 * or a column such as `scholarshipApplications.ownerId` to check each application's own owner.
 */
export function liveListingWhere(ownerId: string | AnyPgColumn): SQL {
  return and(
    noScamFlags,
    or(
      and(eq(scholarships.visibility, "public"), inArray(scholarships.status, ["published", "stale"])),
      and(
        eq(scholarships.visibility, "submitter_only"),
        eq(scholarships.submittedById, ownerId),
        inArray(scholarships.status, ["draft", "published", "stale"]),
      ),
    ),
  ) as SQL;
}

/** Which listings an actor may see at all. */
export function visibleListingWhere(actor: Actor): SQL {
  const statuses: Array<"published" | "stale"> =
    actor.kind === "public" || actor.kind === "helper" ? ["published"] : ["published", "stale"];
  const listed = and(eq(scholarships.visibility, "public"), inArray(scholarships.status, statuses)) as SQL;
  if (actor.kind !== "user") return listed;
  const own = and(
    eq(scholarships.visibility, "submitter_only"),
    eq(scholarships.submittedById, actor.userId),
    inArray(scholarships.status, ["draft", "published", "stale"]),
  ) as SQL;
  return or(listed, own) as SQL;
}

export async function searchScholarships(
  deps: CoreDeps,
  actor: Actor,
  q: ScholarshipQuery,
): Promise<Page<ScholarshipSummary>> {
  const conds: SQL[] = [visibleListingWhere(actor)];
  if (q.excludeScams || actor.kind === "public") conds.push(noScamFlags);
  const text = q.q?.trim();
  if (text) {
    const like = `%${escapeLike(text)}%`;
    conds.push(or(ilike(scholarships.name, like), ilike(scholarships.provider, like)) as SQL);
  }
  if (q.state) conds.push(sql`${area}->>'state' = ${q.state}`);
  if (q.local) {
    if (actor.kind !== "user") throw invalidInput("Local search needs the student's profile; filter by state instead");
    const [p] = await deps.db
      .select({ state: profiles.state, county: profiles.county })
      .from(profiles)
      .where(eq(profiles.userId, actor.userId));
    if (p?.state) {
      conds.push(sql`coalesce((${area}->>'national')::boolean, false) = false`);
      conds.push(sql`${area}->>'state' = ${p.state}`);
      const noCounties = sql`coalesce(jsonb_array_length(${area}->'counties'), 0) = 0`;
      conds.push(
        p.county ? sql`(${noCounties} or ${area}->'counties' @> ${JSON.stringify([p.county])}::jsonb)` : noCounties,
      );
    }
  }
  if (q.renewable !== undefined) conds.push(eq(scholarships.renewable, q.renewable));
  if (q.minUsd !== undefined) conds.push(gte(scholarships.amountMaxUsd, q.minUsd));
  if (q.deadlineBefore) conds.push(lte(scholarships.deadline, q.deadlineBefore));
  if (q.openOn) conds.push(openOnWhere(q.openOn));
  const where = and(...conds);
  const [total] = await deps.db.select({ n: count() }).from(scholarships).where(where);
  const rows = await deps.db
    .select()
    .from(scholarships)
    .where(where)
    .orderBy(...deadlineOrder)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return { items: rows.map(toSummary), page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
}

export async function getScholarship(deps: CoreDeps, actor: Actor, idOrSlug: string): Promise<ScholarshipDetail> {
  const key = isUuid(idOrSlug) ? eq(scholarships.id, idOrSlug) : eq(scholarships.slug, idOrSlug);
  // Signed-out callers never get a scam-flagged listing, matching public search (R2P-19).
  const conds: SQL[] = [key, visibleListingWhere(actor)];
  if (actor.kind === "public") conds.push(noScamFlags);
  const [row] = await deps.db
    .select()
    .from(scholarships)
    .where(and(...conds));
  if (!row) throw notFound("Scholarship not found");
  // `application` is always the viewer's own row, so its reasons are the viewer's own (R2I-11a has nothing to strip here).
  let application: ScholarshipDetail["application"] = null;
  if (actor.kind === "user") {
    const [app] = await deps.db
      .select()
      .from(scholarshipApplications)
      .where(and(eq(scholarshipApplications.ownerId, actor.userId), eq(scholarshipApplications.scholarshipId, row.id)));
    application = app ? toApplication(app) : null;
  }
  return {
    ...toScholarship(row, actor.kind === "user" ? actor.userId : undefined),
    application,
    stale: isStale(row, deps.clock.now()),
  };
}
