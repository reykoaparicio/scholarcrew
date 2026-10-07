import { randomUUID } from "node:crypto";
import {
  agentRuns,
  and,
  apiTokens,
  auditEvents,
  blobs,
  catalogTasks,
  conversations,
  count,
  crewJobs,
  documents,
  eq,
  exportsTable,
  families,
  familyBudgets,
  familyInvites,
  familyMembers,
  familyTasks,
  helperLinks,
  inArray,
  isNotNull,
  isNull,
  lt,
  magicLinks,
  messages,
  or,
  rateLimits,
  scholarships,
  sensitiveFacts,
  sessions,
  shareSettings,
  sql,
  stripeEvents,
  subscriptions,
  users,
} from "@scholarcrew/db";
import type { Actor } from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { ownSubscription } from "../billing/plans";
import { type CoreDeps, addDays, addMinutes } from "../shared";

/** The purge runs daily (05 `account.purge`, 03:30 UTC), so 6 days here means gone within 7 (ID-05, R2I-17). */
const PURGE_AFTER_DAYS = 6;
const MAGIC_LINK_RETENTION_DAYS = 1;
/** Blobs younger than this may belong to an upload or export that hasn't committed its row yet. */
const ORPHAN_GRACE_MINUTES = 60;

/**
 * ID-05: cancels every non-canceled Stripe subscription first (so billing stops), then blocks the account at once
 * (status, sessions, API tokens, helper links) and removes it from its family: family-room conversations
 * it owns, its messages in other members' family rooms with the crew replies and jobs they started, its
 * family tasks, and the invites it sent that are still open (R2I-4). A family with no student left is
 * deleted. Rows are hard-deleted by purgeDeletedAccounts.
 */
export async function deleteAccount(deps: CoreDeps, actor: Actor): Promise<void> {
  assertUser(actor);
  const now = deps.clock.now();
  const userId = actor.userId;
  const own = await ownSubscription(deps.db, userId);
  const stripeSubscriptionId = own?.stripeSubscriptionId && own.status !== "canceled" ? own.stripeSubscriptionId : null;
  if (stripeSubscriptionId && !deps.stripe) throw new Error("Stripe gateway required to cancel subscription");
  if (stripeSubscriptionId && deps.stripe) await deps.stripe.cancelSubscription(stripeSubscriptionId);
  await deps.db.transaction(async (tx) => {
    await tx.update(users).set({ status: "deleted", deletedAt: now }).where(eq(users.id, userId));
    await tx
      .update(crewJobs)
      .set({ status: "failed", error: "Account deleted", leaseToken: null, leaseExpiresAt: null, updatedAt: now })
      .where(and(eq(crewJobs.ownerId, userId), inArray(crewJobs.status, ["queued", "working"])));
    if (own && stripeSubscriptionId) {
      await tx.update(subscriptions).set({ status: "canceled", updatedAt: now }).where(eq(subscriptions.id, own.id));
    }
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(apiTokens)
      .set({ revokedAt: now })
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
    await tx
      .update(helperLinks)
      .set({ revokedAt: now })
      .where(and(eq(helperLinks.studentId, userId), isNull(helperLinks.revokedAt)));
    const memberships = await tx
      .select({ familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId));
    const familyIds = memberships.map((m) => m.familyId);
    if (familyIds.length > 0) {
      const authored = await tx
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(and(eq(messages.authorUserId, userId), inArray(conversations.familyId, familyIds)));
      const messageIds = authored.map((m) => m.id);
      if (messageIds.length > 0) {
        const jobs = await tx
          .select({ id: crewJobs.id, resultMessageId: crewJobs.resultMessageId })
          .from(crewJobs)
          .where(inArray(crewJobs.requestMessageId, messageIds));
        const replyIds = jobs.map((j) => j.resultMessageId).filter((id): id is string => id !== null);
        if (replyIds.length > 0) await tx.delete(messages).where(inArray(messages.id, replyIds));
        if (jobs.length > 0)
          await tx.delete(crewJobs).where(
            inArray(
              crewJobs.id,
              jobs.map((j) => j.id),
            ),
          );
        await tx.delete(messages).where(inArray(messages.id, messageIds));
      }
    }
    await tx.delete(familyTasks).where(or(eq(familyTasks.assigneeId, userId), eq(familyTasks.studentId, userId)));
    await tx.delete(familyInvites).where(and(eq(familyInvites.invitedById, userId), isNull(familyInvites.acceptedAt)));
    await tx.delete(conversations).where(and(eq(conversations.ownerId, userId), isNotNull(conversations.familyId)));
    await tx.delete(shareSettings).where(eq(shareSettings.studentId, userId));
    await tx.delete(familyBudgets).where(eq(familyBudgets.sharedById, userId));
    await tx.delete(familyMembers).where(eq(familyMembers.userId, userId));
    for (const familyId of familyIds) {
      const [students] = await tx
        .select({ n: count() })
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "student")));
      if ((students?.n ?? 0) === 0) await tx.delete(families).where(eq(families.id, familyId));
    }
  });
  if (own && stripeSubscriptionId) {
    await recordAudit(deps, {
      actor,
      action: "subscription_canceled",
      entityType: "subscription",
      entityId: own.id,
      meta: { stripeSubscriptionId },
    });
  }
  await recordAudit(deps, { actor, action: "account_deleted", entityType: "user", entityId: userId });
}

