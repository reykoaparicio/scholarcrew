import {
  type DbOrTx,
  and,
  asc,
  count,
  eq,
  families,
  familyBudgets,
  familyInvites,
  familyMembers,
  familyTasks,
  gt,
  isNull,
  notifications,
  or,
  profiles,
  sensitiveFacts,
  shareSettings,
  sql,
  users,
} from "@scholarcrew/db";
import {
  AcceptInviteInput,
  type Actor,
  DEFAULT_SHARED,
  type FamilyMemberRole,
  type FamilyTaskKind,
  type FamilyView,
  InviteInput,
  type IsoDateTime,
  type Role,
  SHARE_CATEGORIES,
  conflict,
  forbidden,
  invalidInput,
  notFound,
} from "@scholarcrew/domain";
import { assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { type CoreDeps, addDays, isUniqueConstraint, one, requireUuid, toIso } from "../shared";

export type Membership = { familyId: string; memberRole: FamilyMemberRole };
export type FamilyTaskRow = typeof familyTasks.$inferSelect;

const MAX_PARENTS = 4;
const INVITE_DAYS = 7;

/** R2I-3: what an invite says when the inviter hasn't set a name. Family tasks reuse it for a nameless assignee (R3V-14). */
export function unnamedInviter(role: Role): string {
  return role === "parent" ? "Your family member" : "Your student";
}

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

/**
 * R2I-15: a `family` bell entry, no email. It's the same row `notify` (F16) writes, inserted here so it
 * commits with the family change (family is built before notifications).
 */
async function familyNotice(
  db: DbOrTx,
  i: { userId: string; title: string; dedupeKey: string },
  now: Date,
): Promise<void> {
  await db
    .insert(notifications)
    .values({
      userId: i.userId,
      kind: "family",
      title: i.title.slice(0, 200),
      body: "",
      link: "/family",
      dedupeKey: i.dedupeKey,
      createdAt: now,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

/**
 * Internal (createTask and acceptInvite use it). An aid-linked task is inserted once per (aidItemId,
 * assignee) and the existing row comes back after that (R2I-6). Only a real insert notifies the
 * assignee, `family-task:<taskId>` (R2I-15).
 */
export async function insertFamilyTask(
  db: DbOrTx,
  i: {
    familyId: string;
    assigneeId: string;
    studentId: string;
    kind: FamilyTaskKind;
    title: string;
    detail?: string;
    dueOn?: string | null;
    aidItemId?: string | null;
  },
  now: Date,
): Promise<{ row: FamilyTaskRow; inserted: boolean }> {
  const values = {
    familyId: i.familyId,
    assigneeId: i.assigneeId,
    studentId: i.studentId,
    kind: i.kind,
    title: i.title,
    detail: i.detail ?? "",
    dueOn: i.dueOn ?? null,
    aidItemId: i.aidItemId ?? null,
    createdAt: now,
  };
  const aidItemId = i.aidItemId ?? null;
  const announce = (row: FamilyTaskRow) =>
    familyNotice(
      db,
      { userId: row.assigneeId, title: `New family task: ${row.title}`, dedupeKey: `family-task:${row.id}` },
      now,
    );
  if (aidItemId === null) {
    const row = one(await db.insert(familyTasks).values(values).returning(), "family_tasks insert");
    await announce(row);
    return { row, inserted: true };
  }
  const [row] = await db
    .insert(familyTasks)
    .values(values)
    .onConflictDoNothing({ target: [familyTasks.aidItemId, familyTasks.assigneeId] })
    .returning();
  if (row) {
    await announce(row);
    return { row, inserted: true };
  }
  const existing = await db
    .select()
    .from(familyTasks)
    .where(and(eq(familyTasks.aidItemId, aidItemId), eq(familyTasks.assigneeId, i.assigneeId)));
  return { row: one(existing, "family_tasks select"), inserted: false };
}

/** One family per user. Internal; profile, billing, and account reuse it. */
export async function membershipOf(db: DbOrTx, userId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ familyId: familyMembers.familyId, memberRole: familyMembers.memberRole })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

async function addDefaultShares(db: DbOrTx, studentId: string, familyId: string): Promise<void> {
  await db
    .insert(shareSettings)
    .values(SHARE_CATEGORIES.map((category) => ({ studentId, familyId, category, enabled: DEFAULT_SHARED[category] })))
    .onConflictDoNothing();
}

async function parentMembers(db: DbOrTx, familyId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "parent")));
  return row?.n ?? 0;
}

