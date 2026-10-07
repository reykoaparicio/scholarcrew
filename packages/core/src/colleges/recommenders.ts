import {
  and,
  asc,
  collegeList,
  colleges,
  desc,
  eq,
  gte,
  helperLinks,
  isNull,
  recRequests,
  recommenders,
  scholarshipApplications,
  scholarships,
  sql,
  users,
} from "@scholarcrew/db";
import {
  type Actor,
  type RecRequest,
  type RecRequestInput,
  type RecRequestPatch,
  type Recommender,
  type RecommenderInput,
  conflict,
  notFound,
} from "@scholarcrew/domain";
import { assertOwner } from "../access";
import { createHelperLink } from "../helpers";
import { firstRow, requireUser } from "../scholarships/common";
import { type CoreDeps, requireUuid } from "../shared";
import { toRecRequest, toRecommender } from "./mappers";

export async function listRecommenders(deps: CoreDeps, actor: Actor): Promise<Recommender[]> {
  const user = requireUser(actor);
  const rows = await deps.db
    .select()
    .from(recommenders)
    .where(eq(recommenders.ownerId, user.userId))
    .orderBy(asc(recommenders.name));
  return rows.map(toRecommender);
}

/** The student's own recommendation requests, newest first (D33). */
export async function listRecRequests(deps: CoreDeps, actor: Actor): Promise<RecRequest[]> {
  const user = requireUser(actor);
  const rows = await deps.db
    .select()
    .from(recRequests)
    .where(eq(recRequests.ownerId, user.userId))
    .orderBy(desc(recRequests.updatedAt));
  return rows.map(toRecRequest);
}

export async function addRecommender(deps: CoreDeps, actor: Actor, i: RecommenderInput): Promise<Recommender> {
  const user = requireUser(actor);
  const row = firstRow(
    await deps.db
      .insert(recommenders)
      .values({
        ownerId: user.userId,
        name: i.name.trim(),
        email: i.email.trim().toLowerCase(),
        relationship: i.relationship,
      })
      .returning(),
    "recommender",
  );
  return toRecommender(row);
}

export async function requestRecommendation(deps: CoreDeps, actor: Actor, i: RecRequestInput): Promise<RecRequest> {
  const user = requireUser(actor);
  const [rec] = await deps.db
    .select()
    .from(recommenders)
    .where(and(eq(recommenders.id, i.recommenderId), eq(recommenders.ownerId, user.userId)));
  if (!rec) throw notFound("Recommender not found");
  const targets: string[] = [];
  if (i.collegeListId) {
    const [entry] = await deps.db
      .select({ name: colleges.name })
      .from(collegeList)
      .innerJoin(colleges, eq(colleges.id, collegeList.collegeId))
      .where(and(eq(collegeList.id, i.collegeListId), eq(collegeList.ownerId, user.userId)));
    if (!entry) throw notFound("College list entry not found");
    targets.push(entry.name);
  }
  if (i.scholarshipApplicationId) {
    const [app] = await deps.db
      .select({ name: scholarships.name })
      .from(scholarshipApplications)
      .innerJoin(scholarships, eq(scholarships.id, scholarshipApplications.scholarshipId))
      .where(
        and(
          eq(scholarshipApplications.id, i.scholarshipApplicationId),
          eq(scholarshipApplications.ownerId, user.userId),
        ),
      );
    if (!app) throw notFound("Scholarship application not found");
    targets.push(app.name);
  }
  const [me] = await deps.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, user.userId));
  const studentName = me?.displayName.trim() || "A student";

  const now = deps.clock.now();
  const { link, row } = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rec-request:${user.userId}:${rec.id}`}))`);
    const [duplicate] = await tx
      .select({ id: recRequests.id })
      .from(recRequests)
      .where(
        and(
          eq(recRequests.ownerId, user.userId),
          eq(recRequests.recommenderId, rec.id),
          i.collegeListId ? eq(recRequests.collegeListId, i.collegeListId) : isNull(recRequests.collegeListId),
          i.scholarshipApplicationId
            ? eq(recRequests.scholarshipApplicationId, i.scholarshipApplicationId)
            : isNull(recRequests.scholarshipApplicationId),
          eq(recRequests.status, "requested"),
          gte(recRequests.requestedAt, new Date(now.getTime() - 86_400_000)),
        ),
      );
    if (duplicate) throw conflict(`You already asked ${rec.name} for this one.`);
    const link = await createHelperLink({ ...deps, db: tx as CoreDeps["db"] }, user, {
      label: `Recommendation for ${rec.name}`.slice(0, 80),
      helperRole: "recommender",
      scope: ["activities", "stories"],
      expiresInDays: 30,
    });
    const row = firstRow(
      await tx
        .insert(recRequests)
        .values({
          ownerId: user.userId,
          recommenderId: rec.id,
          collegeListId: i.collegeListId,
          scholarshipApplicationId: i.scholarshipApplicationId,
          helperLinkId: link.link.id,
          message: i.message.trim(),
          status: "requested",
          requestedAt: now,
          updatedAt: now,
        })
        .returning(),
      "rec request",
    );
    return { link, row };
  });
  const lines = [
    `Hi ${rec.name},`,
    "",
    `${studentName} asked you for a letter of recommendation${targets.length > 0 ? ` for ${targets.join(" and ")}` : ""}.`,
  ];
  if (i.message.trim()) lines.push("", "Their note:", i.message.trim());
  lines.push(
    "",
    "Brag sheet (their activities and the stories they chose to share):",
    link.url,
    "",
    "The link works for 30 days and doesn't need an account.",
    "",
    "ScholarCrew",
  );
  try {
    await deps.email.send({
      to: rec.email,
      subject: `${studentName} asked you for a recommendation`,
      text: lines.join("\n"),
    });
  } catch (error) {
    await deps.db.transaction(async (tx) => {
      await tx
        .update(helperLinks)
        .set({ revokedAt: deps.clock.now() })
        .where(and(eq(helperLinks.id, link.link.id), eq(helperLinks.studentId, user.userId)));
      await tx.delete(recRequests).where(and(eq(recRequests.id, row.id), eq(recRequests.ownerId, user.userId)));
    });
    throw error;
  }
  return toRecRequest(row);
}

/** The student records what the recommender did after the request went out (CO-07, R2P-11). Owner only. */
export async function updateRecRequest(
  deps: CoreDeps,
  actor: Actor,
  id: string,
  p: RecRequestPatch,
): Promise<RecRequest> {
  requireUser(actor);
  requireUuid(id, "Recommendation request not found");
  const [found] = await deps.db
    .select({ ownerId: recRequests.ownerId })
    .from(recRequests)
    .where(eq(recRequests.id, id));
  if (!found) throw notFound("Recommendation request not found");
  assertOwner(actor, found.ownerId);
  const row = firstRow(
    await deps.db
      .update(recRequests)
      .set({ status: p.status, updatedAt: deps.clock.now() })
      .where(and(eq(recRequests.id, id), eq(recRequests.ownerId, found.ownerId)))
      .returning(),
    "rec request",
  );
  return toRecRequest(row);
}
