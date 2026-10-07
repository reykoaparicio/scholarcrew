import { and, eq, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type HelperActor, PUBLIC_ACTOR } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import {
  assertAdmin,
  assertCanRead,
  assertOwner,
  assertRole,
  assertSystem,
  assertUser,
  canRead,
  familyIdsFor,
  getShareGrants,
  isOwner,
} from "./index";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

async function setup() {
  const deps = createTestDeps();
  const { user: student } = await factories.student(deps.db);
  const parent = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
  const outsider = await factories.parent(deps.db);
  const admin = await factories.admin(deps.db);
  return { deps, student, parent, family, outsider, admin };
}

describe("actor assertions", () => {
  it("assertUser accepts users and rejects everyone else as unauthenticated", async () => {
    const { student } = await setup();
    const helper: HelperActor = { kind: "helper", helperLinkId: student.id, studentId: student.id, scope: [] };
    expect(codeOf(() => assertUser(PUBLIC_ACTOR))).toBe("unauthenticated");
    expect(codeOf(() => assertUser(SYSTEM))).toBe("unauthenticated");
    expect(codeOf(() => assertUser(helper))).toBe("unauthenticated");
    expect(codeOf(() => assertUser(actorOf(student)))).toBeUndefined();
  });

  it("assertRole and assertAdmin check the role", async () => {
    const { student, admin } = await setup();
    expect(codeOf(() => assertRole(actorOf(student), "parent"))).toBe("forbidden");
    expect(codeOf(() => assertRole(actorOf(student), "student", "parent"))).toBeUndefined();
    expect(codeOf(() => assertAdmin(actorOf(admin)))).toBeUndefined();
    expect(codeOf(() => assertAdmin(actorOf(student)))).toBe("forbidden");
  });

  it("assertSystem accepts only the system actor", async () => {
    const { student } = await setup();
    expect(codeOf(() => assertSystem(SYSTEM))).toBeUndefined();
    expect(codeOf(() => assertSystem(actorOf(student)))).toBe("forbidden");
  });

  it("assertOwner passes the owner and system and hides the object from everyone else", async () => {
    const { student, parent, admin } = await setup();
    const helper: HelperActor = {
      kind: "helper",
      helperLinkId: parent.id,
      studentId: student.id,
      scope: ["activities"],
    };
    expect(isOwner(actorOf(student), student.id)).toBe(true);
    expect(isOwner(SYSTEM, student.id)).toBe(false);
    expect(codeOf(() => assertOwner(actorOf(student), student.id))).toBeUndefined();
    expect(codeOf(() => assertOwner(SYSTEM, student.id))).toBeUndefined();
    expect(codeOf(() => assertOwner(actorOf(parent), student.id))).toBe("not_found");
    expect(codeOf(() => assertOwner(actorOf(admin), student.id))).toBe("not_found");
    expect(codeOf(() => assertOwner(helper, student.id))).toBe("not_found");
    expect(codeOf(() => assertOwner(PUBLIC_ACTOR, student.id))).toBe("not_found");
  });
});

describe("family share grants", () => {
  it("gives a parent the default categories and the student everything", async () => {
    const { deps, student, parent, outsider } = await setup();
    expect(await getShareGrants(deps, student.id, parent.id)).toEqual([
      "deadlines",
      "colleges",
      "costs",
      "scholarships",
      "activities",
    ]);
    expect(await getShareGrants(deps, student.id, student.id)).toHaveLength(9);
    expect(await getShareGrants(deps, student.id, outsider.id)).toEqual([]);
  });

  it("follows the student's current settings", async () => {
    const { deps, student, parent, family } = await setup();
    const row = (category: "essays" | "costs") =>
      and(
        eq(shareSettings.studentId, student.id),
        eq(shareSettings.familyId, family.id),
        eq(shareSettings.category, category),
      );
    await deps.db.update(shareSettings).set({ enabled: true }).where(row("essays"));
    await deps.db.update(shareSettings).set({ enabled: false }).where(row("costs"));
    const grants = await getShareGrants(deps, student.id, parent.id);
    expect(grants).toContain("essays");
    expect(grants).not.toContain("costs");
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(false);
  });

  it("applies the default for a category with no row (R2I-11)", async () => {
    const { deps, student, parent, family } = await setup();
    await deps.db.delete(shareSettings).where(eq(shareSettings.familyId, family.id));
    expect(await getShareGrants(deps, student.id, parent.id)).toEqual([
      "deadlines",
      "colleges",
      "costs",
      "scholarships",
      "activities",
    ]);
    await deps.db
      .insert(shareSettings)
      .values({ studentId: student.id, familyId: family.id, category: "costs", enabled: false });
    expect(await getShareGrants(deps, student.id, parent.id)).not.toContain("costs");
  });

  it("canRead applies owner, parent, admin, public, and system rules", async () => {
    const { deps, student, parent, outsider, admin } = await setup();
    expect(await canRead(deps, actorOf(student), student.id, "essays")).toBe(true);
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(true);
    expect(await canRead(deps, actorOf(parent), student.id, "essays")).toBe(false);
    expect(await canRead(deps, actorOf(parent), student.id, "sensitive")).toBe(false);
    expect(await canRead(deps, actorOf(outsider), student.id, "deadlines")).toBe(false);
    expect(await canRead(deps, actorOf(admin), student.id, "deadlines")).toBe(false);
    expect(await canRead(deps, PUBLIC_ACTOR, student.id, "deadlines")).toBe(false);
    expect(await canRead(deps, SYSTEM, student.id, "sensitive")).toBe(true);
  });

  it("canRead limits a helper to its scope and its student", async () => {
    const { deps, student } = await setup();
    const { user: other } = await factories.student(deps.db);
    const helper: HelperActor = {
      kind: "helper",
      helperLinkId: other.id,
      studentId: student.id,
      scope: ["activities", "stories"],
    };
    expect(await canRead(deps, helper, student.id, "activities")).toBe(true);
    expect(await canRead(deps, helper, student.id, "colleges")).toBe(false);
    expect(await canRead(deps, helper, student.id, "essays")).toBe(false);
    expect(await canRead(deps, helper, other.id, "activities")).toBe(false);
  });

  it("assertCanRead throws not_found when denied", async () => {
    const { deps, student, parent } = await setup();
    await expect(assertCanRead(deps, actorOf(parent), student.id, "deadlines")).resolves.toBeUndefined();
    await expect(assertCanRead(deps, actorOf(parent), student.id, "chats")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("familyIdsFor lists the user's families", async () => {
    const { deps, student, family, outsider } = await setup();
    expect(await familyIdsFor(deps, student.id)).toEqual([family.id]);
    expect(await familyIdsFor(deps, outsider.id)).toEqual([]);
  });
});