async function pendingParentInvites(db: DbOrTx, familyId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(familyInvites)
    .where(
      and(
        eq(familyInvites.familyId, familyId),
        eq(familyInvites.memberRole, "parent"),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, now),
      ),
    );
  return row?.n ?? 0;
}

export async function familyView(deps: CoreDeps, familyId: string, myRole: FamilyMemberRole): Promise<FamilyView> {
  const family = one(await deps.db.select().from(families).where(eq(families.id, familyId)), "families select");
  const members = await deps.db
    .select({
      userId: familyMembers.userId,
      displayName: users.displayName,
      email: users.email,
      memberRole: familyMembers.memberRole,
      joinedAt: familyMembers.joinedAt,
    })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(asc(familyMembers.joinedAt));
  const invites = await deps.db
    .select({ id: familyInvites.id, email: familyInvites.email, expiresAt: familyInvites.expiresAt })
    .from(familyInvites)
    .where(
      and(
        eq(familyInvites.familyId, familyId),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, deps.clock.now()),
      ),
    )
    .orderBy(asc(familyInvites.createdAt));
  return {
    id: family.id,
    name: family.name,
    myRole,
    members: members.map((m) => ({ ...m, joinedAt: toIso(m.joinedAt) })),
    pendingInvites: invites.map((i) => ({ id: i.id, email: i.email, expiresAt: toIso(i.expiresAt) })),
  };
}

export async function getFamily(deps: CoreDeps, actor: Actor): Promise<FamilyView | null> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  return membership ? familyView(deps, membership.familyId, membership.memberRole) : null;
}

async function startFamily(deps: CoreDeps, student: typeof users.$inferSelect, now: Date): Promise<Membership> {
  return deps.db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${student.id}))`);
      const existing = await membershipOf(tx, student.id);
      if (existing) return existing;
      const name = student.displayName ? `${student.displayName}'s family` : "Family";
      const family = one(
        await tx.insert(families).values({ name, createdById: student.id, createdAt: now }).returning(),
        "families insert",
      );
      await tx
        .insert(familyMembers)
        .values({ familyId: family.id, userId: student.id, memberRole: "student", joinedAt: now });
      await addDefaultShares(tx, student.id, family.id);
      return { familyId: family.id, memberRole: "student" as const };
    })
    .catch((error: unknown) => {
      if (isUniqueConstraint(error, "family_members_user_uq"))
        throw conflict("You're already in a family. Leave it before joining another.");
      throw error;
    });
}

/** Only the student invites. A student with no family creates one on the first invite. */
export async function invite(deps: CoreDeps, actor: Actor, i: InviteInput): Promise<void> {
  assertUser(actor);
  const parsed = InviteInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Enter a valid email address");
  const email = parsed.data.email.trim().toLowerCase();
  const memberRole = "parent" as const;
  const now = deps.clock.now();
  const me = one(await deps.db.select().from(users).where(eq(users.id, actor.userId)), "users select");
  if (me.email === email) throw invalidInput("You can't invite yourself");
  let membership = await membershipOf(deps.db, me.id);
  if (!membership) {
    if (me.role !== "student") throw forbidden("A student starts the family. Ask your student to invite you.");
    membership = await startFamily(deps, me, now);
  }
  if (membership.memberRole !== "student") throw forbidden("Ask your student to send the invite.");
  const familyId = membership.familyId;
  const already = await deps.db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(and(eq(familyMembers.familyId, familyId), eq(users.email, email)));
  if (already.length > 0) throw conflict("That person is already in your family");
  if (memberRole === "parent") {
    const used = (await parentMembers(deps.db, familyId)) + (await pendingParentInvites(deps.db, familyId, now));
    if (used >= MAX_PARENTS) throw conflict("A family can have up to 4 parents");
  }
  const token = randomToken();
  await deps.db.insert(familyInvites).values({
    familyId,
    email,
    memberRole,
    invitedById: me.id,
    tokenHash: sha256Hex(token),
    createdAt: now,
    expiresAt: addDays(now, INVITE_DAYS),
  });
  const inviter = me.displayName || unnamedInviter(me.role);
  await deps.email.send({
    to: email,
    subject: `${inviter} invited you to their family on ScholarCrew`,
    text: [
      `${inviter} invited you to join their family on ScholarCrew.`,
      "",
      `${deps.config.appUrl}/family/join?token=${token}`,
      "",
      "The link works once and expires in 7 days. You'll only see what they choose to share.",
    ].join("\n"),
  });
  await recordAudit(deps, {
    actor,
    action: "family_invite_sent",
    entityType: "family",
    entityId: familyId,
    meta: { memberRole },
  });
}

