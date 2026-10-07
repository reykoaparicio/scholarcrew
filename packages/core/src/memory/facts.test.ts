import { and, eq, memoryFacts, profiles } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { FactInput, FactValue, FactVisibility } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps, fixedClock } from "../shared";
import {
  confirmCandidate,
  createCandidate,
  createFact,
  crewVisibleFacts,
  forgetFact,
  listFacts,
  rejectCandidate,
  updateFact,
  valueText,
} from "./facts";

const fact = (key: string, value: FactValue, visibility: FactVisibility = "crew"): FactInput => ({
  key,
  value,
  visibility,
  source: "user_stated",
  sourceRef: null,
});

describe("facts", () => {
  it("creates and lists the owner's facts with value text", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createFact(
      deps,
      actorOf(user),
      fact("intended_majors", ["Mechanical engineering", "Robotics"]),
    );
    expect(created).toMatchObject({
      key: "intended_majors",
      valueText: "Mechanical engineering, Robotics",
      source: "user_stated",
      status: "confirmed",
      createdAt: "2026-10-06T15:00:00.000Z",
    });
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(1);
  });

  it("hides facts from everyone but the owner and system", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    const admin = await factories.admin(deps.db);
    await createFact(deps, actorOf(user), fact("county", "Maple"));
    for (const actor of [actorOf(other), actorOf(parent), actorOf(admin)]) {
      await expect(listFacts(deps, actor, user.id)).rejects.toMatchObject({ code: "not_found" });
    }
    expect(await listFacts(deps, SYSTEM, user.id)).toHaveLength(1);
  });

  it("refuses sensitive-looking keys", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    for (const key of ["income_exact", "religion", "citizenship_status"]) {
      await expect(createFact(deps, actorOf(user), fact(key, "x"))).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("editing supersedes the old fact", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const old = await createFact(deps, actorOf(user), fact("county", "Maple"));
    const next = await updateFact(deps, actorOf(user), old.id, { value: "Travis" });
    expect(next.value).toBe("Travis");
    const listed = await listFacts(deps, actorOf(user), user.id);
    expect(listed.map((f) => f.value)).toEqual(["Travis"]);
    const [oldRow] = await deps.db.select().from(memoryFacts).where(eq(memoryFacts.id, old.id));
    expect(oldRow?.supersededById).toBe(next.id);
  });

  it("creating a fact with an existing key supersedes it", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("county", "Maple"));
    await createFact(deps, actorOf(user), fact("county", "Travis"));
    expect((await listFacts(deps, actorOf(user), user.id)).map((f) => f.value)).toEqual(["Travis"]);
  });

  it("forgetting deletes the fact and its superseded chain", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const a = await createFact(deps, actorOf(user), fact("county", "Maple"));
    const b = await updateFact(deps, actorOf(user), a.id, { value: "Travis" });
    const c = await updateFact(deps, actorOf(user), b.id, { value: "Hays" });
    await forgetFact(deps, actorOf(user), c.id);
    const rows = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.key, "county")));
    expect(rows).toHaveLength(0);
  });

  it("only the owner can edit or forget", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const f = await createFact(deps, actorOf(user), fact("county", "Maple"));
    await expect(updateFact(deps, actorOf(other), f.id, { value: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(forgetFact(deps, actorOf(other), f.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(forgetFact(deps, actorOf(user), "nope")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("candidates", () => {
  it("creates system candidates that expire in 30 days", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect(c).toMatchObject({ status: "candidate", source: "crew_inferred", expiresAt: "2026-11-05T15:00:00.000Z" });
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(1);
    await expect(createCandidate(deps, actorOf(user), user.id, fact("x_y", "z"))).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(createCandidate(deps, SYSTEM, user.id, fact("income_guess", "low"))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("confirming a candidate supersedes the current fact", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("favorite_subject", "Math"));
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    const confirmed = await confirmCandidate(deps, actorOf(user), c.id);
    expect(confirmed).toMatchObject({ status: "confirmed", expiresAt: null, confirmedAt: "2026-10-06T15:00:00.000Z" });
    expect((await listFacts(deps, actorOf(user), user.id)).map((f) => f.value)).toEqual(["Physics"]);
  });

  it("rejecting hides the candidate", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect((await rejectCandidate(deps, actorOf(user), c.id)).status).toBe("rejected");
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(0);
  });

  it("expired candidates are never listed or confirmed", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    clock.set("2026-11-06T15:00:00.000Z");
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(0);
    await expect(confirmCandidate(deps, actorOf(user), c.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("crewVisibleFacts filters by audience, status, and visibility", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("a_crew", "1", "crew"));
    await createFact(deps, actorOf(user), fact("b_family", "2", "crew_family"));
    await createFact(deps, actorOf(user), fact("c_scout", "3", "scout_only"));
    await createFact(deps, actorOf(user), fact("d_private", "4", "private"));
    await createCandidate(deps, SYSTEM, user.id, fact("e_candidate", "5", "crew"));
    expect((await crewVisibleFacts(deps, SYSTEM, user.id, "crew")).map((f) => f.key)).toEqual(["a_crew", "b_family"]);
    expect((await crewVisibleFacts(deps, SYSTEM, user.id, "family")).map((f) => f.key)).toEqual(["b_family"]);
    await expect(crewVisibleFacts(deps, actorOf(user), user.id, "crew")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("renders value text", () => {
    expect(valueText(3.72)).toBe("3.72");
    expect(valueText(true)).toBe("Yes");
    expect(valueText(false)).toBe("No");
    expect(valueText("Maple")).toBe("Maple");
    expect(valueText(["a", "b"])).toBe("a, b");
  });

  it("a confirmed fact retires live candidates for its key (R2C-2)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createCandidate(deps, SYSTEM, user.id, fact("intended_majors", ["Physics"]));
    const confirmed = await createFact(deps, actorOf(user), fact("intended_majors", ["Physics"]));
    const listed = await listFacts(deps, actorOf(user), user.id);
    expect(listed.map((f) => [f.id, f.status])).toEqual([[confirmed.id, "confirmed"]]);
  });

  it("files an identical candidate only once (R2C-15)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const first = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    const again = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect(again.id).toBe(first.id);
    const rows = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.key, "favorite_subject")));
    expect(rows).toHaveLength(1);
  });

  it("files no candidate that matches a confirmed fact", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const confirmed = await createFact(deps, actorOf(user), fact("favorite_subject", "Physics"));
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect(c).toMatchObject({ id: confirmed.id, status: "confirmed" });
    const candidates = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.status, "candidate")));
    expect(candidates).toEqual([]);
  });
});

describe("profile columns follow profile facts (R2I-1)", () => {
  const profileOf = async (deps: ReturnType<typeof createTestDeps>, userId: string) =>
    (await deps.db.select().from(profiles).where(eq(profiles.userId, userId)))[0];

  it("createFact writes the column", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("county", "Travis"));
    expect((await profileOf(deps, user.id))?.county).toBe("Travis");
  });

  it("updateFact writes the new value, GPA stored x100", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const gpa = await createFact(deps, actorOf(user), fact("gpa_unweighted", 3.72));
    await updateFact(deps, actorOf(user), gpa.id, { value: 3.9 });
    expect((await profileOf(deps, user.id))?.gpaUnweightedX100).toBe(390);
  });

  it("confirmCandidate writes the candidate's value and retires the other candidates", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const ok = await createCandidate(deps, SYSTEM, user.id, fact("state", "OK"));
    await createCandidate(deps, SYSTEM, user.id, fact("state", "NM"));
    await confirmCandidate(deps, actorOf(user), ok.id);
    expect((await profileOf(deps, user.id))?.state).toBe("OK");
    expect((await listFacts(deps, actorOf(user), user.id)).map((f) => [f.value, f.status])).toEqual([
      ["OK", "confirmed"],
    ]);
  });

  it("forgetting the current fact clears the column", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const county = await createFact(deps, actorOf(user), fact("county", "Travis"));
    await forgetFact(deps, actorOf(user), county.id);
    expect((await profileOf(deps, user.id))?.county).toBe("");
  });

  it("refuses a value the column can't hold", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(createFact(deps, actorOf(user), fact("state", "Texas"))).rejects.toMatchObject({
      code: "invalid_input",
      message: "That value doesn't fit state",
    });
    expect((await profileOf(deps, user.id))?.state).toBe("TX");
    expect(await listFacts(deps, actorOf(user), user.id)).toEqual([]);
  });
});

describe("round 4 sensitive candidate isolation", () => {
  it("refuses aliases and sensitive terms in otherwise ordinary candidate values", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    for (const key of ["first_gen", "military_family", "is_first_generation", "family_income"])
      await expect(createFact(deps, actorOf(user), fact(key, "x"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createCandidate(deps, SYSTEM, user.id, fact("background", "first-generation"))).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      updateFact(deps, SYSTEM, "00000000-0000-4000-8000-000000000000", { value: "x" }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
