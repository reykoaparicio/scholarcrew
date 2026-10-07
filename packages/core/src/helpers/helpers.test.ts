import { auditEvents, eq, helperLinks, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { actorOf } from "../../test/helpers";
import { canRead } from "../access";
import { sha256Hex } from "../crypto";
import { createTestDeps, fixedClock } from "../shared";
import { createHelperLink, listHelperLinks, resolveHelperToken, revokeHelperLink } from "./index";

const tokenOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);
const input = {
  label: "Ms. Ortiz",
  helperRole: "recommender" as const,
  scope: ["activities" as const, "stories" as const],
  expiresInDays: 30,
};

describe("helper links", () => {
  it("creates a scoped link and stores only the token hash", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    expect(created.url).toMatch(/^http:\/\/localhost:3000\/h\/[A-Za-z0-9_-]{43}$/);
    expect(created.link).toMatchObject({
      label: "Ms. Ortiz",
      helperRole: "recommender",
      scope: ["activities", "stories"],
      expiresAt: "2026-11-05T15:00:00.000Z",
      revokedAt: null,
      lastUsedAt: null,
    });
    const [row] = await deps.db.select().from(helperLinks);
    expect(row?.tokenHash).toBe(sha256Hex(tokenOf(created.url)));
  });

  it("resolves a live token to a helper actor limited to its scope, and audits the use", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    const helper = await resolveHelperToken(deps, tokenOf(created.url));
    expect(helper).toEqual({
      kind: "helper",
      helperLinkId: created.link.id,
      studentId: user.id,
      scope: ["activities", "stories"],
    });
    if (!helper) throw new Error("expected a helper actor");
    expect(await canRead(deps, helper, user.id, "activities")).toBe(true);
    expect(await canRead(deps, helper, user.id, "essays")).toBe(false);
    const [row] = await deps.db.select().from(helperLinks);
    expect(row?.lastUsedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "helper_link_used"))).toHaveLength(1);
  });

  it("refuses scopes outside HL-01 and expiries over 90 days", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    for (const scope of ["essays", "chats", "costs", "sensitive"]) {
      await expect(
        createHelperLink(deps, actorOf(user), { ...input, scope: [scope] as unknown as typeof input.scope }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(createHelperLink(deps, actorOf(user), { ...input, expiresInDays: 91 })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("lets only students create links", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await expect(createHelperLink(deps, actorOf(parent), input)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("stops working as soon as it's revoked", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    await revokeHelperLink(deps, actorOf(user), created.link.id);
    expect(await resolveHelperToken(deps, tokenOf(created.url))).toBeNull();
    expect((await listHelperLinks(deps, actorOf(user)))[0]?.revokedAt).toBe("2026-10-06T15:00:00.000Z");
  });

  it("stops working after it expires", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    clock.set("2026-11-05T15:00:01.000Z");
    expect(await resolveHelperToken(deps, tokenOf(created.url))).toBeNull();
  });

  it("keeps links private to their student", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    expect(await listHelperLinks(deps, actorOf(other))).toEqual([]);
    await expect(revokeHelperLink(deps, actorOf(other), created.link.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await resolveHelperToken(deps, "unknown-token")).toBeNull();
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await resolveHelperToken(deps, tokenOf(created.url))).toBeNull();
  });
});