export async function revokeInvite(deps: CoreDeps, actor: Actor, inviteId: string): Promise<void> {
  assertUser(actor);
  requireUuid(inviteId, "Invite not found");
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership || membership.memberRole !== "student") throw notFound("Invite not found");
  const removed = await deps.db
    .delete(familyInvites)
    .where(
      and(
        eq(familyInvites.id, inviteId),
        eq(familyInvites.familyId, membership.familyId),
        isNull(familyInvites.acceptedAt),
      ),
    )
    .returning();
  if (!removed.length) throw notFound("Invite not found");
  await recordAudit(deps, { actor, action: "family_invite_revoked", entityType: "family_invite", entityId: inviteId });
}

/**
 * D37: what /family/join shows before sign-in or accept. No actor: the token is the credential.
 * Expired, used, or unknown tokens are not_found. Never returns the invitee's email.
 */
export async function previewInvite(
  deps: CoreDeps,
  token: string,
): Promise<{ inviterFirstName: string; memberRole: FamilyMemberRole; expiresAt: IsoDateTime }> {
  const parsed = AcceptInviteInput.safeParse({ token });
  if (!parsed.success) throw notFound("This invite is invalid or has expired");
  const [row] = await deps.db
    .select({
      memberRole: familyInvites.memberRole,
      expiresAt: familyInvites.expiresAt,
      inviter: users.displayName,
      inviterRole: users.role,
    })
    .from(familyInvites)
    .innerJoin(users, eq(users.id, familyInvites.invitedById))
    .where(
      and(
        eq(familyInvites.tokenHash, sha256Hex(parsed.data.token)),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, deps.clock.now()),
      ),
    )
    .limit(1);
  if (!row) throw notFound("This invite is invalid or has expired");
  return {
    inviterFirstName: firstNameOf(row.inviter) || unnamedInviter(row.inviterRole),
    memberRole: row.memberRole,
    expiresAt: toIso(row.expiresAt),
  };
}