async function deleteOrphanBlobs(deps: CoreDeps, now: Date): Promise<number> {
  const cutoff = addMinutes(now, -ORPHAN_GRACE_MINUTES).toISOString();
  const removed = await deps.db
    .delete(blobs)
    .where(
      sql`${blobs.createdAt} < ${cutoff}::timestamptz
        and not exists (select 1 from ${documents} where ${documents.blobId} = ${blobs.id})
        and not exists (select 1 from ${exportsTable} where ${exportsTable.blobId} = ${blobs.id})`,
    )
    .returning({ id: blobs.id });
  return removed.length;
}

/**
 * System only (account.purge job). Deleted accounts and blocked under-13 accounts (the age gate sets
 * deletedAt) go 6 days after deletedAt; owned rows cascade from users. Nothing is kept (R2I-17): rows
 * keyed by the email (magic links, open invites, the sign-in rate-limit counter) go too, and
 * unreferenced blobs after.
 */
export async function purgeDeletedAccounts(deps: CoreDeps, system: Actor): Promise<number> {
  assertSystem(system);
  const now = deps.clock.now();
  const candidates = await deps.db
    .select()
    .from(users)
    .where(
      and(inArray(users.status, ["deleted", "blocked_underage"]), lt(users.deletedAt, addDays(now, -PURGE_AFTER_DAYS))),
    );
  let purged = 0;
  for (const user of candidates) {
    const own = await ownSubscription(deps.db, user.id);
    if (own?.stripeSubscriptionId && own.status !== "canceled") {
      try {
        if (!deps.stripe) throw new Error("Billing gateway missing");
        await deps.stripe.cancelSubscription(own.stripeSubscriptionId);
      } catch {
        console.error("purge.stripe_cancel_failed", { userId: user.id });
        continue;
      }
    }
    await deps.db.transaction(async (tx) => {
      const id = user.id;
      await tx
        .delete(auditEvents)
        .where(
          and(
            or(eq(auditEvents.entityId, id), sql`${auditEvents.entityId} like ${`${id}:%`}`),
            inArray(auditEvents.action, ["sensitive_facts_changed", "sensitive_fact_updated", "income_range_shared"]),
          ),
        );
      const anonymousId = randomUUID();
      await tx.update(auditEvents).set({ actorId: anonymousId }).where(eq(auditEvents.actorId, id));
      await tx
        .update(auditEvents)
        .set({ entityId: "anonymous", meta: {} })
        .where(or(eq(auditEvents.entityId, id), sql`${auditEvents.entityId} like ${`${id}:%`}`));
      await tx.update(agentRuns).set({ userId: anonymousId }).where(eq(agentRuns.userId, id));
      await tx.update(messages).set({ authorUserId: null }).where(eq(messages.authorUserId, id));
      await tx.update(sensitiveFacts).set({ sharedByUserId: null }).where(eq(sensitiveFacts.sharedByUserId, id));
      await tx.update(catalogTasks).set({ createdById: null }).where(eq(catalogTasks.createdById, id));
      await tx.update(catalogTasks).set({ resolvedById: null }).where(eq(catalogTasks.resolvedById, id));
      await tx
        .delete(scholarships)
        .where(and(eq(scholarships.submittedById, id), eq(scholarships.visibility, "submitter_only")));
      await tx
        .delete(catalogTasks)
        .where(
          and(
            eq(catalogTasks.kind, "user_submission"),
            inArray(catalogTasks.status, ["open", "in_review"]),
            sql`${catalogTasks.payload}->>'submittedById' = ${id}`,
          ),
        );
      await tx.execute(
        sql`update ${catalogTasks} set payload = payload || '{"submittedById":null,"notes":""}'::jsonb where payload->>'submittedById' = ${id}`,
      );
      await tx.delete(magicLinks).where(eq(magicLinks.email, user.email));
      await tx.delete(familyInvites).where(eq(familyInvites.email, user.email));
      await tx.delete(rateLimits).where(eq(rateLimits.key, `ml:email:${user.email}`));
      await tx.delete(users).where(eq(users.id, id));
    });
    purged += 1;
  }
  await deps.db.delete(stripeEvents).where(lt(stripeEvents.receivedAt, addDays(now, -30)));
  await deleteOrphanBlobs(deps, now);
  return purged;
}

/** System only (maintenance.purge job). SE-07 retention. */
export async function purgeExpired(
  deps: CoreDeps,
  system: Actor,
): Promise<{ magicLinks: number; temporaryChats: number; exports: number; sessions: number }> {
  assertSystem(system);
  const now = deps.clock.now();
  const links = await deps.db
    .delete(magicLinks)
    .where(lt(magicLinks.createdAt, addDays(now, -MAGIC_LINK_RETENTION_DAYS)))
    .returning({ id: magicLinks.id });
  const chats = await deps.db
    .delete(conversations)
    .where(
      and(eq(conversations.room, "temporary"), isNotNull(conversations.expiresAt), lt(conversations.expiresAt, now)),
    )
    .returning({ id: conversations.id });
  const expired = await deps.db
    .delete(exportsTable)
    .where(
      or(
        and(isNotNull(exportsTable.expiresAt), lt(exportsTable.expiresAt, now)),
        and(inArray(exportsTable.status, ["queued", "failed"]), lt(exportsTable.createdAt, addDays(now, -1))),
      ),
    )
    .returning({ id: exportsTable.id, blobId: exportsTable.blobId });
  const blobIds = expired.map((e) => e.blobId).filter((id): id is string => id !== null);
  if (blobIds.length > 0) await deps.db.delete(blobs).where(inArray(blobs.id, blobIds));
  const oldSessions = await deps.db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  return {
    magicLinks: links.length,
    temporaryChats: chats.length,
    exports: expired.length,
    sessions: oldSessions.length,
  };
}
