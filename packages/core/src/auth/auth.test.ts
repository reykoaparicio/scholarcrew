import {
  apiTokens,
  auditEvents,
  eq,
  familyInvites,
  magicLinks,
  notificationPrefs,
  profiles,
  sessions,
  subscriptions,
  users,
} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { sha256Hex } from "../crypto";
import { type CoreDeps, createTestDeps, fixedClock } from "../shared";
import { SESSION_COOKIE, getSessionUser, requestMagicLink, signOut, signOutEverywhere, verifyMagicLink } from "./index";

const IP = "203.0.113.9";

async function linkFor(deps: CoreDeps, email: string): Promise<string> {
  await requestMagicLink(deps, { email, ip: IP });
  return tokenIn((await latestEmail(deps.db, email)).text);
}

describe("requestMagicLink", () => {
  it("emails a one-time link and stores only its hash", async () => {
    const deps = createTestDeps();
    await requestMagicLink(deps, { email: "  Maya@Example.TEST ", ip: IP });
    const mail = await latestEmail(deps.db, "maya@example.test");
    expect(mail.subject).toBe("Your ScholarCrew sign-in link");
    expect(mail.text).toContain("http://localhost:3000/api/v1/auth/verify?token=");
    const token = tokenIn(mail.text);
    const [row] = await deps.db.select().from(magicLinks);
    expect(row?.email).toBe("maya@example.test");
    expect(row?.tokenHash).toBe(sha256Hex(token));
    expect(row?.expiresAt.toISOString()).toBe("2026-10-06T15:15:00.000Z");
  });

  it("rejects an invalid email", async () => {
    await expect(requestMagicLink(createTestDeps(), { email: "nope", ip: IP })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("limits each IP to 5 requests per 15 minutes", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await requestMagicLink(deps, { email: `s${n}@example.test`, ip: IP });
    await expect(requestMagicLink(deps, { email: "s5@example.test", ip: IP })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("limits each email to 5 requests per 15 minutes across IPs", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await requestMagicLink(deps, { email: "maya@example.test", ip: `198.51.100.${n}` });
    await expect(requestMagicLink(deps, { email: "MAYA@example.test", ip: "198.51.100.9" })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
});

describe("verifyMagicLink", () => {
  it("creates a student account with profile, free plan, and prefs on first use", async () => {
    const deps = createTestDeps();
    const result = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "vitest",
    });
    expect(result.isNew).toBe(true);
    expect(result.user).toMatchObject({ email: "maya@example.test", role: "student", status: "active" });
    const id = result.user.id;
    expect(await deps.db.select().from(profiles).where(eq(profiles.userId, id))).toHaveLength(1);
    const [sub] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, id));
    expect(sub?.plan).toBe("free");
    expect(await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, id))).toHaveLength(1);
    const [session] = await deps.db.select().from(sessions).where(eq(sessions.userId, id));
    expect(session?.tokenHash).toBe(sha256Hex(result.sessionToken));
    expect(session?.userAgent).toBe("vitest");
    expect(session?.expiresAt.toISOString()).toBe("2026-11-05T15:00:00.000Z");
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "sign_in"))).toHaveLength(1);
  });

  it("creates a parent when the email has a pending parent invite (R2I-2)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [] });
    const invite = (email: string, o: { memberRole?: "parent" | "student"; acceptedAt?: Date } = {}) =>
      deps.db.insert(familyInvites).values({
        familyId: family.id,
        email,
        memberRole: o.memberRole ?? "parent",
        invitedById: student.id,
        tokenHash: sha256Hex(`invite-${email}`),
        expiresAt: new Date("2026-10-13T15:00:00.000Z"),
        acceptedAt: o.acceptedAt ?? null,
      });
    await invite("dana@example.test");
    await invite("sib@example.test", { memberRole: "student" });
    await invite("used@example.test", { acceptedAt: new Date("2026-10-05T15:00:00.000Z") });
    const dana = await verifyMagicLink(deps, { token: await linkFor(deps, "dana@example.test"), userAgent: "" });
    expect(dana).toMatchObject({ isNew: true, user: { role: "parent" } });
    expect(await deps.db.select().from(profiles).where(eq(profiles.userId, dana.user.id))).toHaveLength(1);
    for (const email of ["sib@example.test", "used@example.test", "new@example.test"]) {
      const r = await verifyMagicLink(deps, { token: await linkFor(deps, email), userAgent: "" });
      expect(r.user.role).toBe("student");
    }
  });

  it("works only once", async () => {
    const deps = createTestDeps();
    const token = await linkFor(deps, "maya@example.test");
    await verifyMagicLink(deps, { token, userAgent: "" });
    await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("expires after 15 minutes", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const token = await linkFor(deps, "maya@example.test");
    clock.set("2026-10-06T15:15:01.000Z");
    await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("signs in an existing user without creating another", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db, { email: "dana@example.test" });
    const result = await verifyMagicLink(deps, { token: await linkFor(deps, "dana@example.test"), userAgent: "" });
    expect(result.isNew).toBe(false);
    expect(result.user.id).toBe(user.id);
    expect(await deps.db.select().from(users).where(eq(users.email, "dana@example.test"))).toHaveLength(1);
  });

  it("refuses blocked and deleted accounts", async () => {
    const deps = createTestDeps();
    await factories.user(deps.db, { email: "kid@example.test", status: "blocked_underage" });
    await factories.user(deps.db, { email: "gone@example.test", status: "deleted" });
    for (const email of ["kid@example.test", "gone@example.test"]) {
      const token = await linkFor(deps, email);
      await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
    }
    expect(await deps.db.select().from(sessions)).toHaveLength(0);
  });

  it("rejects an unknown token", async () => {
    await expect(verifyMagicLink(createTestDeps(), { token: "x".repeat(43), userAgent: "" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

describe("sessions", () => {
  it("returns the user and refreshes lastSeenAt at most every 5 minutes", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { sessionToken, user } = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "",
    });
    clock.set("2026-10-06T15:04:00.000Z");
    expect((await getSessionUser(deps, sessionToken))?.id).toBe(user.id);
    const [early] = await deps.db.select().from(sessions);
    expect(early?.lastSeenAt.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    clock.set("2026-10-06T15:06:00.000Z");
    await getSessionUser(deps, sessionToken);
    const [late] = await deps.db.select().from(sessions);
    expect(late?.lastSeenAt.toISOString()).toBe("2026-10-06T15:06:00.000Z");
  });

  it("returns null for expired sessions, unknown tokens, and inactive users", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { sessionToken, user } = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "",
    });
    expect(await getSessionUser(deps, "")).toBeNull();
    expect(await getSessionUser(deps, "unknown")).toBeNull();
    clock.set("2026-11-05T15:00:01.000Z");
    expect(await getSessionUser(deps, sessionToken)).toBeNull();
    clock.set("2026-10-06T16:00:00.000Z");
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await getSessionUser(deps, sessionToken)).toBeNull();
  });

  it("signOut deletes the session server-side", async () => {
    const deps = createTestDeps();
    const { sessionToken } = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "",
    });
    await signOut(deps, sessionToken);
    expect(await getSessionUser(deps, sessionToken)).toBeNull();
    expect(await deps.db.select().from(sessions)).toHaveLength(0);
  });

  it("names the cookie sc_session", () => {
    expect(SESSION_COOKIE).toBe("sc_session");
  });
});

describe("round 4 session controls", () => {
  it("coalesces magic-link requests within 60 seconds", async () => {
    const clock = fixedClock("2026-10-06T15:00:00Z");
    const deps = createTestDeps({ clock });
    await requestMagicLink(deps, { email: "cooldown@example.test", ip: IP });
    clock.set("2026-10-06T15:00:10Z");
    await requestMagicLink(deps, { email: "cooldown@example.test", ip: IP });
    expect(await deps.db.select().from(magicLinks).where(eq(magicLinks.email, "cooldown@example.test"))).toHaveLength(
      1,
    );
  });
  it("ends every session and token", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db
      .insert(sessions)
      .values({ userId: user.id, tokenHash: sha256Hex("r4-session"), expiresAt: new Date("2027-01-01") });
    await deps.db.insert(apiTokens).values({
      userId: user.id,
      tokenHash: sha256Hex("r4-token"),
      scopes: ["autofill"],
      expiresAt: new Date("2027-01-01"),
    });
    await signOutEverywhere(deps, actorOf(user));
    expect(await deps.db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
    const [token] = await deps.db.select().from(apiTokens).where(eq(apiTokens.userId, user.id));
    expect(token?.revokedAt).not.toBeNull();
  });
});