export async function acceptInvite(deps: CoreDeps, actor: Actor, i: AcceptInviteInput): Promise<FamilyView> {
  assertUser(actor);
  const parsed = AcceptInviteInput.safeParse(i);
  const invalid = () => notFound("This invite is invalid or has expired");
  if (!parsed.success) throw invalid();
  const now = deps.clock.now();
  const [inv] = await deps.db
    .select()
    .from(familyInvites)
    .where(
      and(
        eq(familyInvites.tokenHash, sha256Hex(parsed.data.token)),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, now),
      ),
    )
    .limit(1);
  if (!inv || inv.memberRole !== "parent") throw invalid();
  const [me] = await deps.db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!me || me.email !== inv.email) throw invalid();
  if (await membershipOf(deps.db, me.id))
    throw conflict("You're already in a family. Leave it before joining another.");
  if (inv.memberRole === "parent" && (await parentMembers(deps.db, inv.familyId)) >= MAX_PARENTS) {
    throw conflict("A family can have up to 4 parents");
  }
  const [profile] = await deps.db.select().from(profiles).where(eq(profiles.userId, me.id)).limit(1);
  await deps.db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${me.id}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${inv.familyId}))`);
      if (await membershipOf(tx, me.id)) throw conflict("You're already in a family. Leave it before joining another.");
      if ((await parentMembers(tx, inv.familyId)) >= MAX_PARENTS) throw conflict("A family can have up to 4 parents");
      const claimed = await tx
        .update(familyInvites)
        .set({ acceptedAt: now, acceptedById: me.id })
        .where(and(eq(familyInvites.id, inv.id), isNull(familyInvites.acceptedAt)))
        .returning({ id: familyInvites.id });
      if (claimed.length === 0) throw invalid();
      await tx
        .insert(familyMembers)
        .values({ familyId: inv.familyId, userId: me.id, memberRole: inv.memberRole, joinedAt: now });
      {
        if (me.role === "student" && !profile?.onboardingCompletedAt) {
          await tx.update(users).set({ role: "parent" }).where(eq(users.id, me.id));
        }
        // R2I-7 (FA-05): a joining parent gets the budget task once and an income-range task per student.
        const students = await tx
          .select({ userId: familyMembers.userId })
          .from(familyMembers)
          .where(and(eq(familyMembers.familyId, inv.familyId), eq(familyMembers.memberRole, "student")))
          .orderBy(asc(familyMembers.joinedAt), asc(familyMembers.userId));
        const task = { familyId: inv.familyId, assigneeId: me.id };
        const firstStudent = students[0];
        if (firstStudent) {
          await insertFamilyTask(
            tx,
            {
              ...task,
              studentId: firstStudent.userId,
              kind: "share_budget",
              title: "Share a yearly budget for college",
            },
            now,
          );
        }
        for (const s of students) {
          await insertFamilyTask(
            tx,
            {
              ...task,
              studentId: s.userId,
              kind: "share_income_range",
              title: "Share an income range for scholarship matching",
            },
            now,
          );
        }
      }
      await familyNotice(
        tx,
        {
          userId: inv.invitedById,
          title: `${firstNameOf(me.displayName) || "Your family member"} joined your family`,
          dedupeKey: `family-joined:${inv.id}`,
        },
        now,
      );
    })
    .catch((error: unknown) => {
      if (isUniqueConstraint(error, "family_members_user_uq"))
        throw conflict("You're already in a family. Leave it before joining another.");
      throw error;
    });
  await recordAudit(deps, {
    actor,
    action: "family_joined",
    entityType: "family",
    entityId: inv.familyId,
    meta: { memberRole: inv.memberRole },
  });
  return familyView(deps, inv.familyId, inv.memberRole);
}

/**
 * Internal: what a departing member leaves behind in one family (R2I-14). Their shared budget and the
 * tasks assigned to them go; a departing student also takes the tasks about them. When no student is
 * left, the family goes too (cascading to members, invites, tasks, and budgets).
 */
async function clearDeparted(
  tx: DbOrTx,
  familyId: string,
  userId: string,
  memberRole: FamilyMemberRole,
): Promise<void> {
  await tx
    .delete(familyInvites)
    .where(
      and(
        eq(familyInvites.familyId, familyId),
        eq(familyInvites.invitedById, userId),
        isNull(familyInvites.acceptedAt),
      ),
    );
  await tx
    .delete(sensitiveFacts)
    .where(and(eq(sensitiveFacts.kind, "income_range"), eq(sensitiveFacts.sharedByUserId, userId)));
  await tx.delete(familyBudgets).where(and(eq(familyBudgets.familyId, familyId), eq(familyBudgets.sharedById, userId)));
  await tx
    .delete(familyTasks)
    .where(
      and(
        eq(familyTasks.familyId, familyId),
        memberRole === "student"
          ? or(eq(familyTasks.assigneeId, userId), eq(familyTasks.studentId, userId))
          : eq(familyTasks.assigneeId, userId),
      ),
    );
  const [students] = await tx
    .select({ n: count() })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "student")));
  if ((students?.n ?? 0) === 0) await tx.delete(families).where(eq(families.id, familyId));
}

/** A student removes a parent. Access ends on the next request. */
export async function removeMember(deps: CoreDeps, actor: Actor, userId: string): Promise<void> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership || membership.memberRole !== "student") throw notFound("Member not found");
  await deps.db.transaction(async (tx) => {
    const removed = await tx
      .delete(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, membership.familyId),
          eq(familyMembers.userId, userId),
          eq(familyMembers.memberRole, "parent"),
        ),
      )
      .returning({ userId: familyMembers.userId });
    if (removed.length === 0) throw notFound("Member not found");
    await clearDeparted(tx, membership.familyId, userId, "parent");
  });
  await recordAudit(deps, {
    actor,
    action: "family_member_removed",
    entityType: "family",
    entityId: membership.familyId,
    meta: { userId },
  });
}

export async function leaveFamily(deps: CoreDeps, actor: Actor): Promise<void> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) throw notFound("You're not in a family");
  const userId = actor.userId;
  await deps.db.transaction(async (tx) => {
    await tx
      .delete(familyMembers)
      .where(and(eq(familyMembers.familyId, membership.familyId), eq(familyMembers.userId, userId)));
    await tx
      .delete(shareSettings)
      .where(and(eq(shareSettings.familyId, membership.familyId), eq(shareSettings.studentId, userId)));
    await clearDeparted(tx, membership.familyId, userId, membership.memberRole);
  });
  await recordAudit(deps, { actor, action: "family_left", entityType: "family", entityId: membership.familyId });
}
