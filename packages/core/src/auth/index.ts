import {
  and,
  apiTokens,
  eq,
  familyInvites,
  gt,
  isNull,
  magicLinks,
  notificationPrefs,
  profiles,
  sessions,
  subscriptions,
  users,
} from "@scholarcrew/db";
import { type Actor, MagicLinkRequest, type User, invalidInput, unauthenticated, userActor } from "@scholarcrew/domain";
import { assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { consumeRateLimit } from "../ratelimit";
import { type CoreDeps, addDays, addMinutes, one, toUser } from "../shared";

export const SESSION_COOKIE = "sc_session";

const LINK_MINUTES = 15;
const LAST_SEEN_REFRESH_MS = 5 * 60_000;

type UserRow = typeof users.$inferSelect;

export async function requestMagicLink(deps: CoreDeps, i: { email: string; ip: string }): Promise<void> {
  const parsed = MagicLinkRequest.safeParse({ email: i.email.trim().toLowerCase() });
  if (!parsed.success) throw invalidInput("Enter a valid email address");
  const email = parsed.data.email.trim().toLowerCase();
  await consumeRateLimit(deps, { key: `ml:ip:${i.ip}`, limit: 5, windowSeconds: 900 });
  await consumeRateLimit(deps, { key: `ml:email:${email}`, limit: 5, windowSeconds: 900 });
  const now = deps.clock.now();
  const [recent] = await deps.db
    .select()
    .from(magicLinks)
    .where(and(eq(magicLinks.email, email), gt(magicLinks.createdAt, new Date(now.getTime() - 60_000))))
    .limit(1);
  if (recent) return;
  const token = randomToken(32);
  await deps.db.insert(magicLinks).values({
    email,
    tokenHash: sha256Hex(token),
    createdAt: now,
    expiresAt: addMinutes(now, LINK_MINUTES),
  });
  await deps.email.send({
    to: email,
    subject: "Your ScholarCrew sign-in link",
    text: [
      "Use this link to sign in to ScholarCrew:",
      "",
      `${deps.config.appUrl}/api/v1/auth/verify?token=${token}`,
      "",
      "It works once and expires in 15 minutes. If you didn't ask for it, ignore this email.",
    ].join("\n"),
  });
}

/**
 * New accounts are students, except an email with a live, unaccepted parent invite, which becomes a
 * parent (R2I-2): the invitee then skips student onboarding and lands on /week.
 */
async function createAccount(deps: CoreDeps, email: string, now: Date): Promise<UserRow> {
  return deps.db.transaction(async (tx) => {
    const [parentInvite] = await tx
      .select({ id: familyInvites.id })
      .from(familyInvites)
      .where(
        and(
          eq(familyInvites.email, email),
          eq(familyInvites.memberRole, "parent"),
          isNull(familyInvites.acceptedAt),
          gt(familyInvites.expiresAt, now),
        ),
      )
      .limit(1);
    const role = parentInvite ? ("parent" as const) : ("student" as const);
    const [inserted] = await tx
      .insert(users)
      .values({ email, role, createdAt: now })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!inserted) return one(await tx.select().from(users).where(eq(users.email, email)), "existing user");
    const created = inserted;
    await tx.insert(profiles).values({ userId: created.id, updatedAt: now });
    await tx
      .insert(subscriptions)
      .values({ ownerId: created.id, plan: "free", status: "active", createdAt: now, updatedAt: now });
    await tx.insert(notificationPrefs).values({ userId: created.id, updatedAt: now });
    return created;
  });
}

export async function signOutEverywhere(deps: CoreDeps, actor: Actor): Promise<void> {
  assertUser(actor);
  await deps.db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, actor.userId));
    await tx.update(apiTokens).set({ revokedAt: deps.clock.now() }).where(eq(apiTokens.userId, actor.userId));
  });
  await recordAudit(deps, { actor, action: "signed_out_everywhere", entityType: "user", entityId: actor.userId });
}

export async function verifyMagicLink(
  deps: CoreDeps,
  i: { token: string; userAgent: string },
): Promise<{ sessionToken: string; user: User; isNew: boolean }> {
  const now = deps.clock.now();
  const invalid = () => unauthenticated("This sign-in link is invalid or has expired");
  if (!i.token) throw invalid();
  // Marking the link used in the same statement that checks it makes it single-use under races.
  const [link] = await deps.db
    .update(magicLinks)
    .set({ usedAt: now })
    .where(and(eq(magicLinks.tokenHash, sha256Hex(i.token)), isNull(magicLinks.usedAt), gt(magicLinks.expiresAt, now)))
    .returning();
  if (!link) throw invalid();
  const [existing] = await deps.db.select().from(users).where(eq(users.email, link.email)).limit(1);
  if (existing && existing.status !== "active") throw unauthenticated("This account can't sign in");
  const user = existing ?? (await createAccount(deps, link.email, now));
  const isNew = existing === undefined;
  const sessionToken = randomToken(32);
  await deps.db.insert(sessions).values({
    userId: user.id,
    tokenHash: sha256Hex(sessionToken),
    userAgent: i.userAgent.slice(0, 300),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: addDays(now, deps.config.sessionDays),
  });
  await recordAudit(deps, {
    actor: userActor(user.id, user.role),
    action: "sign_in",
    entityType: "user",
    entityId: user.id,
    meta: { isNew },
  });
  return { sessionToken, user: toUser(user), isNew };
}

export async function getSessionUser(deps: CoreDeps, sessionToken: string): Promise<User | null> {
  if (!sessionToken) return null;
  const now = deps.clock.now();
  const [row] = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(sessionToken)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.user.status !== "active" || row.session.expiresAt <= deps.clock.now()) return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() >= LAST_SEEN_REFRESH_MS) {
    await deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
  }
  return toUser(row.user);
}

export async function signOut(deps: CoreDeps, sessionToken: string): Promise<void> {
  if (!sessionToken) return;
  await deps.db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(sessionToken)));
}
